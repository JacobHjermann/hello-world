// Searches flysas.com through the user's own browser session.
//
// STATUS: not finished. How flysas.com asks for and returns award seats could not be seen while
// building this (SAS blocks the build environment). The recorder in this extension captures one
// real search; from that recording, `buildRequests` and `parseResponse` below get written.

export class SasNotReadyError extends Error {}

const SAS_ORIGIN = "https://www.flysas.com";
const PAUSE_MS = 4000; // Pause between requests so the search looks like a person clicking, and stays light.

/**
 * Run `fetch` inside a flysas.com tab, so the request carries the user's own cookies and login,
 * exactly as when they search on the site themselves. Opens a background tab if none is open.
 */
export async function sasFetch(url, init = {}) {
  let [tab] = await chrome.tabs.query({ url: `${SAS_ORIGIN}/*` });
  let opened = false;
  if (!tab) {
    tab = await chrome.tabs.create({ url: `${SAS_ORIGIN}/no-no/`, active: false });
    opened = true;
    await waitForLoad(tab.id);
  }
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "MAIN",
      args: [url, init],
      func: async (u, i) => {
        const res = await fetch(u, { credentials: "include", ...i });
        return { status: res.status, ok: res.ok, text: await res.text() };
      },
    });
    if (result.status === 403) throw new Error("SAS avviste søket (403). Åpne flysas.com og sjekk at du ikke må bekrefte at du er et menneske.");
    if (!result.ok) throw new Error(`SAS svarte med feil ${result.status}.`);
    return JSON.parse(result.text);
  } finally {
    if (opened) chrome.tabs.remove(tab.id).catch(() => {});
  }
}

function waitForLoad(tabId) {
  return new Promise((resolve) => {
    const done = (id, info) => {
      if (id === tabId && info.status === "complete") { chrome.tabs.onUpdated.removeListener(done); setTimeout(resolve, 1500); }
    };
    chrome.tabs.onUpdated.addListener(done);
    setTimeout(() => { chrome.tabs.onUpdated.removeListener(done); resolve(); }, 30000);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Which requests to send for one search. Written from the recorded search. */
// eslint-disable-next-line no-unused-vars
function buildRequests(query) {
  throw new SasNotReadyError("SAS-koblingen er ikke ferdig ennå. Ta opp ett bonussøk på flysas.com (se «Datakilde» i Bonusjakt) og send opptaket til Claude.");
}

/** Turn one SAS response into trips in the shared format (see src/providers/demo.js). */
// eslint-disable-next-line no-unused-vars
function parseResponse(json, query) {
  return [];
}

export function createSasProvider() {
  return {
    name: "flysas.com",
    live: true,
    async fetchTrips(query) {
      const trips = [];
      const requests = buildRequests(query);
      for (const [i, req] of requests.entries()) {
        if (i) await sleep(PAUSE_MS);
        trips.push(...parseResponse(await sasFetch(req.url, req.init), query));
      }
      return trips;
    },
  };
}
