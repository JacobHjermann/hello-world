import { formatDate } from "./search.js";

const CAB = { business: "Business", premium: "Premium", economy: "Economy" };
const fmt = (n) => n.toLocaleString("nb-NO");

function offsetText(d) {
  if (d === 0) return "ønsket dato";
  return `${Math.abs(d)} ${Math.abs(d) === 1 ? "dag" : "dager"} ${d < 0 ? "før" : "etter"} ønsket dato`;
}

export function tripLine(t) {
  const pts = `${fmt(t.pointsTotal)} poeng totalt${t.amexApplied ? " med Amex 2 for 1" : ""}`;
  const seats = t.seatsUnknown ? "ukjent antall seter" : `${t.seats} ${t.seats === 1 ? "sete" : "seter"}`;
  return `${CAB[t.cabin]} ${t.origin} → ${t.dest} (${t.destCity}) ${formatDate(t.date)}, ${offsetText(t.daysFromWanted)}. ${t.airlineNames.join("/")}, ${seats}, ${pts}.`;
}

/** Build the e-mail, SMS and Telegram text for new trips found by one alert. */
export function buildAlertMessage(watch, hits, publicUrl = "") {
  const top = [...hits].sort((a, b) => a.pointsTotal - b.pointsTotal).slice(0, 8);
  const subject = `Bonusjakt: ${hits.length} ${hits.length === 1 ? "ledig reise" : "ledige reiser"} – ${watch.name}`;
  const more = hits.length > top.length ? `\n…og ${hits.length - top.length} til.` : "";
  const link = publicUrl ? `\n\nSe alle: ${publicUrl}` : "";
  const text = `Nye ledige bonusreiser for varselet «${watch.name}»:\n\n${top.map((t) => "• " + tripLine(t)).join("\n")}${more}\n\nBestill på flysas.com før setene forsvinner.${link}`;
  const first = top[0];
  const short = `Bonusjakt: ${tripLine(first)}${hits.length > 1 ? ` (+${hits.length - 1} til)` : ""} Bestill på flysas.com.`;
  return { subject, text, short };
}
