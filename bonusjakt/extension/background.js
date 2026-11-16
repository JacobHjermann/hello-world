import { ChromeStore } from "./store.js";
import { Scheduler } from "./shared/scheduler.js";
import { runSearch, normalizeParams, describeParams, todayIso } from "./shared/search.js";
import { REGIONS, ORIGINS, CITIES } from "./shared/airports.js";
import { createDemoProvider } from "./shared/providers/demo.js";
import { createSasProvider, diagnose } from "./sas.js";
import { destinationChoices, awardFinderUrl } from "./sas-parse.js";
import { redactEntry } from "./redact.js";

const ALARM = "bonusjakt";
const INTERVAL_MIN = 180;
// Temporary: recording one partner award search on sas.no, to learn how partner seats are fetched.
const MAX_RECORDINGS = 150;
let recordQueue = Promise.resolve();

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
    const provider = store.settings.demo ? createDemoProvider() : createSasProvider({ priceLookups: 0 });
    return runSearch(provider, params, { today: todayIso() });
  },
  async prices({ routes }) {
    const store = await ChromeStore.load();
    if (store.settings.demo) return {};
    return createSasProvider().lookupPrices(routes);
  },
  // Destinations for the "Til" field: SAS's own Award Finder list for the chosen origin.
  async destinations({ origin }) {
    const store = await ChromeStore.load();
    if (store.settings.demo) {
      return Object.entries(CITIES).filter(([c]) => !ORIGINS[c]).map(([code, city]) => ({ code, city, airport: city, country: "", region: null }));
    }
    return destinationChoices(await createSasProvider().destinations(origin));
  },
  async addWatch({ params, name, destName }) {
    const store = await ChromeStore.load();
    const p = normalizeParams(params);
    const region = p.dest ? destName || p.dest : p.region === "all" ? "Hele verden" : REGIONS[p.region].name;
    const w = store.addWatch(p, String(name || `${ORIGINS[p.from]} → ${region}`).slice(0, 80));
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
  async recStatus() { const { recording = false, recordings = [] } = await chrome.storage.local.get(["recording", "recordings"]); return { recording, count: recordings.length }; },
  async setRecording({ on }) { await chrome.storage.local.set({ recording: Boolean(on) }); return { ok: true }; },
  // Answers arrive in bursts; saving them one at a time keeps any from being lost.
  recorded({ entry }) {
    recordQueue = recordQueue.then(async () => {
      const { recording, recordings = [] } = await chrome.storage.local.get(["recording", "recordings"]);
      if (!recording) return { ok: false };
      recordings.push(redactEntry(entry));
      await chrome.storage.local.set({ recordings: recordings.slice(-MAX_RECORDINGS) });
      return { ok: true };
    }).catch(() => ({ ok: false }));
    return recordQueue;
  },
  async getRecordings() { const { recordings = [] } = await chrome.storage.local.get("recordings"); return { recordings }; },
  async clearRecordings() { await chrome.storage.local.set({ recordings: [] }); return { ok: true }; },
};

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  const h = handlers[msg?.type];
  if (!h) return false;
  h(msg).then((data) => reply({ ok: true, data }), (err) => reply({ ok: false, error: err.message }));
  return true; // answer asynchronously
});
