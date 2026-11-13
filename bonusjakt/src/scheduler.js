import { runSearch, todayIso } from "./search.js";
import { buildAlertMessage } from "./notify.js";

/**
 * Runs every saved alert on a fixed interval (3 hours by default), and notifies about trips
 * that have not been reported before. Each trip is reported once per alert.
 */
export class Scheduler {
  constructor({ store, provider, notifier, intervalHours = 3, timezone = "Europe/Oslo", publicUrl = "", log = console }) {
    Object.assign(this, { store, provider, notifier, timezone, publicUrl, log });
    this.intervalMs = intervalHours * 3600 * 1000;
    this.timer = null;
    this.running = null;
    this.nextRunAt = null;
  }

  start() {
    const last = this.store.runs.lastRun ? Date.parse(this.store.runs.lastRun) : 0;
    // Catch up shortly after start if the server was down past a scheduled run.
    const due = last ? last + this.intervalMs : Date.now() + 10_000;
    this.#schedule(Math.max(due, Date.now() + 10_000));
  }

  stop() { clearTimeout(this.timer); this.timer = null; }

  #schedule(at) {
    clearTimeout(this.timer);
    this.nextRunAt = new Date(at).toISOString();
    this.timer = setTimeout(async () => {
      try { await this.runAll("automatisk"); } catch (err) { this.log.error("Planlagt søk feilet:", err); }
      this.#schedule(Date.now() + this.intervalMs);
    }, Math.max(0, at - Date.now()));
    this.timer.unref?.();
  }

  /** Run all alerts now. Concurrent calls share the same run. */
  runAll(reason = "manuelt") {
    this.running ??= this.#runAll(reason).finally(() => { this.running = null; });
    return this.running;
  }

  async #runAll(reason) {
    const started = Date.now();
    const today = todayIso(this.timezone);
    const cache = new Map();
    const summary = [];
    let lastError = null;

    for (const watch of this.store.watches) {
      const item = { id: watch.id, name: watch.name, found: 0, new: 0, notified: [] };
      try {
        const { results, expired } = await runSearch(this.provider, watch.params, { today, cache });
        watch.lastRun = new Date().toISOString();
        watch.lastHitCount = results.length;
        watch.lastError = expired ? "Datoen har passert. Slett varselet eller lag et nytt." : null;
        item.found = results.length;

        const already = new Set(watch.notified);
        const fresh = results.filter((r) => !already.has(r.key));
        item.new = fresh.length;
        if (fresh.length) {
          const msg = buildAlertMessage(watch, fresh, this.publicUrl);
          item.notified = await this.notifier.send(this.store.settings, msg);
          // Remember the trips only once someone was actually told, so a missing channel doesn't swallow them.
          if (item.notified.some((n) => n.ok)) watch.notified = [...already, ...fresh.map((r) => r.key)];
          const failed = item.notified.filter((n) => !n.ok);
          if (failed.length) watch.lastError = failed.map((f) => `${f.channel}: ${f.error}`).join("; ");
          else if (!item.notified.length) watch.lastError = "Fant ledige reiser, men ingen varslingskanal er slått på og satt opp.";
        }
        // Forget trips whose date has passed so the list doesn't grow forever.
        watch.notified = watch.notified.filter((k) => k.slice(0, 10) >= today);
      } catch (err) {
        watch.lastError = err.message;
        lastError = err.message;
        item.error = err.message;
        this.log.error(`Varsel «${watch.name}» feilet:`, err.message);
      }
      summary.push(item);
    }

    this.store.setRun({ lastRun: new Date().toISOString(), lastError, lastDurationMs: Date.now() - started, lastReason: reason });
    this.log.info?.(`Søk (${reason}) ferdig: ${summary.length} varsler, ${summary.reduce((s, i) => s + i.new, 0)} nye treff.`);
    return summary;
  }
}
