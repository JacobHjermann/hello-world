import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { regionOf, pickDestinations, parseAvailability, parseAwardPrices, destinationsUrl, offersUrl } from "../extension/sas-parse.js";
import { filterAndPrice, normalizeParams } from "../src/search.js";
import { redactJson } from "../extension/redact.js";

// Real (public) answers from sas.no, recorded November 2026, personal data removed.
const fx = (f) => JSON.parse(readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8"));
const destinations = fx("sas-award-destinations.json");
const aal = fx("sas-award-availability-AAL.json");
const offer = fx("sas-offers-OSL-AAL.json");

test("every SAS destination from Oslo gets a region", () => {
  const missing = destinations.filter((d) => !regionOf(d)).map((d) => d.airportCode);
  assert.deepEqual(missing, []);
  const r = Object.fromEntries(destinations.map((d) => [d.airportCode, regionOf(d)]));
  assert.equal(r.AAL, "europa");
  assert.equal(r.JFK, "nord-amerika");
  assert.equal(r.MIA, "nord-amerika");
  assert.equal(r.BKK, "asia");
  assert.equal(r.HND, "asia");
  assert.equal(r.AGA, "afrika");
  assert.equal(r.AYT, "europa");
});

test("picks destinations by region only", () => {
  const asia = pickDestinations(destinations, { region: "asia" }).map((d) => d.airportCode).sort();
  assert.deepEqual(asia, ["BKK", "BOM", "HND", "ICN"]);
  assert.equal(pickDestinations(destinations, { region: "all" }).length, destinations.length);
});

test("reads award seats per day and class", () => {
  const trips = parseAvailability(aal, { origin: "OSL", start: "2026-11-21", end: "2026-11-22" });
  const day = trips.filter((t) => t.date === "2026-11-21");
  assert.deepEqual(day.map((t) => [t.cabin, t.seats]).sort(), [["business", 8], ["economy", 10]]);
  assert.equal(day[0].dest, "AAL");
  assert.equal(day[0].destName, "Aalborg");
  assert.deepEqual(day[0].airlines, ["SK"]);
  assert.ok(trips.every((t) => t.date >= "2026-11-21" && t.date <= "2026-11-22"));
});

test("reads fixed award prices from the booking answer", () => {
  assert.deepEqual(parseAwardPrices(offer), {
    economy: { pts: 10000, taxes: 422, currency: "NOK" },
    business: { pts: 20000, taxes: 422, currency: "NOK" },
  });
});

test("award seats flow through the normal search with Amex 2 for 1", () => {
  const trips = parseAvailability(aal, { origin: "OSL", start: "2026-11-14", end: "2026-11-28" });
  const prices = parseAwardPrices(offer);
  for (const t of trips) if (prices[t.cabin]) Object.assign(t, { pts: prices[t.cabin].pts, taxes: prices[t.cabin].taxes });
  const params = normalizeParams({ from: "OSL", want: "2026-11-21", flex: 7, region: "europa", cabins: ["business"], pax: 2, amex: true });
  const { results } = filterAndPrice(trips, params, "2026-11-16");
  assert.ok(results.length > 0);
  const r = results[0];
  assert.equal(r.pointsTotal, 20000);       // two people, one pays
  assert.equal(r.taxesTotal, 844);          // taxes for both
  assert.equal(r.amexApplied, true);
  assert.ok(results.every((x) => x.seats >= 2));
});

test("unknown prices sort last and still show", () => {
  const trips = parseAvailability(aal, { origin: "OSL", start: "2026-11-21", end: "2026-11-21" });
  trips[0].pts = 10000;
  const params = normalizeParams({ from: "OSL", want: "2026-11-21", flex: 0, region: "all", cabins: ["business", "economy"], pax: 1 });
  const { results } = filterAndPrice(trips, params, "2026-11-16");
  assert.equal(results.length, 2);
  assert.equal(results.at(-1).pointsTotal, null);
});

test("builds the same URLs the site uses", () => {
  assert.equal(destinationsUrl("OSL", ["AAL"], { availability: true }), "https://www.sas.no/bff/award-finder/destinations/v1?market=no-no&origin=OSL&destinations=AAL&selectedMonth=&passengers=1&direct=false&availability=true");
  assert.equal(destinationsUrl("OSL"), "https://www.sas.no/bff/award-finder/destinations/v1?market=no-no&origin=OSL&destinations=&selectedMonth=&passengers=1&direct=false&availability=false&selectedFlightClass=");
  assert.match(offersUrl("OSL", "AAL", "2026-11-21"), /to=AAL&from=OSL&outDate=20261121&.*bookingFlow=points/);
});

test("member profile data is masked whole", () => {
  const out = redactJson({ individual: { firstnameEnc: "x" }, address: { physical: [{ addressLine1: "Gate 1", zipCode: "0150" }] }, engagements: { euroBonus: { ebNumberEnc: "y" } }, crmReference: "z", sessionId: "s", customer: { extFirstNameTransliterated: "Kari" } });
  assert.deepEqual(out, { individual: "[skjult]", address: "[skjult]", engagements: "[skjult]", crmReference: "[skjult]", sessionId: "[skjult]", customer: { extFirstNameTransliterated: "[skjult]" } });
});
