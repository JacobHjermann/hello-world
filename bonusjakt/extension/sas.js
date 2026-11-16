// Searches SAS's award seats on sas.no through the user's own browser session.
// The answers are read in sas-parse.js; this file only does the fetching, pacing and caching.
import { redactPlain } from "./redact.js";
import { SAS_BASE, destinationsUrl, offersUrl, pickDestinations, parseAvailability, parseAwardPrices } from "./sas-parse.js";

const PAUSE_MS = 2500;          // Pause between requests: about the pace of a person clicking around.
const CHUNK = 8;                // Destinations asked about per request.
const MAX_PRICE_LOOKUPS = 6;    // New prices looked up per search, so a run stays light.
const DEST_TTL = 24 * 3600e3;   // The destination list changes rarely.
const PRICE_TTL = 7 * 24 * 3600e3;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class SasBlockedError extends Error {}

async function findOrOpenTab() {
  const [tab] = await chrome.tabs.query({ url: `${SAS_BASE}/*` });
  if (tab) return { tab, opened: false };
  const created = await chrome.tabs.create({ url: `${SAS_BASE}/award-finder`, active: false });
  await waitForLoad(created.id);
  return { tab: created, opened: true };
}

/**
 * Run `fetch` inside a sas.no tab, so the request carries the user's own cookies and login,
 * exactly as when they use the site themselves. Opens a background tab if none is open.
 * Returns status, content type and text; never throws for HTTP errors.
 */
export async function sasRaw(url) {
  const { tab, opened } = await findOrOpenTab();
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "MAIN",
      args: [url],
      func: async (u) => {
        try {
          const res = await fetch(u, { credentials: "include", headers: { accept: "application/json" } });
          return { status: res.status, ok: res.ok, type: res.headers.get("content-type") || "", text: await res.text() };
        } catch (e) { return { status: 0, ok: false, type: "", text: String(e && e.message || e) }; }
      },
    });
    return { ...result, tabPath: new URL(tab.url || tab.pendingUrl || SAS_BASE).pathname };
  } finally {
    if (opened) chrome.tabs.remove(tab.id).catch(() => {});
  }
}

const describe = (url, r) => `${new URL(url).pathname} → ${r.status || "ingen svar"} ${r.type.split(";")[0] || ""}: ${redactPlain(r.text.replace(/\s+/g, " ")).slice(0, 160)}`;

/** Fetch JSON from sas.no; errors say exactly what SAS answered. */
export async function sasFetch(url) {
  const r = await sasRaw(url);
  const isJson = r.type.includes("json");
  if (r.ok && isJson) return JSON.parse(r.text);
  // A check page means SAS wants to confirm a person is there. Stop and say so; never work around it.
  if ((r.status === 403 || r.status === 429 || r.status === 503) && !isJson) {
    throw new SasBlockedError(`SAS ba om å bekrefte at du er et menneske. Åpne sas.no og gjør et vanlig søk, så prøver Bonusjakt igjen ved neste runde. (${describe(url, r)})`);
  }
  if (r.status === 401) throw new Error(`SAS krever innlogging for dette søket. Logg inn på sas.no og prøv igjen. (${describe(url, r)})`);
  throw new Error(`Uventet svar fra SAS. Send denne meldingen til Claude: ${describe(url, r)}`);
}

/** Two small test requests, for the "Test SAS-koblingen" button. */
export async function diagnose() {
  const lines = [];
  const tests = [
    destinationsUrl("OSL"),
    destinationsUrl("OSL", ["HND"], { availability: true }),
    destinationsUrl("OSL", ["HND", "ICN"], { availability: true }),
    offersUrl("OSL", "HND", new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10)),
  ];
  for (const url of tests) {
    const r = await sasRaw(url);
    let count = "";
    try { const j = JSON.parse(r.text); count = Array.isArray(j) ? ` (${j.length} destinasjoner)` : ""; } catch { /* not JSON */ }
    lines.push(`${describe(url, r)}${count}${url.includes(",") ? "  [flere destinasjoner]" : ""}`);
    await sleep(PAUSE_MS);
  }
  return lines.join("\n\n");
}

function waitForLoad(tabId) {
  return new Promise((resolve) => {
    const done = (id, info) => {
      if (id === tabId && info.status === "complete") { chrome.tabs.onUpdated.removeListener(done); setTimeout(resolve, 2000); }
    };
    chrome.tabs.onUpdated.addListener(done);
    setTimeout(() => { chrome.tabs.onUpdated.removeListener(done); resolve(); }, 30000);
  });
}

async function cached(key, ttl, load) {
  const { [key]: hit } = await chrome.storage.local.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.value;
  const value = await load();
  await chrome.storage.local.set({ [key]: { at: Date.now(), value } });
  return value;
}

/**
 * priceLookups: how many new routes to price during a search. Automatic runs use a few so alerts carry
 * points; the search button uses 0 and prices the results afterwards (see lookupPrices).
 */
export function createSasProvider({ fetchJson = sasFetch, priceLookups = MAX_PRICE_LOOKUPS } = {}) {
  let calls = 0;
  const get = async (url) => { if (calls++) await sleep(PAUSE_MS); return fetchJson(url); };

  let listsWork = true; // Does SAS accept several destinations in one request? Assume yes until it fails.

  async function oneByOne(origin, codes) {
    const all = [];
    for (const c of codes) all.push(...(await get(destinationsUrl(origin, [c], { availability: true }))));
    return all;
  }

  async function availability(origin, codes) {
    if (codes.length === 1 || !listsWork) return oneByOne(origin, codes);
    let res;
    try {
      res = await get(destinationsUrl(origin, codes, { availability: true }));
    } catch {
      // A list request that fails (while single ones work) means lists aren't supported.
      listsWork = false;
      return oneByOne(origin, codes);
    }
    // Exactly one destination back when asking for several also means no list support.
    if (Array.isArray(res) && res.length === 1) { listsWork = false; return oneByOne(origin, codes); }
    return res;
  }

  const destinations = (origin) => cached(`sasDest:${origin}`, DEST_TTL, () => get(destinationsUrl(origin)));

  /**
   * Award prices per route ("OSL-HND"), from the cache or looked up on the booking page, at most
   * `limit` new lookups. A route whose price can't be found maps to null.
   */
  async function lookupPrices(routes, limit = Infinity) {
    const { sasPrices = {} } = await chrome.storage.local.get("sasPrices");
    const out = {};
    let lookups = 0;
    for (const { origin, dest, date } of routes) {
      const route = `${origin}-${dest}`;
      if (route in out) continue;
      const known = sasPrices[route];
      if (known && Date.now() - known.at < PRICE_TTL) { out[route] = known.prices; continue; }
      if (lookups >= limit) continue;
      lookups++;
      try {
        const prices = parseAwardPrices(await get(offersUrl(origin, dest, date)));
        if (Object.keys(prices).length) { sasPrices[route] = { at: Date.now(), prices }; out[route] = prices; }
        else out[route] = null;
      } catch {
        // A missing price never stops anything: the seat is shown with a link to Award Finder.
        out[route] = null;
      }
    }
    await chrome.storage.local.set({ sasPrices });
    return out;
  }

  return {
    name: "sas.no",
    live: true,
    destinations,
    lookupPrices,
    async fetchTrips({ origin, region, dest, cabins, start, end }) {
      calls = 0;
      const dests = pickDestinations(await destinations(origin), { region, dest });
      const trips = [];
      for (let i = 0; i < dests.length; i += CHUNK) {
        const codes = dests.slice(i, i + CHUNK).map((d) => d.airportCode);
        trips.push(...parseAvailability(await availability(origin, codes), { origin, start, end }));
      }
      const wanted = trips.filter((t) => cabins.includes(t.cabin));
      const prices = await lookupPrices(wanted.map(({ origin: o, dest: d, date }) => ({ origin: o, dest: d, date })), priceLookups);
      for (const t of wanted) {
        const p = prices[`${t.origin}-${t.dest}`]?.[t.cabin];
        if (p) Object.assign(t, { pts: p.pts, taxes: p.taxes, taxCurrency: p.currency });
      }
      return wanted;
    },
  };
}
