// Runs every alert in watches.json once and sends notifications about new trips.
// Used by the GitHub Actions workflow (.github/workflows/bonusjakt.yml), but works anywhere:
//   node scripts/run-alerts.js
// Settings come from environment variables (see README), state is kept in DATA_DIR/db.json.
import { readFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { config, channelsConfigured } from "../src/config.js";
import { Store } from "../src/store.js";
import { Scheduler } from "../src/scheduler.js";
import { createNotifier } from "../src/notify.js";
import { createSeatsAeroProvider } from "../src/providers/seatsaero.js";
import { createDemoProvider } from "../src/providers/demo.js";
import { normalizeParams, describeParams } from "../src/search.js";

const watchFile = process.env.WATCHES_FILE || path.join(config.root, "watches.json");
const list = JSON.parse(readFileSync(watchFile, "utf8"));

const store = new Store(config.dataDir);

// Sync the alerts from the file into the store, keeping what was already reported for each one.
const previous = new Map(store.watches.map((w) => [w.id, w]));
store.data.watches = list.map((entry, i) => {
  const { name, ...raw } = entry;
  let params;
  try { params = normalizeParams(raw); } catch (err) { throw new Error(`Varsel nr. ${i + 1} i watches.json: ${err.message}`); }
  const id = createHash("sha1").update(JSON.stringify(params)).digest("hex").slice(0, 12);
  const old = previous.get(id);
  return { id, name: name || `Varsel ${i + 1}`, params, createdAt: old?.createdAt || new Date().toISOString(), lastRun: old?.lastRun || null, lastHitCount: old?.lastHitCount || 0, lastError: null, notified: old?.notified || [] };
});

const ready = channelsConfigured();
store.data.settings = {
  email: process.env.ALERT_EMAIL || "",
  phone: process.env.ALERT_PHONE || "",
  telegramChatId: process.env.TELEGRAM_CHAT_ID || "",
  channels: { email: ready.email, sms: ready.sms, telegram: ready.telegram },
};
store.save();

const provider = config.seatsAero.apiKey ? createSeatsAeroProvider(config.seatsAero) : createDemoProvider();
const scheduler = new Scheduler({ store, provider, notifier: createNotifier(config), timezone: config.timezone, publicUrl: config.publicUrl });

console.log(`Datakilde: ${provider.live ? "seats.aero" : "EKSEMPELDATA (SEATSAERO_API_KEY mangler)"}`);
console.log(`Varsler sendes på: ${Object.entries(ready).filter(([, v]) => v).map(([k]) => k).join(", ") || "INGEN KANAL SATT OPP"}`);

const summary = await scheduler.runAll(process.env.GITHUB_ACTIONS ? "GitHub Actions" : "manuelt");
let failed = false;
for (const s of summary) {
  const w = store.watches.find((x) => x.id === s.id);
  console.log(`\n• ${s.name} (${describeParams(w.params)})`);
  if (s.error) { failed = true; console.log(`  FEIL: ${s.error}`); continue; }
  console.log(`  ${s.found} ledige nå, ${s.new} nye.`);
  for (const n of s.notified) console.log(`  ${n.channel}: ${n.ok ? "sendt" : "feilet – " + n.error}`);
  if (w.lastError) console.log(`  Merk: ${w.lastError}`);
}

// A failed run makes the workflow red, so GitHub e-mails you about it.
if (failed) process.exit(1);
