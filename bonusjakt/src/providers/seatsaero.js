// seats.aero Partner API client (https://seats.aero, "Pro" subscription gives an API key).
//
// NOTE: the field and parameter names below are written from seats.aero's published API as known
// when this was built; the documentation could not be fetched during development. Everything that
// depends on the exact API shape lives in this file, so if seats.aero names something differently,
// this is the only place to change. Run `npm run check-api` after adding your key to verify.

import { REGIONS, regionFromSeatsAero } from "../airports.js";

const CABIN_PREFIX = { economy: "Y", premium: "W", business: "J" };

export class SeatsAeroError extends Error {}

export function createSeatsAeroProvider(cfg, fetchImpl = globalThis.fetch) {
  async function get(pathname, params) {
    const url = new URL(cfg.baseUrl.replace(/\/$/, "") + pathname);
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
    const res = await fetchImpl(url, { headers: { "Partner-Authorization": cfg.apiKey, accept: "application/json" } });
    if (res.status === 401 || res.status === 403) throw new SeatsAeroError("seats.aero avviste API-nøkkelen. Sjekk SEATSAERO_API_KEY.");
    if (res.status === 429) throw new SeatsAeroError("seats.aero sier at vi har brukt opp dagens kvote med søk. Prøv igjen senere.");
    if (!res.ok) throw new SeatsAeroError(`seats.aero svarte med feil ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res.json();
  }

  return {
    name: "seats.aero",
    live: true,
    /**
     * Fetch all award availability from `origin` in [start, end], optionally limited to one region and cabin.
     * Returns normalized trips (see normalizeAvailability).
     */
    async fetchTrips({ origin, region, cabins, start, end }) {
      const params = {
        source: cfg.source,
        start_date: start,
        end_date: end,
        origin_region: "Europe",
        destination_region: region && region !== "all" ? REGIONS[region]?.seatsAero : undefined,
        cabin: cabins.length === 1 ? cabins[0] : undefined,
        take: 1000,
      };
      const trips = [];
      let skip = 0, cursor;
      for (let page = 0; page < cfg.maxPages; page++) {
        const body = await get("/availability", { ...params, skip: skip || undefined, cursor });
        const rows = Array.isArray(body?.data) ? body.data : [];
        for (const row of rows) {
          if (routeOf(row).OriginAirport !== origin) continue;
          trips.push(...normalizeAvailability(row, cfg));
        }
        if (!body?.hasMore || rows.length === 0) break;
        skip += rows.length;
        cursor = body.cursor ?? cursor;
      }
      return trips;
    },
  };
}

const routeOf = (row) => row.Route || {};

/** Turn one seats.aero availability row into one trip per available cabin. */
export function normalizeAvailability(row, cfg = { taxDivisor: 100, source: "eurobonus" }) {
  const route = routeOf(row);
  const date = String(row.Date || row.ParsedDate || "").slice(0, 10);
  const out = [];
  for (const [cabin, p] of Object.entries(CABIN_PREFIX)) {
    if (!row[`${p}Available`]) continue;
    const pts = Number(row[`${p}MileageCostRaw`] ?? String(row[`${p}MileageCost`] ?? "").replace(/\D/g, ""));
    if (!pts) continue;
    const seats = Number(row[`${p}RemainingSeats`]) || null; // 0 means "unknown" at seats.aero
    const rawTax = row[`${p}TotalTaxes`] ?? row[`${p}TotalTaxesRaw`];
    const taxes = rawTax === undefined || rawTax === null || rawTax === "" ? null : Math.round(Number(rawTax) / (cfg.taxDivisor || 1));
    const airlines = String(row[`${p}Airlines`] || "").split(/[,\s]+/).filter(Boolean);
    out.push({
      key: `${date}|${route.OriginAirport}|${route.DestinationAirport}|${cabin}`,
      date,
      origin: route.OriginAirport,
      dest: route.DestinationAirport,
      region: regionFromSeatsAero(route.DestinationRegion),
      cabin,
      airlines,
      pts,
      taxes: Number.isFinite(taxes) ? taxes : null,
      taxCurrency: row.TaxesCurrency || null,
      seats,
      direct: typeof row[`${p}Direct`] === "boolean" ? row[`${p}Direct`] : null,
      source: row.Source || route.Source || cfg.source,
    });
  }
  return out;
}
