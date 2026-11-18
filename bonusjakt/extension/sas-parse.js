// Reads SAS's own answers (sas.no) into Bonusjakt's trip format. No browser APIs, so it can be tested in Node.
//
// Built from a real recording (November 2026):
//  - Award Finder: /bff/award-finder/destinations/v1 lists every SAS destination from an origin, and with
//    availability=true the number of award seats per day and class: AG = Economy (Go), AP = Premium (Plus),
//    AB = Business. Award seats are what EuroBonus calls "bonusreiser", and what Amex 2 for 1 applies to.
//  - Booking: /book/flights/api/offers/flights?bookingFlow=points shows award products ("ECONOMY BONUS",
//    "BUSINESS BONUS", isStandardAward: true) with their fixed points price and taxes.

export const SAS_BASE = "https://www.sas.no";
export const CLASS_TO_CABIN = { AG: "economy", AP: "premium", AB: "business" };
export const CABIN_TO_CLASS = { economy: "AG", premium: "AP", business: "AB" };

// Award Finder gives Norwegian country names; map them to Bonusjakt's regions.
const COUNTRY_REGION = {
  europa: ["Albania", "Belgia", "Bosnia-Hercegovina", "Bulgaria", "Danmark", "Estland", "Faroe Islands", "Færøyene", "Finland", "Frankrike", "Hellas", "Irland", "Island", "Italia", "Kroatia", "Kypros", "Latvia", "Litauen", "Luxembourg", "Malta", "Montenegro", "Nederland", "Norge", "Polen", "Portugal", "Romania", "Serbia", "Slovakia", "Slovenia", "Spania", "Storbritannia", "Sveits", "Sverige", "Tsjekkisk Republikk", "Tsjekkia", "Tyrkia", "Tyskland", "Ungarn", "Østerrike", "Grønland"],
  "nord-amerika": ["USA", "Canada", "Mexico", "Cuba", "Den dominikanske republikk", "Jamaica"],
  "sor-amerika": ["Brasil", "Argentina", "Chile", "Peru", "Colombia"],
  asia: ["Japan", "Korea", "Sør-Korea", "Thailand", "India", "Kina", "Hongkong", "Singapore", "Vietnam", "Indonesia", "Malaysia", "Filippinene", "Taiwan", "Sri Lanka", "Maldivene"],
  midtosten: ["De forente arabiske emirater", "Qatar", "Israel", "Jordan", "Saudi-Arabia", "Libanon", "Oman", "Bahrain", "Kuwait"],
  afrika: ["Marokko", "Egypt", "Sør-Afrika", "Kenya", "Tanzania", "Tunisia", "Gambia", "Kapp Verde", "Mauritius"],
  oseania: ["Australia", "New Zealand"],
};
const REGION_BY_COUNTRY = Object.fromEntries(Object.entries(COUNTRY_REGION).flatMap(([r, cs]) => cs.map((c) => [c, r])));

/** Region for an Award Finder destination: by country name, or by coordinates if the country is new. */
export function regionOf(d) {
  if (REGION_BY_COUNTRY[d.countryName]) return REGION_BY_COUNTRY[d.countryName];
  const { lat, long } = d;
  if (typeof lat !== "number" || typeof long !== "number") return null;
  if (long < -30) return lat > 12 ? "nord-amerika" : "sor-amerika";
  if (lat < -10 && long > 110) return "oseania";
  if (long > 34 && long < 60 && lat > 12 && lat < 38) return "midtosten";
  if (lat < 36 && long > -20 && long < 52) return "afrika";
  if (long > 60) return "asia";
  return "europa";
}

export const destinationsUrl = (origin, codes = [], { availability = false } = {}) =>
  `${SAS_BASE}/bff/award-finder/destinations/v1?market=no-no&origin=${encodeURIComponent(origin)}` +
  `&destinations=${codes.map(encodeURIComponent).join(",")}&selectedMonth=&passengers=1&direct=false&availability=${availability}` +
  (availability ? "" : "&selectedFlightClass=");

export const offersUrl = (origin, dest, date) =>
  `${SAS_BASE}/book/flights/api/offers/flights?to=${encodeURIComponent(dest)}&from=${encodeURIComponent(origin)}` +
  `&outDate=${date.replaceAll("-", "")}&adt=1&chd=0&inf=0&yth=0&bookingFlow=points&pos=no&channel=web&displayType=upsell`;

/**
 * Destinations to ask about for a search. Only the region narrows it: the list's flightClasses
 * reflect where award seats are open right now, so filtering on them would miss seats that open later.
 */
export function pickDestinations(destinations, { region, dest }) {
  if (dest) return destinations.filter((d) => d.airportCode === dest || d.cityCode === dest);
  return destinations.filter((d) => region === "all" || regionOf(d) === region);
}

/** Destination list for the "Til" picker: code, city, airport, country and region, sorted by city. */
export function destinationChoices(destinations, partnerChoices = []) {
  // City codes where SAS has one (TYO for Haneda), so SAS and partner seats meet in one choice.
  const map = new Map();
  for (const d of destinations) {
    const code = d.cityCode || d.airportCode;
    if (!map.has(code)) map.set(code, { code, city: d.cityName || d.airportName, airport: d.airportName, country: d.countryName, region: regionOf(d), sas: true });
  }
  for (const p of partnerChoices) {
    const known = map.get(p.code);
    if (known) known.partner = true;
    else map.set(p.code, p);
  }
  return [...map.values()].sort((a, b) => a.city.localeCompare(b.city, "nb"));
}

/** Award Finder on sas.no for a route, where the user can see the seats and book. */
export const awardFinderUrl = (origin, dest) =>
  `${SAS_BASE}/award-finder?origin=${encodeURIComponent(origin)}${dest ? `&destination=${encodeURIComponent(dest)}` : ""}`;

/** Award seats per day and class from an Award Finder availability answer, as Bonusjakt trips. */
export function parseAvailability(items, { origin, start, end }) {
  const trips = [];
  for (const d of Array.isArray(items) ? items : []) {
    for (const day of d.availability?.outbound || []) {
      if (day.date < start || day.date > end) continue;
      for (const [code, cabin] of Object.entries(CLASS_TO_CABIN)) {
        const seats = Number(day[code]) || 0;
        if (!seats) continue;
        trips.push({
          key: `${day.date}|${origin}|${d.airportCode}|${cabin}`,
          date: day.date, origin, dest: d.airportCode, destCityCode: d.cityCode, destName: d.cityName || d.airportName,
          region: regionOf(d), cabin, airlines: ["SK"],
          pts: null, taxes: null, taxCurrency: "NOK",
          // Award Finder shows at most 10 per class; 10 means "10 or more".
          seats, direct: null, source: "sas.no", award: true,
        });
      }
    }
  }
  return trips;
}

/**
 * Award prices from a booking answer: the lowest points and taxes per cabin among award products
 * (isStandardAward). One adult; taxes in the answer's currency.
 */
export function parseAwardPrices(offer) {
  const prices = {};
  const cabinKey = { ECONOMY: "economy", PREMIUM: "premium", BUSINESS: "business" };
  for (const flight of Object.values(offer?.outboundFlights || {})) {
    for (const [cab, products] of Object.entries(flight.cabins || {})) {
      const cabin = cabinKey[cab];
      if (!cabin) continue;
      for (const group of Object.values(products || {})) {
        for (const p of Object.values(group?.products || {})) {
          if (!p?.isStandardAward) continue;
          const pts = Number(p.price?.pointsAfterDiscount ?? p.price?.points);
          if (!pts) continue;
          const tax = Number(p.price?.totalTax);
          if (!prices[cabin] || pts < prices[cabin].pts) prices[cabin] = { pts, taxes: Number.isFinite(tax) ? tax : null, currency: p.price?.currency || offer?.currency?.code || "NOK" };
        }
      }
    }
  }
  return prices;
}

// ---------- Partner award seats (SkyTeam), from sas.no's award booking: /award-api ----------
// Built from a real recording (November 2026). One request covers one route and one day.
// Every /award-api request needs the headers the sas.no page itself sends (including the login);
// see session-main.js.

export const AWARD_API = `${SAS_BASE}/award-api`;
export const AWARD_APP = `${SAS_BASE}/booking/award/flights`;

export const partnerLocationsUrl = () => `${AWARD_API}/locations?partner=SKYTEAM`;

export function partnerFlightsUrl(origin, dest, date, { pax = 1, oneWay = true } = {}) {
  const base = `${AWARD_API}/flights?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(dest)}&outboundDate=${date}`;
  const trip = oneWay ? "&tripType=one-way" : `&inboundDate=${addDaysIso(date, 7)}&tripType=round-trip`;
  return `${base}${trip}&adults=${pax}&children=0&infants=0&youths=0`;
}
const addDaysIso = (iso, n) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

const PARTNER_REGION = { Europe: "europa", Asia: "asia", America: "nord-amerika" };

/** Partner destinations for the "Til" picker, by city code (LON, TYO, NYC …). */
export function partnerLocationChoices(locations) {
  return Object.values(locations || {}).filter((c) => c?.cityCode).map((c) => {
    const a = c.airports?.[0] || {};
    const region = REGION_BY_COUNTRY[c.countryName] || PARTNER_REGION[a.regionName] || null;
    return { code: c.cityCode, city: c.cityName, airport: (c.airports || []).map((x) => x.airportName).join(", ") || c.cityName, country: c.countryName, region, partner: true };
  });
}

/** Outbound partner (and SAS) award flights from one /award-api/flights answer, as trips. */
export function parsePartnerFlights(answer, { origin, destName }) {
  const trips = [];
  for (const f of answer?.outboundFlights || []) {
    const date = String(f.startDateTimeInLocal || "").slice(0, 10);
    const airlines = [...new Set((f.segments || []).map((s) => s.operatingCarrier?.code || s.marketingCarrier?.code).filter(Boolean))];
    for (const c of f.cabins || []) {
      const cabin = { economy: "economy", premium: "premium", business: "business" }[String(c.cabin).toLowerCase()];
      if (!cabin) continue;
      const prices = Object.values(c.price || {}).filter((p) => p?.type === "points" && p.points > 0);
      if (!prices.length) continue;
      const best = prices.reduce((a, b) => (b.points < a.points ? b : a));
      trips.push({
        key: `${date}|${origin}|${f.destination?.code}|${cabin}|${airlines.join("-")}|${(f.segments || []).map((s) => s.flightNumber).join("-")}`,
        date, origin, dest: f.destination?.code, destCityCode: f.destinationCity?.code, destName,
        region: null, cabin, airlines,
        pts: best.points,
        // The answer shows 0 in taxes before the booking step; treat that as not known yet.
        taxes: best.totalTax > 0 ? best.totalTax : null, taxCurrency: "NOK",
        seats: Number(c.availableSeats) || null, direct: f.stops === 0, source: "sas.no partner", award: true, partner: f.awardType !== "SAS",
      });
    }
  }
  return trips;
}
