import { ChromeStore } from "./store.js";
import { Scheduler } from "./shared/scheduler.js";
import { runSearch, normalizeParams, describeParams, todayIso } from "./shared/search.js";
import { REGIONS, ORIGINS, CITIES } from "./shared/airports.js";
import { createDemoProvider } from "./shared/providers/demo.js";
import { createSasProvider, diagnose } from "./sas.js";
import { destinationChoices, awardFinderUrl } from "./sas-parse.js";

const ALARM = "bonusjakt";
const INTERVAL_MIN = 180;

// ---------- Notifications (desktop + optional Telegram) ----------
const notifier = {
  async send(settings, msg) {
    const results = [];
    if (settings.channels.desktop) {
      try {
        // requireInteraction keeps the notice on screen until it is clicked away.
        await chrome.notifications.create(`bj-${Date.now()}`, { type: "basic", iconUrl: "icons/icon128.png", title: msg.subject, message: msg.short.slice(0, 300), priority: 2, requireInteraction: true });
        results.push({ channel: "desktop", ok: true });
      } catch (err) { results.push({ channel: "desktop", ok: false, error: err.message }); }
    }
    if (settings.channels.telegram) {
      try {
        if (!settings.telegramToken || !settings.telegramChatId) throw new Error("Token eller chat-ID mangler.");
        const res = await fetch(`https://api.telegram.org/bot${settings.telegramToken}/sendMessage`, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ chat_id: settings.telegramChatId, text: `${msg.subject}\n\n${msg.text}` }),
        });
        if (!res.ok) throw new Error(`Telegram svarte ${res.status}`);
        results.push({ channel: "telegram", ok: true });
      } catch (err) { results.push({ channel: "telegram", ok: false, error: err.message }); }
    }
    return results;
  },
};
chrome.notifications.onClicked.addListener((id) => {
  chrome.tabs.create({ url: awardFinderUrl("OSL") });
  chrome.notifications.clear(id);
});

const providerFor = (settings) => (settings.demo ? createDemoProvider() : createSasProvider());

async function scheduler() {
  const store = await ChromeStore.load();
  return { store, s: new Scheduler({ store, provider: providerFor(store.settings), notifier, intervalHours: INTERVAL_MIN / 60 }) };
}

// ---------- Schedule ----------
async function ensureAlarm() {
  const a = await chrome.alarms.get(ALARM);
  if (!a) chrome.alarms.create(ALARM, { delayInMinutes: 1, periodInMinutes: INTERVAL_MIN });
}
chrome.runtime.onInstalled.addListener(ensureAlarm);
chrome.runtime.onStartup.addListener(ensureAlarm);

let running = null;
async function runAll(reason) {
  running ??= (async () => {
    const { store, s } = await scheduler();
    try { return await s.runAll(reason); } finally { await store.flush(); running = null; }
  })();
  return running;
}
chrome.alarms.onAlarm.addListener((a) => { if (a.name === ALARM) runAll("automatisk"); });

// ---------- Searches started from the page: progress and cancelling ----------
let job = null;
/** Run one search job; a new one replaces (cancels) the one before. Progress goes to the open page. */
async function withJob(kind, fn) {
  job?.controller.abort();
  const controller = new AbortController();
  const mine = { kind, controller };
  job = mine;
  const send = (p) => chrome.runtime.sendMessage({ type: "progress", kind, ...p }).catch(() => { /* page closed */ });
  try {
    return await fn(controller.signal, send);
  } finally {
    if (job === mine) job = null;
    send({ finished: true });
  }
}

// ---------- Messages from the Bonusjakt page ----------
const handlers = {
  async status() {
    const store = await ChromeStore.load();
    const alarm = await chrome.alarms.get(ALARM);
    return {
      settings: store.settings, runs: store.runs, nextRun: alarm ? new Date(alarm.scheduledTime).toISOString() : null,
      intervalHours: INTERVAL_MIN / 60, running: Boolean(running), today: todayIso(),
      origins: ORIGINS, regions: Object.fromEntries(Object.entries(REGIONS).map(([k, v]) => [k, v.name])),
      watches: store.watches.map((w) => ({ id: w.id, name: w.name, params: w.params, summary: describeParams(w.params), lastRun: w.lastRun, lastHitCount: w.lastHitCount, lastError: w.lastError })),
    };
  },
  // The search button shows seats first; points are filled in afterwards with prices().
  async search({ params }) {
    const store = await ChromeStore.load();
    return withJob("search", (signal, onProgress) => {
      const provider = store.settings.demo ? createDemoProvider() : createSasProvider({ priceLookups: 0, signal, onProgress });
      return runSearch(provider, params, { today: todayIso() });
    });
  },
  async prices({ routes }) {
    const store = await ChromeStore.load();
    if (store.settings.demo) return {};
    return withJob("prices", (signal, onProgress) => createSasProvider({ signal, onProgress }).lookupPrices(routes));
  },
  // "Avbryt søk": stops the running search or price lookup after the request in flight.
  async cancel() {
    job?.controller.abort();
    return { cancelled: Boolean(job) };
  },
  // Destinations for the "Til" field: SAS's own Award Finder list for the chosen origin.
  async destinations({ origin }) {
    const store = await ChromeStore.load();
    if (store.settings.demo) {
      return Object.entries(CITIES).filter(([c]) => !ORIGINS[c]).map(([code, city]) => ({ code, city, airport: city, country: "", region: null }));
    }
    const { own, partners } = await createSasProvider().choices(origin);
    return destinationChoices(own, partners);
  },
  async addWatch({ params, name, destName }) {
    const store = await ChromeStore.load();
    const p = normalizeParams(params);
    const place = p.dest ? destName || p.dest : p.region === "all" ? "Hele verden" : REGIONS[p.region].name;
    const home = ORIGINS[p.from];
    const auto = p.tripType === "home" ? `${place} → ${home}` : p.tripType === "round" ? `${home} ⇄ ${place}` : `${home} → ${place}`;
    const w = store.addWatch(p, String(name || auto).slice(0, 80));
    await store.flush();
    return { id: w.id, name: w.name };
  },
  async removeWatch({ id }) {
    const store = await ChromeStore.load();
    store.removeWatch(id);
    await store.flush();
    return { ok: true };
  },
  async saveSettings({ patch }) {
    const store = await ChromeStore.load();
    const s = store.updateSettings(patch);
    await store.flush();
    return s;
  },
  async run() { return { summary: await runAll("manuelt") }; },
  async testNotify() {
    const store = await ChromeStore.load();
    const results = await notifier.send(store.settings, {
      subject: "Bonusjakt: testvarsel",
      text: "Dette er en test. Slik ser varslene ut når en reise blir ledig.",
      short: "Dette er en test. Slik ser varslene ut når en reise blir ledig.",
    });
    if (!results.length) throw new Error("Ingen varslingskanal er slått på.");
    return { results };
  },
  async diagnose() { return { report: await diagnose() }; },
};

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  const h = handlers[msg?.type];
  if (!h) return false;
  h(msg).then((data) => reply({ ok: true, data }), (err) => reply({ ok: false, error: err.message }));
  return true; // answer asynchronously
});
