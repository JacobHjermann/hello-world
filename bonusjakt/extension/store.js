// Same interface as src/store.js, but kept in chrome.storage.local so it survives browser restarts.
const DEFAULTS = () => ({
  settings: {
    demo: true,
    channels: { desktop: true, telegram: false },
    telegramToken: "",
    telegramChatId: "",
  },
  watches: [],
  runs: { lastRun: null, lastError: null, lastDurationMs: null },
});

export class ChromeStore {
  static async load() {
    const { db } = await chrome.storage.local.get("db");
    const s = new ChromeStore();
    const d = DEFAULTS();
    s.data = db
      ? { settings: { ...d.settings, ...db.settings, channels: { ...d.settings.channels, ...db.settings?.channels } }, watches: db.watches || [], runs: { ...d.runs, ...db.runs } }
      : d;
    return s;
  }

  save() { this.pending = chrome.storage.local.set({ db: this.data }); return this.pending; }
  flush() { return this.pending || Promise.resolve(); }

  get settings() { return this.data.settings; }
  updateSettings(patch) {
    const s = this.data.settings;
    this.data.settings = { ...s, ...patch, channels: { ...s.channels, ...(patch.channels || {}) } };
    this.save();
    return this.data.settings;
  }

  get watches() { return this.data.watches; }
  addWatch(params, name) {
    const w = { id: crypto.randomUUID(), name, params, createdAt: new Date().toISOString(), lastRun: null, lastHitCount: 0, lastError: null, notified: [] };
    this.data.watches.unshift(w);
    this.save();
    return w;
  }
  removeWatch(id) {
    const before = this.data.watches.length;
    this.data.watches = this.data.watches.filter((w) => w.id !== id);
    this.save();
    return this.data.watches.length < before;
  }

  get runs() { return this.data.runs; }
  setRun(patch) { Object.assign(this.data.runs, patch); this.save(); }
}
