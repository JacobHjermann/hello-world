// Searches SAS's award seats on sas.no through the user's own browser session.
// The answers are read in sas-parse.js; this file only does the fetching, pacing and caching.
import { SAS_BASE, destinationsUrl, offersUrl, pickDestinations, parseAvailability, parseAwardPrices } from "./sas-parse.js";

const PAUSE_MS = 2500;          // Pause between requests: about the pace of a person clicking around.
const CHUNK = 8;                // Destinations asked about per request.
const MAX_PRICE_LOOKUPS = 6;    // New prices looked up per search, so a run stays light.
const DEST_TTL = 24 * 3600e3;   // The destination list changes rarely.
const PRICE_TTL = 7 * 24 * 3600e3;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class SasBlockedError extends Error {}

/**
 * Run `fetch` inside a sas.no tab, so the request carries the user's own cookies and login,
 * exactly as when they use the site themselves. Opens a background tab if none is open.
 */
export async function sasFetch(url) {
  let [tab] = await chrome.tabs.query({ url: `${SAS_BASE}/*` });
  let opened = false;
  if (!tab) {
    tab = await chrome.tabs.create({ url: `${SAS_BASE}/award-finder`, active: false });
    opened = true;
    await waitForLoad(tab.id);
  }
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "MAIN",
      args: [url],
      func: async (u) => {
        const res = await fetch(u, { credentials: "include", headers: { accept: "application/json" } });
        return { status: res.status, ok: res.ok, type: res.headers.get("content-type") || "", text: await res.text() };
      },
    });
    // A check page instead of data means SAS wants to confirm a person is there. Stop and say so; never work around it.
    if (result.status === 403 || result.status === 429 || !result.type.includes("json")) {
      throw new SasBlockedError("SAS ba om å bekrefte at du er et menneske, eller svarte ikke med data. Åpne sas.no, logg inn og gjør et vanlig søk. Bonusjakt prøver igjen ved neste runde.");
    }
    if (!result.ok) throw new Error(`SAS svarte med feil ${result.status}.`);
    return JSON.parse(result.text);
  } finally {
    if (opened) chrome.tabs.remove(tab.id).catch(() => {});
  }
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

export function createSasProvider({ fetchJson = sasFetch } = {}) {
  let calls = 0;
  const get = async (url) => { if (calls++) await sleep(PAUSE_MS); return fetchJson(url); };

  async function availability(origin, codes) {
    const res = await get(destinationsUrl(origin, codes, { availability: true }));
    // If SAS answers with exactly one destination when asked for several, it does not take a list:
    // ask one at a time instead. (An empty answer just means no seats.)
    if (codes.length > 1 && Array.isArray(res) && res.length === 1) {
      const all = [];
      for (const c of codes) all.push(...(await get(destinationsUrl(origin, [c], { availability: true }))));
      return all;
    }
    return res;
  }

  async function addPrices(trips) {
    const { sasPrices = {} } = await chrome.storage.local.get("sasPrices");
    let lookups = 0;
    const byRoute = new Map();
    for (const t of trips) if (!byRoute.has(`${t.origin}-${t.dest}`)) byRoute.set(`${t.origin}-${t.dest}`, t);
    for (const [route, t] of byRoute) {
      const known = sasPrices[route];
      if (known && Date.now() - known.at < PRICE_TTL) continue;
      if (lookups >= MAX_PRICE_LOOKUPS) break;
      lookups++;
      try {
        const prices = parseAwardPrices(await get(offersUrl(t.origin, t.dest, t.date)));
        if (Object.keys(prices).length) sasPrices[route] = { at: Date.now(), prices };
      } catch (err) {
        if (err instanceof SasBlockedError) throw err;
        // A missing price is not fatal: the seat is shown with "poengpris på sas.no".
      }
    }
    await chrome.storage.local.set({ sasPrices });
    for (const t of trips) {
      const p = sasPrices[`${t.origin}-${t.dest}`]?.prices?.[t.cabin];
      if (p) { t.pts = p.pts; t.taxes = p.taxes; t.taxCurrency = p.currency; }
    }
    return trips;
  }

  return {
    name: "sas.no",
    live: true,
    async fetchTrips({ origin, region, cabins, start, end }) {
      calls = 0;
      const all = await cached(`sasDest:${origin}`, DEST_TTL, () => get(destinationsUrl(origin)));
      const dests = pickDestinations(all, { region });
      const trips = [];
      for (let i = 0; i < dests.length; i += CHUNK) {
        const codes = dests.slice(i, i + CHUNK).map((d) => d.airportCode);
        trips.push(...parseAvailability(await availability(origin, codes), { origin, start, end }));
      }
      return addPrices(trips.filter((t) => cabins.includes(t.cabin)));
    },
  };
}
