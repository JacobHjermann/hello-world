import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { regionOf, pickDestinations, parseAvailability, parseAwardPrices, destinationsUrl, offersUrl, destinationChoices, awardFinderUrl } from "../extension/sas-parse.js";
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

test("a chosen destination narrows the search to that one", () => {
  assert.deepEqual(pickDestinations(destinations, { region: "europa", dest: "HND" }).map((d) => d.airportCode), ["HND"]);
  const trips = parseAvailability(aal, { origin: "OSL", start: "2026-11-21", end: "2026-11-21" });
  const other = { ...trips[0], key: "x", dest: "CPH", destCityCode: "CPH" };
  const params = normalizeParams({ from: "OSL", want: "2026-11-21", flex: 0, region: "asia", dest: "aal", cabins: ["business", "economy"], pax: 1 });
  assert.equal(params.dest, "AAL");
  const { results } = filterAndPrice([...trips, other], params, "2026-11-16");
  assert.ok(results.length > 0 && results.every((r) => r.dest === "AAL"));
  assert.throws(() => normalizeParams({ from: "OSL", want: "2026-11-21", dest: "Tokyo" }), /Ukjent destinasjon/);
});

test("destination list for the picker comes from SAS, sorted by city", () => {
  const list = destinationChoices(destinations);
  // Cities with several SAS airports (New York, Milano …) become one choice.
  assert.deepEqual(new Set(list.map((d) => d.code)), new Set(destinations.map((d) => d.cityCode || d.airportCode)));
  const tokyo = list.find((d) => d.code === "TYO");
  assert.deepEqual(tokyo, { code: "TYO", city: "Tokyo", airport: "Haneda", country: "Japan", region: "asia", sas: true });
  assert.ok(list.every((d, i) => i === 0 || list[i - 1].city.localeCompare(d.city, "nb") <= 0));
  assert.equal(awardFinderUrl("OSL", "HND"), "https://www.sas.no/award-finder?origin=OSL&destination=HND");
});

// ---------- Partner award seats ----------
import { parsePartnerFlights, partnerLocationChoices, partnerFlightsUrl } from "../extension/sas-parse.js";
const partner = fx("sas-partner-flights-OSL-LON.json");
const partnerLocs = fx("sas-partner-locations.json");

test("reads partner award flights from the award booking answer", () => {
  const trips = parsePartnerFlights(partner, { origin: "OSL", destName: "London" });
  assert.equal(trips.length, 1);
  const t = trips[0];
  assert.equal(t.date, "2026-12-10");
  assert.equal(t.dest, "LHR");
  assert.equal(t.destCityCode, "LON");
  assert.equal(t.cabin, "business");
  assert.deepEqual(t.airlines, ["KL"]);
  assert.equal(t.pts, 40000);
  assert.equal(t.seats, 3);
  assert.equal(t.direct, false);
  assert.equal(t.partner, true);
  assert.equal(t.taxes, null); // 0 in the answer means "not known before booking"
});

test("partner seats: city code matches, Amex 2 for 1 does not apply to KLM", () => {
  const trips = parsePartnerFlights(partner, { origin: "OSL", destName: "London" });
  const params = normalizeParams({ from: "OSL", want: "2026-12-10", flex: 0, dest: "LON", cabins: ["business"], pax: 2, amex: true });
  const { results } = filterAndPrice(trips, params, "2026-11-18");
  assert.equal(results.length, 1);
  assert.equal(results[0].amexApplied, false);
  assert.equal(results[0].pointsTotal, 80000);
  assert.equal(results[0].destCity, "London");
  const noPartners = filterAndPrice(trips, { ...params, partners: false }, "2026-11-18");
  assert.equal(noPartners.results.length, 0);
});

test("SAS and partner destinations meet in one picker list by city code", () => {
  const choices = destinationChoices(destinations, partnerLocationChoices(partnerLocs));
  const tokyo = choices.filter((c) => c.city === "Tokyo");
  assert.equal(tokyo.length, 1);
  assert.equal(tokyo[0].code, "TYO");
  assert.equal(tokyo[0].sas && tokyo[0].partner, true);
  const atl = choices.find((c) => c.code === "ATL");
  assert.ok(atl && atl.partner);
  assert.deepEqual(pickDestinations(destinations, { dest: "TYO" }).map((d) => d.airportCode), ["HND"]);
});

test("partner search URL matches the site's", () => {
  assert.equal(partnerFlightsUrl("OSL", "LON", "2026-12-10", { pax: 2, oneWay: false }), "https://www.sas.no/award-api/flights?origin=OSL&destination=LON&outboundDate=2026-12-10&inboundDate=2026-12-17&tripType=round-trip&adults=2&children=0&infants=0&youths=0");
});
