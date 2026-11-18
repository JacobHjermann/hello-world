import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Store } from "../src/store.js";
import { Scheduler } from "../src/scheduler.js";
import { buildAlertMessage } from "../src/notify.js";

const future = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const want = future(40);
const mkTrip = (date, cabin = "business") => ({ key: `${date}|OSL|NRT|${cabin}`, date, origin: "OSL", dest: "NRT", region: "asia", cabin, airlines: ["SK"], pts: 60000, taxes: 1000, taxCurrency: "NOK", seats: 3, direct: true });

function setup(tripsRef, sendResult = [{ channel: "email", ok: true }]) {
  const dir = mkdtempSync(path.join(tmpdir(), "bj-"));
  const store = new Store(dir);
  const sent = [];
  const notifier = { send: async (_s, msg) => { sent.push(msg); return sendResult; } };
  const provider = { name: "fake", live: false, fetchTrips: async () => tripsRef.trips };
  const scheduler = new Scheduler({ store, provider, notifier, log: { info() {}, error() {} } });
  return { dir, store, sent, scheduler };
}

test("notifies once per new trip, then only about newly found ones", async () => {
  const ref = { trips: [mkTrip(want)] };
  const { dir, store, sent, scheduler } = setup(ref);
  store.addWatch({ from: "OSL", want, flex: 7, region: "asia", cabins: ["business"], pax: 2, partners: true, amex: true }, "Oslo → Asia");

  await scheduler.runAll();
  assert.equal(sent.length, 1);
  assert.match(sent[0].text, /60\s000 poeng totalt med Amex 2 for 1/);
  assert.match(sent[0].short, /Amex 2 for 1/);

  await scheduler.runAll();
  assert.equal(sent.length, 1, "same trip is not reported twice");

  ref.trips = [mkTrip(want), mkTrip(future(42))];
  await scheduler.runAll();
  assert.equal(sent.length, 2);
  assert.match(sent[1].subject, /1 ledig reise/);
  assert.equal(store.watches[0].lastHitCount, 2);
  assert.ok(store.runs.lastRun);

  // Saved state survives a restart.
  assert.equal(new Store(dir).watches[0].notified.length, 2);
  rmSync(dir, { recursive: true });
});

test("keeps trips unreported when no channel could send", async () => {
  const ref = { trips: [mkTrip(want)] };
  const { dir, store, sent, scheduler } = setup(ref, []);
  store.addWatch({ from: "OSL", want, flex: 7, region: "all", cabins: ["business"], pax: 2, partners: true, amex: false }, "Test");
  await scheduler.runAll();
  assert.equal(sent.length, 1);
  assert.equal(store.watches[0].notified.length, 0);
  assert.match(store.watches[0].lastError, /ingen varslingskanal/);
  rmSync(dir, { recursive: true });
});

test("a provider error is recorded on the alert and the run", async () => {
  const { dir, store, scheduler } = setup({ trips: [] });
  scheduler.provider = { fetchTrips: async () => { throw new Error("kvote brukt opp"); } };
  store.addWatch({ from: "OSL", want, flex: 7, region: "all", cabins: ["business"], pax: 2, partners: true, amex: false }, "Test");
  await scheduler.runAll();
  assert.equal(store.watches[0].lastError, "kvote brukt opp");
  assert.equal(store.runs.lastError, "kvote brukt opp");
  rmSync(dir, { recursive: true });
});

test("alert message lists trips cheapest first", () => {
  const hit = (pts, dest) => ({ cabin: "business", origin: "OSL", dest, destCity: dest, date: want, daysFromWanted: 0, airlineNames: ["SAS"], seats: 2, seatsUnknown: false, pointsTotal: pts, amexApplied: false });
  const msg = buildAlertMessage({ name: "X" }, [hit(90000, "JFK"), hit(50000, "NRT")]);
  assert.ok(msg.text.indexOf("NRT") < msg.text.indexOf("JFK"));
  assert.match(msg.short, /NRT/);
  assert.match(msg.subject, /2 ledige reiser/);
});
