import { REGION_IDS, ORIGINS, cityName, airlineName } from "./airports.js";

export const CABINS = ["business", "premium", "economy"];
export const FLEX_OPTIONS = [0, 3, 7, 14];

export class ValidationError extends Error {}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const addDays = (iso, n) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const daysBetween = (a, b) => Math.round((new Date(b + "T12:00:00Z") - new Date(a + "T12:00:00Z")) / 86400000);
export const todayIso = (tz = "Europe/Oslo") => new Intl.DateTimeFormat("sv-SE", { timeZone: tz }).format(new Date());

/** Validate and fill in defaults for a search coming from the page or a saved alert. */
export const TRIP_TYPES = ["round", "out", "home"];
const validDate = (d) => ISO.test(d) && !isNaN(new Date(d));

/**
 * tripType: "round" (out on `want`, home on `back`), "out" (only out on `want`) or "home" (only
 * home on `back`). Saved alerts from before tripType existed are one-way out.
 */
export function normalizeParams(input = {}) {
  const from = String(input.from || "OSL").toUpperCase();
  if (!ORIGINS[from]) throw new ValidationError(`Ukjent avreiseflyplass: ${from}`);
  const tripType = String(input.tripType || "out");
  if (!TRIP_TYPES.includes(tripType)) throw new ValidationError(`Ukjent reisetype: ${tripType}`);
  let want = String(input.want || "");
  let back = String(input.back || "");
  if (tripType !== "home" && !validDate(want)) throw new ValidationError("Velg en gyldig dato for utreisen.");
  if (tripType !== "out" && !validDate(back)) throw new ValidationError("Velg en gyldig dato for hjemreisen.");
  if (tripType === "round" && back < want) throw new ValidationError("Hjemreisen kan ikke være før utreisen.");
  if (tripType === "home") want = back;
  if (tripType === "out") back = "";
  const flex = Number(input.flex ?? 7);
  if (!FLEX_OPTIONS.includes(flex)) throw new ValidationError("Fleksibel dato må være 0, 3, 7 eller 14 dager.");
  const region = String(input.region || "all");
  if (!REGION_IDS.includes(region)) throw new ValidationError(`Ukjent verdensdel: ${region}`);
  const cabins = [...new Set((Array.isArray(input.cabins) ? input.cabins : ["business"]).map(String))];
  if (!cabins.length || cabins.some((c) => !CABINS.includes(c))) throw new ValidationError("Velg minst én seteklasse.");
  const pax = Number(input.pax ?? 2);
  if (!Number.isInteger(pax) || pax < 1 || pax > 9) throw new ValidationError("Antall reisende må være mellom 1 og 9.");
  // Optional single destination (IATA code). When set, it wins over the region.
  const dest = String(input.dest || "").trim().toUpperCase();
  if (dest && !/^[A-Z]{3}$/.test(dest)) throw new ValidationError(`Ukjent destinasjon: ${dest}`);
  return { from, tripType, want, back, flex, region, dest, cabins, pax, partners: input.partners !== false, amex: Boolean(input.amex) };
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
  // Points can be unknown (null) until the price has been looked up; the seat is still worth showing.
  const known = trip.pts != null;
  return {
    amexApplied,
    pointsPerPerson: known ? trip.pts : null,
    pointsTotal: known ? trip.pts * (amexApplied ? pax - 1 : pax) : null,
    pointsWithoutAmex: known ? trip.pts * pax : null,
    taxesTotal: trip.taxes == null ? null : trip.taxes * pax,
  };
}

/** Which directions a search covers, and the dates for each. */
export function searchWindows(params, today) {
  const w = {};
  if (params.tripType !== "home") w.out = dateWindow(params.want, params.flex, today);
  if (params.tripType !== "out") w.home = dateWindow(params.back || params.want, params.flex, today);
  return w;
}

// The airport and city at the far end of a trip (away from Norway), whichever way it goes.
const awayCode = (t) => t.awayCode || (t.dir === "home" ? t.origin : t.dest);
const awayCity = (t) => t.awayCity || (t.dir === "home" ? null : t.destCityCode) || awayCode(t);

export function filterAndPrice(trips, params, today) {
  const windows = searchWindows(params, today);
  const seen = new Set();
  const results = [];
  for (const t of trips) {
    const dir = t.dir || "out";
    const w = windows[dir];
    if (!w) continue;
    if ((dir === "out" ? t.origin : t.dest) !== params.from) continue;
    if (t.date < w.start || t.date > w.end) continue;
    if (params.dest) { if (awayCode(t) !== params.dest && awayCity(t) !== params.dest) continue; }
    else if (params.region !== "all" && t.region && t.region !== params.region) continue;
    if (!params.cabins.includes(t.cabin)) continue;
    const sas = isSasOperated(t);
    if (!params.partners && !sas) continue;
    if (t.seats != null && t.seats < params.pax) continue;
    if (seen.has(t.key)) continue;
    seen.add(t.key);
    const awayName = t.awayName || t.destName;
    results.push({
      ...t,
      dir,
      awayKey: awayCity(t),
      destCity: dir === "out" ? awayName || cityName(t.dest) : cityName(t.dest),
      originCity: dir === "home" ? awayName || cityName(t.origin) : cityName(t.origin),
      airlineNames: t.airlines.map(airlineName),
      sasOperated: sas,
      daysFromWanted: daysBetween(dir === "home" ? params.back || params.want : params.want, t.date),
      seatsUnknown: t.seats == null,
      ...price(t, params),
    });
  }
  // A round trip needs seats both ways: keep only destinations with both.
  let kept = results;
  if (params.tripType === "round") {
    const outs = new Set(results.filter((r) => r.dir === "out").map((r) => r.awayKey));
    const homes = new Set(results.filter((r) => r.dir === "home").map((r) => r.awayKey));
    kept = results.filter((r) => outs.has(r.awayKey) && homes.has(r.awayKey));
  }
  kept.sort((a, b) => byPoints(a, b) || Math.abs(a.daysFromWanted) - Math.abs(b.daysFromWanted));
  const first = windows.out || windows.home;
  return { window: { start: first.start, end: first.end, ...(windows.home && windows.out ? { backStart: windows.home.start, backEnd: windows.home.end } : {}) }, windows, results: kept };
}

/** Run one search. `cache` lets the scheduler share provider calls between alerts in one run. */
export async function runSearch(provider, rawParams, { today = todayIso(), cache } = {}) {
  const params = normalizeParams(rawParams);
  const windows = searchWindows(params, today);
  const last = Object.values(windows).reduce((m, w) => (w.end > m ? w.end : m), "");
  if (last < today) return { params, window: Object.values(windows)[0], windows, results: [], expired: true };
  const out = windows.out || {}, home = windows.home || {};
  const query = {
    origin: params.from, region: params.region, dest: params.dest, cabins: params.cabins, partners: params.partners, pax: params.pax,
    dirs: Object.keys(windows), start: out.start, end: out.end, backStart: home.start, backEnd: home.end,
  };
  const cacheKey = JSON.stringify(query);
  let trips = cache?.get(cacheKey);
  if (!trips) {
    trips = await provider.fetchTrips(query);
    cache?.set(cacheKey, trips);
  }
  return { params, ...filterAndPrice(trips, params, today) };
}

/** Cheapest first; trips without a known price last. */
export const byPoints = (a, b) => (a.pointsTotal ?? Infinity) - (b.pointsTotal ?? Infinity);

export function describeParams(p) {
  const cab = { business: "Business", premium: "Premium", economy: "Economy" };
  const flex = p.flex ? ` ± ${p.flex} dager` : "";
  const type = p.tripType || "out";
  const dates = type === "round" ? `ut ${formatDate(p.want)}, hjem ${formatDate(p.back)}${flex}`
    : type === "home" ? `hjem ${formatDate(p.back || p.want)}${flex}` : `ut ${formatDate(p.want)}${flex}`;
  const parts = [
    { round: "Tur/retur", out: "Bare ut", home: "Bare hjem" }[type],
    ...(p.dest ? [`${type === "home" ? "fra" : "til"} ${cityName(p.dest)}`] : []),
    p.cabins.map((c) => cab[c]).join(", "),
    `${p.pax} ${p.pax === 1 ? "person" : "personer"}`,
    dates,
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
