// Region ids used by the web page, mapped to seats.aero region names.
export const REGIONS = {
  europa: { name: "Europa", seatsAero: "Europe" },
  "nord-amerika": { name: "Nord-Amerika", seatsAero: "North America" },
  "sor-amerika": { name: "Sør-Amerika", seatsAero: "South America" },
  asia: { name: "Asia", seatsAero: "Asia" },
  midtosten: { name: "Midtøsten", seatsAero: "Middle East" },
  afrika: { name: "Afrika", seatsAero: "Africa" },
  oseania: { name: "Oseania", seatsAero: "Oceania" },
};
export const REGION_IDS = ["all", ...Object.keys(REGIONS)];

export const regionFromSeatsAero = (name) =>
  Object.entries(REGIONS).find(([, r]) => r.seatsAero === name)?.[0] || null;

export const ORIGINS = {
  OSL: "Oslo", BGO: "Bergen", TRD: "Trondheim", SVG: "Stavanger", TOS: "Tromsø", BOO: "Bodø",
  AES: "Ålesund", KRS: "Kristiansand", CPH: "København", ARN: "Stockholm", GOT: "Göteborg", HEL: "Helsingfors",
};

// City names for the destinations SAS and SkyTeam fly most from Scandinavia. Unknown codes show as the code.
export const CITIES = {
  ...ORIGINS,
  CDG: "Paris", ORY: "Paris Orly", AMS: "Amsterdam", FCO: "Roma", MXP: "Milano", BCN: "Barcelona", MAD: "Madrid",
  AGP: "Málaga", ALC: "Alicante", PMI: "Palma", LPA: "Gran Canaria", TFS: "Tenerife", LIS: "Lisboa", ATH: "Aten",
  NCE: "Nice", LHR: "London", LGW: "London Gatwick", DUB: "Dublin", EDI: "Edinburgh", BER: "Berlin", MUC: "München",
  FRA: "Frankfurt", ZRH: "Zürich", VIE: "Wien", PRG: "Praha", IST: "Istanbul", SPU: "Split", DBV: "Dubrovnik",
  KEF: "Reykjavik", RAK: "Marrakech", CAI: "Kairo", CPT: "Cape Town", JNB: "Johannesburg", NBO: "Nairobi",
  JFK: "New York", EWR: "Newark", BOS: "Boston", IAD: "Washington", ORD: "Chicago", MIA: "Miami", ATL: "Atlanta",
  LAX: "Los Angeles", SFO: "San Francisco", SEA: "Seattle", MSP: "Minneapolis", DTW: "Detroit", DFW: "Dallas",
  YYZ: "Toronto", YVR: "Vancouver", YUL: "Montréal", MEX: "Mexico by", CUN: "Cancún",
  GRU: "São Paulo", GIG: "Rio de Janeiro", EZE: "Buenos Aires", SCL: "Santiago", LIM: "Lima", BOG: "Bogotá",
  NRT: "Tokyo Narita", HND: "Tokyo Haneda", ICN: "Seoul", PVG: "Shanghai", PEK: "Beijing", HKG: "Hongkong",
  TPE: "Taipei", BKK: "Bangkok", HKT: "Phuket", SGN: "Ho Chi Minh-byen", HAN: "Hanoi", SIN: "Singapore",
  KUL: "Kuala Lumpur", DEL: "Delhi", BOM: "Mumbai", DXB: "Dubai", DOH: "Doha", RUH: "Riyadh", AUH: "Abu Dhabi",
  SYD: "Sydney", MEL: "Melbourne", BNE: "Brisbane", PER: "Perth", AKL: "Auckland",
};
export const cityName = (code) => CITIES[code] || code;

export const AIRLINES = {
  SK: "SAS", KL: "KLM", AF: "Air France", DL: "Delta", VS: "Virgin Atlantic", KE: "Korean Air", VN: "Vietnam Airlines",
  CI: "China Airlines", AZ: "ITA Airways", AR: "Aerolíneas Argentinas", AM: "Aeroméxico", KQ: "Kenya Airways",
  SV: "Saudia", MU: "China Eastern", UX: "Air Europa", ME: "Middle East Airlines", GA: "Garuda Indonesia",
  RO: "TAROM", WF: "Widerøe", QF: "Qantas", VA: "Virgin Australia", TK: "Turkish Airlines", EK: "Emirates",
};
export const airlineName = (code) => AIRLINES[code] || code;
