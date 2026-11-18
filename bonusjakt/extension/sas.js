// Searches SAS's award seats on sas.no through the user's own browser session.
// The answers are read in sas-parse.js; this file only does the fetching, pacing and caching.
import { redactPlain } from "./redact.js";
import {
  SAS_BASE, AWARD_APP, destinationsUrl, offersUrl, pickDestinations, parseAvailability, parseAwardPrices,
  partnerLocationsUrl, partnerFlightsUrl, parsePartnerFlights, partnerLocationChoices,
} from "./sas-parse.js";

const PAUSE_MS = 2500;          // Pause between requests: about the pace of a person clicking around.
const CHUNK = 8;                // Destinations asked about per request.
const MAX_PRICE_LOOKUPS = 6;    // New prices looked up per search, so a run stays light.
const DEST_TTL = 24 * 3600e3;   // The destination list changes rarely.
const PRICE_TTL = 7 * 24 * 3600e3;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const addDays = (iso, n) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const daysBetween = (a, b) => Math.round((new Date(b + "T12:00:00Z") - new Date(a + "T12:00:00Z")) / 86400000);
const minIso = (a, b) => (a < b ? a : b);

export class SasBlockedError extends Error {}
export class SearchCancelled extends Error {
  constructor() { super("Søket ble avbrutt."); }
}

/** Pause that ends early (with SearchCancelled) when the search is cancelled. */
const pause = (ms, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) return reject(new SearchCancelled());
  const t = setTimeout(resolve, ms);
  signal?.addEventListener("abort", () => { clearTimeout(t); reject(new SearchCancelled()); }, { once: true });
});

/**
 * Counts the requests a search will make and has made, for the progress bar.
 * `add` grows the plan (it can grow mid-search, e.g. when SAS doesn't take lists), `step` marks one done.
 */
function progressTracker(onProgress) {
  const p = { done: 0, total: 0, phase: "" };
  const emit = () => onProgress?.({ done: p.done, total: Math.max(p.total, p.done), phase: p.phase });
  return {
    add(n) { p.total += n; emit(); },
    step() { p.done++; emit(); },
    phase(text) { p.phase = text; emit(); },
  };
}

function runInTab(tabId, url) {
  return chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    args: [url],
    func: async (u) => {
      try {
        const res = await fetch(u, { credentials: "include", headers: { accept: "application/json" } });
        return { status: res.status, ok: res.ok, type: res.headers.get("content-type") || "", text: await res.text() };
      } catch (e) { return { status: 0, ok: false, type: "", text: String((e && e.message) || e) }; }
    },
  }).then(([r]) => r.result);
}

/**
 * Run `fetch` inside a sas.no tab, so the request carries the user's own cookies and login,
 * exactly as when they use the site themselves. Tabs that can't be used (an error page, still
 * loading) are skipped; if none works, a background tab is opened and closed again afterwards.
 * Returns status, content type and text; never throws for HTTP errors.
 */
export async function sasRaw(url) {
  for (const tab of await chrome.tabs.query({ url: `${SAS_BASE}/*` })) {
    try { return { ...(await runInTab(tab.id, url)), tabPath: new URL(tab.url || SAS_BASE).pathname }; } catch { /* try the next tab */ }
  }
  const tab = await chrome.tabs.create({ url: `${SAS_BASE}/award-finder`, active: false });
  try {
    await waitForLoad(tab.id);
    return { ...(await runInTab(tab.id, url)), tabPath: "/award-finder (åpnet av Bonusjakt)" };
  } catch (err) {
    throw new Error(`Fikk ikke åpnet sas.no i en fane: ${err.message}. Åpne sas.no selv og prøv igjen.`);
  } finally {
    chrome.tabs.remove(tab.id).catch(() => {});
  }
}

const describe = (url, r) => `${new URL(url).pathname} → ${r.status || "ingen svar"} ${r.type.split(";")[0] || ""}: ${redactPlain(r.text.replace(/\s+/g, " ")).slice(0, 160)}`;

/** Fetch JSON from sas.no; errors say exactly what SAS answered. */
export async function sasFetch(url) {
  return interpret(url, await sasRaw(url));
}

function interpret(url, r) {
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
/**
 * Requests to sas.no's award booking service (/award-api) need the headers the sas.no page itself
 * sends, including the login. session-main.js notes them in the page; this runs the request in a
 * tab that has them. If no tab has them yet, it opens the award booking page in the background so
 * the page sets itself up, and waits for it.
 */
async function awardRequestInTab(tabId, url) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    args: [url],
    func: async (u) => {
      const h = window.__bonusjaktAwardHeaders;
      if (!h) return null;
      try {
        const res = await fetch(u, { credentials: "include", headers: { accept: "application/json, text/plain, */*", ...h, "sas-correlation-id": crypto.randomUUID() } });
        return { status: res.status, ok: res.ok, type: res.headers.get("content-type") || "", text: await res.text() };
      } catch (e) { return { status: 0, ok: false, type: "", text: String((e && e.message) || e) }; }
    },
  });
  return result;
}

export async function awardFetch(url) {
  for (const tab of await chrome.tabs.query({ url: `${SAS_BASE}/*` })) {
    const r = await awardRequestInTab(tab.id, url).catch(() => null);
    if (r) return interpret(url, r);
  }
  const tab = await chrome.tabs.create({ url: AWARD_APP, active: false });
  try {
    await waitForLoad(tab.id);
    for (let i = 0; i < 10; i++) {
      const r = await awardRequestInTab(tab.id, url).catch(() => null);
      if (r) return interpret(url, r);
      await sleep(1500);
    }
    throw new Error("Fikk ikke kontakt med SAS sin bestilling av partnerbonusreiser. Er du logget inn på sas.no? Logg inn og prøv igjen.");
  } finally {
    chrome.tabs.remove(tab.id).catch(() => {});
  }
}

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
export function createSasProvider({ fetchJson = sasFetch, fetchAward = awardFetch, priceLookups = MAX_PRICE_LOOKUPS, signal, onProgress, pauseMs = PAUSE_MS } = {}) {
  let calls = 0;
  const track = progressTracker(onProgress);
  const check = () => { if (signal?.aborted) throw new SearchCancelled(); };
  const request = async (fn, url) => {
    check();
    if (calls++) await pause(pauseMs, signal);
    try { return await fn(url); } finally { track.step(); check(); }
  };
  const get = (url) => request(fetchJson, url);
  const getAward = (url) => request(fetchAward, url);
  let oneWayWorks = true;

  const partnerLocations = () => cached("sasPartnerLocations", DEST_TTL, () => getAward(partnerLocationsUrl()));

  const parse = (answer, side, dir, ctx, date) =>
    parsePartnerFlights(answer, { side, dir, away: ctx.dest, destName: ctx.destName }).filter((t) => t.date === date);

  /** One direction, one request per day: one-way if SAS takes it, else the round-trip form the site uses. */
  async function partnerOneWay(ctx, dir, date) {
    const { origin, dest, pax } = ctx;
    if (oneWayWorks) {
      try {
        const [o, d] = dir === "out" ? [origin, dest] : [dest, origin];
        return parse(await getAward(partnerFlightsUrl(o, d, date, { pax, oneWay: true })), "outboundFlights", dir, ctx, date);
      } catch (err) {
        if (err instanceof SasBlockedError || err instanceof SearchCancelled) throw err;
        oneWayWorks = false;
        track.add(1); // the same day again, in the round-trip form
      }
    }
    if (dir === "out") {
      return parse(await getAward(partnerFlightsUrl(origin, dest, date, { pax, oneWay: false })), "outboundFlights", "out", ctx, date);
    }
    // Home only: a round trip that comes home on `date`, reading just the home side.
    const answer = await getAward(partnerFlightsUrl(origin, dest, addDays(date, -7), { pax, oneWay: false, inboundDate: date }));
    return parse(answer, "inboundFlights", "home", ctx, date);
  }

  /**
   * Partner award seats to (and/or from) one destination. A round trip pairs day i out with day i
   * home in one request, the way the site searches, so both directions cost one request per day.
   */
  async function partnerTrips(ctx) {
    const { dirs, start, end, backStart, backEnd } = ctx;
    const trips = [];
    if (dirs.includes("out") && dirs.includes("home")) {
      const days = Math.max(daysBetween(start, end), daysBetween(backStart, backEnd));
      track.add(days + 1);
      for (let i = 0; i <= days; i++) {
        track.phase(`Partnerfly: dag ${i + 1} av ${days + 1}`);
        const out = minIso(addDays(start, i), end), home = minIso(addDays(backStart, i), backEnd);
        const answer = await getAward(partnerFlightsUrl(ctx.origin, ctx.dest, out, { pax: ctx.pax, oneWay: false, inboundDate: home }));
        trips.push(...parse(answer, "outboundFlights", "out", ctx, out), ...parse(answer, "inboundFlights", "home", ctx, home));
      }
      return trips;
    }
    const dir = dirs.includes("home") ? "home" : "out";
    const [from, to] = dir === "out" ? [start, end] : [backStart, backEnd];
    const total = daysBetween(from, to) + 1;
    track.add(total);
    let n = 0;
    for (let date = from; date <= to; date = addDays(date, 1)) {
      track.phase(`Partnerfly ${dir === "home" ? "hjem" : "ut"}: dag ${++n} av ${total}`);
      trips.push(...(await partnerOneWay(ctx, dir, date)));
    }
    return trips;
  }

  let listsWork = true; // Does SAS accept several destinations in one request? Assume yes until it fails.

  async function oneByOne(origin, codes) {
    track.add(codes.length);
    const all = [];
    for (const c of codes) all.push(...(await get(destinationsUrl(origin, [c], { availability: true }))));
    return all;
  }

  async function availability(origin, codes) {
    if (codes.length === 1 || !listsWork) { track.add(-1); return oneByOne(origin, codes); }
    let res;
    try {
      res = await get(destinationsUrl(origin, codes, { availability: true }));
    } catch (err) {
      if (err instanceof SearchCancelled || err instanceof SasBlockedError) throw err;
      // A list request that fails (while single ones work) means lists aren't supported.
      listsWork = false;
      return oneByOne(origin, codes);
    }
    // Exactly one destination back when asking for several also means no list support.
    if (Array.isArray(res) && res.length === 1) { listsWork = false; return oneByOne(origin, codes); }
    return res;
  }

  const destinations = (origin) => cached(`sasDest:${origin}`, DEST_TTL, () => { track.add(1); track.phase("Henter SAS sine destinasjoner"); return get(destinationsUrl(origin)); });

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
      track.add(1);
      track.phase(`Poengpris: ${origin}–${dest}`);
      try {
        const prices = parseAwardPrices(await get(offersUrl(origin, dest, date)));
        if (Object.keys(prices).length) { sasPrices[route] = { at: Date.now(), prices }; out[route] = prices; }
        else out[route] = null;
      } catch (err) {
        if (err instanceof SearchCancelled) { await chrome.storage.local.set({ sasPrices }); throw err; }
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
    /** Destination choices for the picker: SAS's own plus partner cities (if the partner list loads). */
    async choices(origin) {
      const own = await destinations(origin);
      let partners = [];
      try { partners = partnerLocationChoices(await partnerLocations()); } catch { /* SAS's own only */ }
      return { own, partners };
    },
    async fetchTrips({ origin, region, dest, cabins, partners = true, pax = 1, dirs = ["out"], start, end, backStart, backEnd }) {
      calls = 0;
      const all = await destinations(origin);
      const dests = pickDestinations(all, { region, dest });
      const trips = [];
      track.add(Math.ceil(dests.length / CHUNK));
      for (let i = 0; i < dests.length; i += CHUNK) {
        track.phase(`SAS sine fly: ${Math.min(i + CHUNK, dests.length)} av ${dests.length} destinasjoner`);
        const codes = dests.slice(i, i + CHUNK).map((d) => d.airportCode);
        trips.push(...parseAvailability(await availability(origin, codes), { origin, start, end, backStart, backEnd, dirs }));
      }
      // Partner award seats are searched one route and one day at a time, so only for a chosen destination.
      if (dest && partners) {
        const destName = dests[0]?.cityName;
        trips.push(...(await partnerTrips({ origin, dest, pax, destName, dirs, start, end, backStart, backEnd })));
      }
      const wanted = trips.filter((t) => cabins.includes(t.cabin));
      const unpriced = wanted.filter((t) => t.pts == null);
      const prices = await lookupPrices(unpriced.map(({ origin: o, dest: d, date }) => ({ origin: o, dest: d, date })), priceLookups);
      for (const t of unpriced) {
        const p = prices[`${t.origin}-${t.dest}`]?.[t.cabin];
        if (p) Object.assign(t, { pts: p.pts, taxes: p.taxes, taxCurrency: p.currency });
      }
      return wanted;
    },
  };
}
