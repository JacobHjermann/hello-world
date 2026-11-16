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
  if (dest) return destinations.filter((d) => d.airportCode === dest);
  return destinations.filter((d) => region === "all" || regionOf(d) === region);
}

/** Destination list for the "Til" picker: code, city, airport, country and region, sorted by city. */
export function destinationChoices(destinations) {
  return destinations
    .map((d) => ({ code: d.airportCode, city: d.cityName || d.airportName, airport: d.airportName, country: d.countryName, region: regionOf(d) }))
    .sort((a, b) => a.city.localeCompare(b.city, "nb"));
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
          date: day.date, origin, dest: d.airportCode, destName: d.cityName || d.airportName,
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
