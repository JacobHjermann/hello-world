import { REGION_IDS, ORIGINS, cityName, airlineName } from "./airports.js";

export const CABINS = ["business", "premium", "economy"];
export const FLEX_OPTIONS = [0, 3, 7, 14];

export class ValidationError extends Error {}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const addDays = (iso, n) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const daysBetween = (a, b) => Math.round((new Date(b + "T12:00:00Z") - new Date(a + "T12:00:00Z")) / 86400000);
export const todayIso = (tz = "Europe/Oslo") => new Intl.DateTimeFormat("sv-SE", { timeZone: tz }).format(new Date());

/** Validate and fill in defaults for a search coming from the page or a saved alert. */
export function normalizeParams(input = {}) {
  const from = String(input.from || "OSL").toUpperCase();
  if (!ORIGINS[from]) throw new ValidationError(`Ukjent avreiseflyplass: ${from}`);
  const want = String(input.want || "");
  if (!ISO.test(want) || isNaN(new Date(want))) throw new ValidationError("Velg en gyldig ønsket avreisedato.");
  const flex = Number(input.flex ?? 7);
  if (!FLEX_OPTIONS.includes(flex)) throw new ValidationError("Fleksibel dato må være 0, 3, 7 eller 14 dager.");
  const region = String(input.region || "all");
  if (!REGION_IDS.includes(region)) throw new ValidationError(`Ukjent verdensdel: ${region}`);
  const cabins = [...new Set((Array.isArray(input.cabins) ? input.cabins : ["business"]).map(String))];
  if (!cabins.length || cabins.some((c) => !CABINS.includes(c))) throw new ValidationError("Velg minst én seteklasse.");
  const pax = Number(input.pax ?? 2);
  if (!Number.isInteger(pax) || pax < 1 || pax > 9) throw new ValidationError("Antall reisende må være mellom 1 og 9.");
  return { from, want, flex, region, cabins, pax, partners: input.partners !== false, amex: Boolean(input.amex) };
}

/** The dates to search: `flex` days either side of the wanted date, never before today. */
export function dateWindow(want, flex, today) {
  let start = addDays(want, -flex);
  const end = addDays(want, flex);
  if (today && start < today) start = today;
  return { start, end };
}

export const isSasOperated = (trip) => trip.airlines.length > 0 && trip.airlines.every((a) => a === "SK");

/**
 * EuroBonus American Express 2-for-1: on SAS-operated flights, two people travel for the points of one.
 * One voucher per booking, so with more than two travellers only one person goes free.
 */
export function price(trip, { pax, amex }) {
  const amexApplied = Boolean(amex) && pax >= 2 && isSasOperated(trip);
  return {
    amexApplied,
    pointsPerPerson: trip.pts,
    pointsTotal: trip.pts * (amexApplied ? pax - 1 : pax),
    pointsWithoutAmex: trip.pts * pax,
    taxesTotal: trip.taxes == null ? null : trip.taxes * pax,
  };
}

export function filterAndPrice(trips, params, today) {
  const { start, end } = dateWindow(params.want, params.flex, today);
  const seen = new Set();
  const results = [];
  for (const t of trips) {
    if (t.origin !== params.from) continue;
    if (t.date < start || t.date > end) continue;
    if (params.region !== "all" && t.region && t.region !== params.region) continue;
    if (!params.cabins.includes(t.cabin)) continue;
    const sas = isSasOperated(t);
    if (!params.partners && !sas) continue;
    if (t.seats != null && t.seats < params.pax) continue;
    if (seen.has(t.key)) continue;
    seen.add(t.key);
    results.push({
      ...t,
      destCity: cityName(t.dest),
      originCity: cityName(t.origin),
      airlineNames: t.airlines.map(airlineName),
      sasOperated: sas,
      daysFromWanted: daysBetween(params.want, t.date),
      seatsUnknown: t.seats == null,
      ...price(t, params),
    });
  }
  results.sort((a, b) => a.pointsTotal - b.pointsTotal || Math.abs(a.daysFromWanted) - Math.abs(b.daysFromWanted));
  return { window: { start, end }, results };
}

/** Run one search. `cache` lets the scheduler share provider calls between alerts in one run. */
export async function runSearch(provider, rawParams, { today = todayIso(), cache } = {}) {
  const params = normalizeParams(rawParams);
  const { start, end } = dateWindow(params.want, params.flex, today);
  if (end < today) return { params, window: { start, end }, results: [], expired: true };
  const query = { origin: params.from, region: params.region, cabins: params.cabins, start, end };
  const cacheKey = JSON.stringify(query);
  let trips = cache?.get(cacheKey);
  if (!trips) {
    trips = await provider.fetchTrips(query);
    cache?.set(cacheKey, trips);
  }
  return { params, ...filterAndPrice(trips, params, today) };
}

export function describeParams(p) {
  const cab = { business: "Business", premium: "Premium", economy: "Economy" };
  const parts = [
    p.cabins.map((c) => cab[c]).join(", "),
    `${p.pax} ${p.pax === 1 ? "person" : "personer"}`,
    `${formatDate(p.want)}${p.flex ? ` ± ${p.flex} dager` : ""}`,
  ];
  if (p.amex) parts.push("Amex 2 for 1");
  if (!p.partners) parts.push("kun SAS");
  return parts.join(" · ");
}

const MONTHS = ["jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "des"];
export function formatDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d}. ${MONTHS[m - 1]} ${y}`;
}
