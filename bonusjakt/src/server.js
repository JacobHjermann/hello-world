import express from "express";
import path from "node:path";
import { timingSafeEqual } from "node:crypto";
import { config, channelsConfigured } from "./config.js";
import { Store } from "./store.js";
import { createSeatsAeroProvider } from "./providers/seatsaero.js";
import { createDemoProvider } from "./providers/demo.js";
import { createNotifier, buildAlertMessage } from "./notify.js";
import { Scheduler } from "./scheduler.js";
import { runSearch, normalizeParams, describeParams, ValidationError, todayIso } from "./search.js";
import { REGIONS, ORIGINS } from "./airports.js";

export function createApp({ store, provider, notifier, scheduler, appPassword = "" }) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "20kb" }));

  // One shared password protects the page and the API (browser shows a login box).
  if (appPassword) {
    const expected = Buffer.from(appPassword);
    app.use((req, res, next) => {
      if (req.path === "/healthz") return next();
      const [scheme, encoded] = (req.headers.authorization || "").split(" ");
      const pass = scheme === "Basic" && encoded ? Buffer.from(encoded, "base64").toString().split(":").slice(1).join(":") : "";
      const got = Buffer.from(pass);
      if (got.length === expected.length && timingSafeEqual(got, expected)) return next();
      res.set("WWW-Authenticate", 'Basic realm="Bonusjakt", charset="UTF-8"').status(401).send("Logg inn for å bruke Bonusjakt.");
    });
  }

  app.get("/healthz", (_req, res) => res.json({ ok: true }));

  app.get("/api/status", (_req, res) => {
    res.json({
      mode: provider.live ? "live" : "demo",
      source: provider.name,
      intervalHours: scheduler.intervalMs / 3600000,
      lastRun: store.runs.lastRun,
      lastError: store.runs.lastError,
      nextRun: scheduler.nextRunAt,
      running: Boolean(scheduler.running),
      channels: channelsConfigured(),
      origins: ORIGINS,
      regions: Object.fromEntries(Object.entries(REGIONS).map(([k, v]) => [k, v.name])),
      today: todayIso(config.timezone),
    });
  });

  // Filter clicks on the page re-run the search; caching the raw data for 15 minutes saves API quota.
  const searchCache = new TtlCache(15 * 60 * 1000);
  app.post("/api/search", async (req, res, next) => {
    try { res.json(await runSearch(provider, req.body, { today: todayIso(config.timezone), cache: searchCache })); } catch (e) { next(e); }
  });

  app.get("/api/watches", (_req, res) => res.json(store.watches.map(publicWatch)));

  app.post("/api/watches", (req, res, next) => {
    try {
      const params = normalizeParams(req.body?.params);
      const region = params.region === "all" ? "Hele verden" : REGIONS[params.region].name;
      const name = String(req.body?.name || `${ORIGINS[params.from]} → ${region}`).slice(0, 80);
      res.status(201).json(publicWatch(store.addWatch(params, name)));
    } catch (e) { next(e); }
  });

  app.delete("/api/watches/:id", (req, res) => {
    if (!store.removeWatch(req.params.id)) return res.status(404).json({ error: "Fant ikke varselet." });
    res.status(204).end();
  });

  app.post("/api/run", async (_req, res, next) => {
    try { res.json({ summary: await scheduler.runAll("manuelt") }); } catch (e) { next(e); }
  });

  app.get("/api/settings", (_req, res) => res.json(store.settings));

  app.put("/api/settings", (req, res, next) => {
    try {
      const b = req.body || {};
      const patch = {};
      if (b.email !== undefined) {
        const email = String(b.email).trim();
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ValidationError("E-postadressen ser ikke riktig ut.");
        patch.email = email;
      }
      if (b.phone !== undefined) {
        const phone = String(b.phone).replace(/[\s-]/g, "");
        if (phone && !/^\+\d{8,15}$/.test(phone)) throw new ValidationError("Skriv mobilnummeret med landskode, for eksempel +4791234567.");
        patch.phone = phone;
      }
      if (b.telegramChatId !== undefined) patch.telegramChatId = String(b.telegramChatId).trim();
      if (b.channels) patch.channels = { email: !!b.channels.email, sms: !!b.channels.sms, telegram: !!b.channels.telegram };
      res.json(store.updateSettings(patch));
    } catch (e) { next(e); }
  });

  app.post("/api/notify/test", async (_req, res, next) => {
    try {
      const sample = {
        key: "test", date: todayIso(config.timezone), origin: "OSL", dest: "NRT", destCity: "Tokyo Narita", cabin: "business",
        airlineNames: ["SAS"], seats: 2, seatsUnknown: false, pointsTotal: 70000, amexApplied: true, daysFromWanted: 3,
      };
      const msg = buildAlertMessage({ name: "Testvarsel" }, [sample], config.publicUrl);
      msg.subject = "Bonusjakt: testvarsel";
      msg.text = "Dette er en test. Slik vil varslene se ut:\n\n" + msg.text;
      msg.short = "Test fra Bonusjakt. " + msg.short;
      const results = await notifier.send(store.settings, msg);
      if (!results.length) return res.status(400).json({ error: "Ingen kanal er både slått på og satt opp på serveren.", results });
      res.json({ results });
    } catch (e) { next(e); }
  });

  app.use(express.static(path.join(config.root, "public"), { extensions: ["html"] }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
    if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Ugyldig forespørsel." });
    console.error(err);
    res.status(502).json({ error: err.message || "Noe gikk galt." });
  });

  return app;
}

class TtlCache {
  constructor(ttlMs) { this.ttl = ttlMs; this.map = new Map(); }
  get(k) {
    const e = this.map.get(k);
    if (!e) return undefined;
    if (Date.now() - e.at > this.ttl) { this.map.delete(k); return undefined; }
    return e.v;
  }
  set(k, v) {
    if (this.map.size > 200) this.map.delete(this.map.keys().next().value);
    this.map.set(k, { v, at: Date.now() });
  }
}

function publicWatch(w) {
  return {
    id: w.id, name: w.name, params: w.params, summary: describeParams(w.params), createdAt: w.createdAt,
    lastRun: w.lastRun, lastHitCount: w.lastHitCount, lastError: w.lastError, notifiedCount: w.notified.length,
  };
}

// Start the server when run directly (not when imported by tests).
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const store = new Store(config.dataDir);
  const provider = config.seatsAero.apiKey ? createSeatsAeroProvider(config.seatsAero) : createDemoProvider();
  const notifier = createNotifier(config);
  const scheduler = new Scheduler({ store, provider, notifier, intervalHours: config.intervalHours, timezone: config.timezone, publicUrl: config.publicUrl });
  const app = createApp({ store, provider, notifier, scheduler, appPassword: config.appPassword });

  app.listen(config.port, () => {
    console.log(`Bonusjakt kjører på http://localhost:${config.port}`);
    console.log(provider.live ? "Datakilde: seats.aero (EuroBonus)." : "Datakilde: EKSEMPELDATA. Legg inn SEATSAERO_API_KEY for ekte søk.");
    if (!config.appPassword) console.warn("ADVARSEL: APP_PASSWORD er ikke satt. Alle som finner adressen kan bruke siden.");
    const ch = channelsConfigured();
    console.log(`Varsler satt opp: e-post ${ch.email ? "ja" : "nei"}, SMS ${ch.sms ? "ja" : "nei"}, Telegram ${ch.telegram ? "ja" : "nei"}.`);
  });
  scheduler.start();
}
