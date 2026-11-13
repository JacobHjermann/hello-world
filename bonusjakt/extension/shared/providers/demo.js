// Example data used when no seats.aero API key is set, so the whole system can be tried out.
// Every trip it returns is made up.

const DEST = {
  europa: [["CDG", ["SK", "AF"]], ["FCO", ["SK", "AZ"]], ["BCN", ["SK"]], ["ATH", ["SK"]], ["AMS", ["KL", "SK"]], ["NCE", ["SK"]]],
  "nord-amerika": [["JFK", ["SK", "DL"]], ["LAX", ["SK", "DL"]], ["MIA", ["SK"]], ["ORD", ["SK"]], ["BOS", ["DL", "VS"]], ["YVR", ["AF"]]],
  "sor-amerika": [["GRU", ["AF", "KL"]], ["EZE", ["AR", "AF"]], ["SCL", ["DL"]], ["LIM", ["KL"]]],
  asia: [["NRT", ["SK", "KE"]], ["BKK", ["SK", "VN"]], ["ICN", ["KE"]], ["SIN", ["KL"]], ["HND", ["SK"]], ["SGN", ["VN"]]],
  midtosten: [["DXB", ["SK"]], ["DOH", ["AF"]], ["RUH", ["SV"]]],
  afrika: [["CPT", ["KL", "AF"]], ["NBO", ["KQ", "KL"]], ["RAK", ["SK"]], ["JNB", ["AF"]]],
  oseania: [["SYD", ["DL", "KE"]], ["MEL", ["CI"]], ["AKL", ["KE"]]],
};
const BASE = { europa: [15000, 25000, 40000], "nord-amerika": [30000, 50000, 70000], "sor-amerika": [35000, 60000, 90000], asia: [35000, 60000, 85000], midtosten: [25000, 45000, 65000], afrika: [30000, 50000, 75000], oseania: [50000, 85000, 120000] };
const CABINS = ["economy", "premium", "business"];
const NONSTOP = new Set(["CDG", "FCO", "BCN", "ATH", "AMS", "NCE", "JFK", "LAX", "MIA", "ORD", "NRT", "BKK", "HND", "DXB", "RAK"]);

function rng(seedStr) {
  let s = 0;
  for (const ch of seedStr) s = (s * 31 + ch.charCodeAt(0)) % 233280;
  return () => (s = (s * 9301 + 49297) % 233280) / 233280;
}
const addDays = (iso, n) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const daysBetween = (a, b) => Math.round((new Date(b + "T12:00:00Z") - new Date(a + "T12:00:00Z")) / 86400000);

export function createDemoProvider() {
  return {
    name: "eksempeldata",
    live: false,
    async fetchTrips({ origin, region, start, end }) {
      const span = daysBetween(start, end);
      const trips = [];
      for (const reg of Object.keys(DEST)) {
        if (region && region !== "all" && reg !== region) continue;
        for (const [dest, airlines] of DEST[reg]) {
          // Seeded per route and day so the same search gives the same answer.
          for (let i = 0; i <= span; i++) {
            const date = addDays(start, i);
            const r = rng(`${origin}${dest}${date}`);
            if (r() > 0.35) continue;
            const ci = Math.floor(r() * 3);
            const isSas = airlines[0] === "SK" && r() > 0.25;
            const op = isSas ? ["SK"] : [airlines[airlines.length - 1]];
            trips.push({
              key: `${date}|${origin}|${dest}|${CABINS[ci]}`,
              date, origin, dest, region: reg, cabin: CABINS[ci], airlines: op,
              pts: Math.round((BASE[reg][ci] * (isSas ? 1 : 1.25) * (0.9 + r() * 0.3)) / 500) * 500,
              taxes: Math.round(((reg === "europa" ? 600 : 1200) * (ci + 1) * (0.8 + r() * 0.5)) / 10) * 10,
              taxCurrency: "NOK",
              seats: 1 + Math.floor(r() * 6),
              direct: isSas && NONSTOP.has(dest),
              source: "eksempeldata",
            });
          }
        }
      }
      return trips;
    },
  };
}
