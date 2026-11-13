import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const DEFAULTS = () => ({
  settings: {
    email: "",
    phone: "",
    telegramChatId: "",
    channels: { email: true, sms: false, telegram: false },
  },
  watches: [],
  runs: { lastRun: null, lastError: null, lastDurationMs: null },
});

// Small JSON-file store. A personal tool has a handful of watches, so a database is not needed.
export class Store {
  constructor(dir) {
    this.file = path.join(dir, "db.json");
    mkdirSync(dir, { recursive: true });
    this.data = DEFAULTS();
    if (existsSync(this.file)) {
      const saved = JSON.parse(readFileSync(this.file, "utf8"));
      const d = DEFAULTS();
      this.data = {
        settings: { ...d.settings, ...saved.settings, channels: { ...d.settings.channels, ...saved.settings?.channels } },
        watches: saved.watches || [],
        runs: { ...d.runs, ...saved.runs },
      };
    }
  }

  save() {
    const tmp = this.file + ".tmp";
    writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    renameSync(tmp, this.file);
  }

  get settings() { return this.data.settings; }
  updateSettings(patch) {
    const s = this.data.settings;
    this.data.settings = { ...s, ...patch, channels: { ...s.channels, ...(patch.channels || {}) } };
    this.save();
    return this.data.settings;
  }

  get watches() { return this.data.watches; }
  addWatch(params, name) {
    const w = { id: randomUUID(), name, params, createdAt: new Date().toISOString(), lastRun: null, lastHitCount: 0, lastError: null, notified: [] };
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
