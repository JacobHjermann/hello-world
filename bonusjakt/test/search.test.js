import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeParams, dateWindow, price, filterAndPrice, runSearch, ValidationError } from "../src/search.js";
import { createDemoProvider } from "../src/providers/demo.js";

const trip = (o = {}) => ({ key: `${o.date || "2027-02-15"}|OSL|NRT|business`, date: "2027-02-15", origin: "OSL", dest: "NRT", region: "asia", cabin: "business", airlines: ["SK"], pts: 60000, taxes: 1500, taxCurrency: "NOK", seats: 4, direct: true, ...o });
const P = (o = {}) => normalizeParams({ from: "OSL", want: "2027-02-15", flex: 7, region: "all", cabins: ["business"], pax: 2, ...o });

test("date window is a week either side and never before today", () => {
  assert.deepEqual(dateWindow("2027-02-15", 7), { start: "2027-02-08", end: "2027-02-22" });
  assert.deepEqual(dateWindow("2027-02-15", 7, "2027-02-12"), { start: "2027-02-12", end: "2027-02-22" });
  assert.deepEqual(dateWindow("2027-03-01", 3), { start: "2027-02-26", end: "2027-03-04" });
});

test("Amex 2-for-1 halves points for two on SAS-operated flights only", () => {
  assert.equal(price(trip(), { pax: 2, amex: true }).pointsTotal, 60000);
  assert.equal(price(trip(), { pax: 2, amex: false }).pointsTotal, 120000);
  assert.equal(price(trip({ airlines: ["KE"] }), { pax: 2, amex: true }).pointsTotal, 120000);
  assert.equal(price(trip({ airlines: ["SK", "KL"] }), { pax: 2, amex: true }).amexApplied, false);
  assert.equal(price(trip(), { pax: 1, amex: true }).amexApplied, false);
  // One voucher per booking: with four travellers one goes free.
  assert.equal(price(trip(), { pax: 4, amex: true }).pointsTotal, 180000);
  assert.equal(price(trip(), { pax: 2, amex: true }).taxesTotal, 3000);
});

test("filters by window, cabin, partners, region and seats", () => {
  const trips = [
    trip(),
    trip({ date: "2027-02-07", key: "a" }), // outside window
    trip({ date: "2027-02-22", key: "b" }), // last day inside
    trip({ cabin: "economy", key: "c" }),
    trip({ airlines: ["KE"], key: "d" }),
    trip({ seats: 1, key: "e" }),
    trip({ seats: null, key: "f" }), // unknown seat count is kept
    trip({ region: "europa", dest: "CDG", key: "g" }),
  ];
  const keys = (p) => filterAndPrice(trips, p).results.map((r) => r.key).sort();
  assert.deepEqual(keys(P()), ["2027-02-15|OSL|NRT|business", "b", "d", "f", "g"].sort());
  assert.deepEqual(keys(P({ partners: false })), ["2027-02-15|OSL|NRT|business", "b", "f", "g"].sort());
  assert.deepEqual(keys(P({ region: "europa" })), ["g"]);
  assert.ok(keys(P({ cabins: ["business", "economy"] })).includes("c"));
  const r = filterAndPrice([trip({ date: "2027-02-12" })], P()).results[0];
  assert.equal(r.daysFromWanted, -3);
  assert.equal(r.destCity, "Tokyo Narita");
});

test("rejects bad input with a readable message", () => {
  assert.throws(() => normalizeParams({ want: "nope" }), ValidationError);
  assert.throws(() => normalizeParams({ want: "2027-01-01", pax: 12 }), /mellom 1 og 9/);
  assert.throws(() => normalizeParams({ want: "2027-01-01", cabins: ["first"] }), /seteklasse/);
  assert.throws(() => normalizeParams({ want: "2027-01-01", from: "XXX" }), /Ukjent/);
});

test("demo provider search works end to end and uses the cache", async () => {
  const provider = createDemoProvider();
  let calls = 0;
  const counting = { ...provider, fetchTrips: (q) => { calls++; return provider.fetchTrips(q); } };
  const cache = new Map();
  const a = await runSearch(counting, P({ cabins: ["business", "premium", "economy"] }), { today: "2027-01-01", cache });
  await runSearch(counting, P({ cabins: ["business", "premium", "economy"], amex: true }), { today: "2027-01-01", cache });
  assert.equal(calls, 1);
  assert.ok(a.results.length > 0);
  for (const r of a.results) assert.ok(r.date >= "2027-02-08" && r.date <= "2027-02-22");
});

test("a search whose dates have passed returns nothing", async () => {
  const r = await runSearch(createDemoProvider(), P({ want: "2027-01-01" }), { today: "2027-03-01" });
  assert.equal(r.expired, true);
  assert.equal(r.results.length, 0);
});
