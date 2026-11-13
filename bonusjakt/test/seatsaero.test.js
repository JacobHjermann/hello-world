import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeAvailability, createSeatsAeroProvider } from "../src/providers/seatsaero.js";

const row = {
  ID: "x", Date: "2027-02-15",
  Route: { OriginAirport: "OSL", DestinationAirport: "NRT", OriginRegion: "Europe", DestinationRegion: "Asia", Source: "eurobonus" },
  YAvailable: true, YMileageCost: "35000", YRemainingSeats: 0, YAirlines: "SK", YDirect: true, YTotalTaxes: 98000,
  WAvailable: false, WMileageCost: "0",
  JAvailable: true, JMileageCostRaw: 75000, JRemainingSeats: 2, JAirlines: "SK, KE", JDirect: false, JTotalTaxes: 150000,
  TaxesCurrency: "NOK", Source: "eurobonus",
};

test("normalizes one row into one trip per available cabin", () => {
  const trips = normalizeAvailability(row);
  assert.equal(trips.length, 2);
  const [y, j] = trips;
  assert.equal(y.cabin, "economy");
  assert.equal(y.pts, 35000);
  assert.equal(y.seats, null); // 0 = unknown
  assert.equal(y.taxes, 980);
  assert.equal(y.region, "asia");
  assert.equal(j.cabin, "business");
  assert.equal(j.pts, 75000);
  assert.deepEqual(j.airlines, ["SK", "KE"]);
  assert.equal(j.direct, false);
  assert.equal(j.key, "2027-02-15|OSL|NRT|business");
});

test("client sends the key, filters origin and follows pagination", async () => {
  const seen = [];
  const pages = [
    { data: [row, { ...row, Route: { ...row.Route, OriginAirport: "CPH" } }], hasMore: true, cursor: 123 },
    { data: [{ ...row, Date: "2027-02-16" }], hasMore: false },
  ];
  const fetchImpl = async (url, opts) => {
    seen.push({ url: new URL(url), key: opts.headers["Partner-Authorization"] });
    return { ok: true, status: 200, json: async () => pages[seen.length - 1] };
  };
  const p = createSeatsAeroProvider({ apiKey: "k", baseUrl: "https://seats.aero/partnerapi", source: "eurobonus", taxDivisor: 100, maxPages: 5 }, fetchImpl);
  const trips = await p.fetchTrips({ origin: "OSL", region: "asia", cabins: ["business"], start: "2027-02-08", end: "2027-02-22" });
  assert.equal(seen.length, 2);
  assert.equal(seen[0].key, "k");
  assert.equal(seen[0].url.pathname, "/partnerapi/availability");
  assert.equal(seen[0].url.searchParams.get("destination_region"), "Asia");
  assert.equal(seen[0].url.searchParams.get("cabin"), "business");
  assert.equal(seen[1].url.searchParams.get("cursor"), "123");
  assert.equal(trips.filter((t) => t.origin !== "OSL").length, 0);
  assert.equal(trips.length, 4);
});

test("bad API key gives a clear error", async () => {
  const p = createSeatsAeroProvider({ apiKey: "bad", baseUrl: "https://x", source: "eurobonus", maxPages: 1 }, async () => ({ ok: false, status: 401, text: async () => "" }));
  await assert.rejects(p.fetchTrips({ origin: "OSL", region: "all", cabins: ["business"], start: "2027-01-01", end: "2027-01-02" }), /API-nøkkelen/);
});
