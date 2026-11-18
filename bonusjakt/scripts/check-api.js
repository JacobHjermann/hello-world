// Verifies the seats.aero key and shows what the API returns, so field names can be checked.
// Usage: npm run check-api   (reads SEATSAERO_API_KEY from .env)
import { config } from "../src/config.js";
import { createSeatsAeroProvider } from "../src/providers/seatsaero.js";

if (!config.seatsAero.apiKey) {
  console.error("SEATSAERO_API_KEY mangler. Legg den inn i .env først.");
  process.exit(1);
}

const start = new Date(); start.setDate(start.getDate() + 30);
const end = new Date(start); end.setDate(end.getDate() + 14);
const iso = (d) => d.toISOString().slice(0, 10);

const url = new URL(config.seatsAero.baseUrl + "/availability");
url.search = new URLSearchParams({ source: config.seatsAero.source, origin_region: "Europe", start_date: iso(start), end_date: iso(end), take: "3" });
const res = await fetch(url, { headers: { "Partner-Authorization": config.seatsAero.apiKey, accept: "application/json" } });
console.log(`HTTP ${res.status} fra ${url}`);
const body = await res.json().catch(() => null);
console.log("Første rad slik seats.aero sender den:\n", JSON.stringify(body?.data?.[0], null, 2));

const provider = createSeatsAeroProvider(config.seatsAero);
const trips = await provider.fetchTrips({ origin: "OSL", region: "all", cabins: ["business", "premium", "economy"], start: iso(start), end: iso(end) });
console.log(`\nFant ${trips.length} reiser fra OSL ${iso(start)}–${iso(end)}. Eksempel etter tolkning:\n`, trips.slice(0, 3));
