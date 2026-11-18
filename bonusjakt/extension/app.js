import { price } from "./shared/search.js";

const $ = (id) => document.getElementById(id);
const fmt = (n) => n.toLocaleString("nb-NO");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const MONTHS = ["jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "des"];
const CABNAME = { business: "Business", premium: "Premium", economy: "Economy" };
const dLabel = (iso) => { const [, m, d] = iso.split("-").map(Number); return `${d}. ${MONTHS[m - 1]}`; };
const addDays = (iso, n) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const timeLabel = (iso) => {
  if (!iso) return "aldri";
  const d = new Date(iso), now = new Date();
  const hm = d.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" });
  return d.toDateString() === now.toDateString() ? `i dag ${hm}` : `${d.getDate()}. ${MONTHS[d.getMonth()]} ${hm}`;
};

// The toolbar popup is narrow; the same page opened in a tab ("?full") gets the wide layout.
if (!location.search.includes("full")) document.documentElement.classList.add("popup");

async function call(type, payload = {}) {
  const res = await chrome.runtime.sendMessage({ type, ...payload });
  if (!res?.ok) throw new Error(res?.error || "Fikk ikke svar fra utvidelsen.");
  return res.data;
}
function toast(t) { const el = document.createElement("div"); el.className = "toast"; el.setAttribute("role", "status"); el.textContent = t; document.body.append(el); setTimeout(() => el.remove(), 3600); }

const st = { region: "all", cabins: new Set(["business"]), pax: 2, partners: true, amex: false, tripType: "round" };
let status = null;

let destChoices = [];
// "Tokyo (HND)" or "HND" → the destination; empty means the whole region.
function chosenDest() {
  const v = $("to").value.trim();
  if (!v) return null;
  const code = (v.match(/\(([A-Z]{3})\)\s*$/) || v.toUpperCase().match(/^([A-Z]{3})$/) || [])[1];
  return destChoices.find((d) => d.code === code) || destChoices.find((d) => d.city.toLowerCase() === v.toLowerCase()) || null;
}
const params = () => ({ from: $("from").value, tripType: st.tripType, want: $("want").value, back: $("back").value, flex: Number($("flex").value), region: st.region, dest: chosenDest()?.code || "", cabins: [...st.cabins], pax: st.pax, partners: st.partners, amex: st.amex });

// ---------- Trip type: round trip, only out, only home ----------
function setTripType(v) {
  st.tripType = v;
  $("triptype").querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", c.dataset.v === v));
  $("want-field").hidden = v === "home";
  $("back-field").hidden = v === "out";
  $("to").placeholder = v === "home" ? "Hvor reiser du hjem fra? (alle i verdensdelen)" : "Alle i valgt verdensdel";
  flexNote();
}
$("triptype").addEventListener("click", (e) => { const b = e.target.closest(".chip"); if (b) setTripType(b.dataset.v); });

async function loadDestinations() {
  try {
    destChoices = await call("destinations", { origin: $("from").value });
    $("to-list").innerHTML = destChoices.map((d) => `<option value="${esc(d.city)} (${d.code})">${esc(d.airport)}${d.country ? ", " + esc(d.country) : ""}${d.sas && d.partner ? " · SAS og partnere" : d.partner ? " · partnerfly" : ""}</option>`).join("");
  } catch { destChoices = []; }
}
$("from").addEventListener("change", () => { $("to").value = ""; loadDestinations(); });
// Picking a destination shows its region's picture and selects that region.
$("to").addEventListener("change", () => {
  const d = chosenDest();
  if ($("to").value.trim() && !d) { toast("Fant ikke den destinasjonen i SAS sin liste. Velg fra lista som dukker opp når du skriver."); return; }
  if (d?.region) $("regions").querySelector(`[data-v="${d.region}"]`)?.click();
});
const setPax = (n) => { st.pax = Math.max(1, Math.min(9, n)); $("paxv").textContent = st.pax; };

// ---------- Filters ----------
$("regions").addEventListener("click", (e) => {
  const b = e.target.closest(".chip"); if (!b) return;
  // Clicking another region than the chosen destination's means "search the region".
  if (e.isTrusted && chosenDest() && chosenDest().region !== b.dataset.v) $("to").value = "";
  st.region = b.dataset.v;
  $("regions").querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", c === b));
  document.querySelectorAll(".scene").forEach((sc) => sc.classList.toggle("on", sc.dataset.scene === st.region));
  $("caption").textContent = window.SCENES[st.region].cap; $("h1").textContent = window.SCENES[st.region].h;
});
$("cabins").addEventListener("click", (e) => {
  const b = e.target.closest(".chip"); if (!b) return; const v = b.dataset.v;
  if (st.cabins.has(v)) { if (st.cabins.size === 1) return; st.cabins.delete(v); } else st.cabins.add(v);
  b.setAttribute("aria-pressed", st.cabins.has(v));
});
$("minus").onclick = () => { setPax(st.pax - 1); if (st.pax < 2 && st.amex) { st.amex = false; $("amex").checked = false; } };
$("plus").onclick = () => setPax(st.pax + 1);
$("partners").onchange = (e) => { st.partners = e.target.checked; };
$("amex").onchange = (e) => { st.amex = e.target.checked; if (st.amex && st.pax < 2) setPax(2); };
["want", "back", "flex"].forEach((id) => $(id).addEventListener("change", flexNote));
// Keep the return date after the outbound date.
$("want").addEventListener("change", () => { if ($("back").value && $("back").value < $("want").value) $("back").value = addDays($("want").value, 14); flexNote(); });
function flexNote() {
  const fx = Number($("flex").value);
  const span = (d) => (fx ? `<b>${dLabel(addDays(d, -fx))}</b>–<b>${dLabel(addDays(d, fx))}</b>` : `<b>${dLabel(d)}</b>`);
  const parts = [];
  if (st.tripType !== "home" && $("want").value) parts.push(`ut ${span($("want").value)}`);
  if (st.tripType !== "out" && $("back").value) parts.push(`hjem ${span($("back").value)}`);
  $("flexnote").innerHTML = parts.length ? `Søker ${parts.join(", ")}.` : "";
}

// ---------- Search ----------
// ---------- Progress bar and "Avbryt søk" ----------
const PHASE = { search: "Søker", prices: "Henter poengpriser" };
function showProgress(kind) {
  $("progress").hidden = false;
  $("progress").classList.add("indeterminate");
  $("progress-text").textContent = `${PHASE[kind]} …`;
  $("progress-count").textContent = "";
  $("progress-bar").style.width = "8%";
  $("cancel").disabled = false;
}
const hideProgress = () => { $("progress").hidden = true; };
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type !== "progress" || $("progress").hidden || msg.finished) return;
  if (msg.total) {
    $("progress").classList.remove("indeterminate");
    $("progress-bar").style.width = `${Math.max(4, Math.round((msg.done / msg.total) * 100))}%`;
    $("progress-count").textContent = `${msg.done} av ${msg.total} forespørsler`;
  }
  $("progress-text").textContent = msg.phase ? `${PHASE[msg.kind] || "Søker"} · ${msg.phase}` : `${PHASE[msg.kind] || "Søker"} …`;
});
$("cancel").onclick = async () => {
  $("cancel").disabled = true;
  $("progress-text").textContent = "Avbryter etter forespørselen som pågår …";
  try { await call("cancel"); } catch { /* the search ends on its own */ }
};
const isCancel = (err) => /avbrutt/i.test(err?.message || "");

$("search").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("go"); btn.disabled = true; btn.innerHTML = '<span class="spin"></span>Søker…';
  $("results-head").hidden = false;
  showProgress("search");
  try {
    const data = await call("search", { params: params() });
    lastResults = data.results;
    render(lastResults, data.expired);
    hideProgress();
    fillPrices(lastResults);
  } catch (err) {
    hideProgress();
    $("count").textContent = isCancel(err) ? "Søket ble avbrutt" : "Søket feilet";
    $("list").innerHTML = `<div class="empty">${isCancel(err) ? "Du avbrøt søket. Trykk «Søk nå» for å søke igjen." : esc(err.message)}</div>`;
  } finally { btn.disabled = false; btn.textContent = "Søk nå"; }
});

let lastResults = [];

// Look up points for the results that don't have them yet, then show them.
async function fillPrices(results) {
  const missing = results.filter((r) => r.pointsTotal == null);
  if (!missing.length) return;
  const routes = [...new Map(missing.map((r) => [`${r.origin}-${r.dest}`, { origin: r.origin, dest: r.dest, date: r.date }])).values()];
  showProgress("prices");
  let prices = {}, cancelled = false;
  try { prices = await call("prices", { routes }); } catch (err) { cancelled = isCancel(err); }
  if (results !== lastResults) return; // a newer search has started
  hideProgress();
  for (const r of results) {
    if (r.pointsTotal != null) continue;
    const p = prices[`${r.origin}-${r.dest}`]?.[r.cabin];
    if (p) Object.assign(r, { pts: p.pts, taxes: p.taxes, taxCurrency: p.currency }, price({ ...r, pts: p.pts, taxes: p.taxes }, { pax: st.pax, amex: st.amex }));
    else r.priceMissing = cancelled ? "cancelled" : true;
  }
  render(results);
}

const awardFinderUrl = (f) => `https://www.sas.no/award-finder?origin=${encodeURIComponent(f.origin)}&destination=${encodeURIComponent(f.dest)}`;
// Partner award seats are booked in sas.no's partner award booking (same address the site uses).
const partnerBookingUrl = (f) => `https://www.sas.no/booking/award/flights?origin=${encodeURIComponent(f.origin)}&destination=${encodeURIComponent(f.destCityCode || f.dest)}&outboundDate=${f.date}&adults=${st.pax}&children=0&infants=0`;
const bookLink = (f) => f.source === "sas.no partner"
  ? `<a class="book" href="${partnerBookingUrl(f)}" target="_blank" rel="noopener">Bestill partnerreise ↗</a>`
  : `<a class="book" href="${awardFinderUrl(f)}" target="_blank" rel="noopener">Bestill i Award Finder ↗</a>`;

function render(list, expired) {
  list.sort((a, b) => (a.pointsTotal ?? Infinity) - (b.pointsTotal ?? Infinity));
  const who = `for ${st.pax} ${st.pax === 1 ? "person" : "personer"}`;
  const out = list.filter((f) => f.dir !== "home"), home = list.filter((f) => f.dir === "home");
  if (out.length && home.length) {
    const places = new Set(list.map((f) => f.awayKey)).size;
    $("count").textContent = `${places} ${places === 1 ? "destinasjon" : "destinasjoner"} med ledig plass begge veier ${who}`;
  } else {
    $("count").textContent = `${list.length} ${list.length === 1 ? "ledig bonusreise" : "ledige bonusreiser"} ${who}`;
  }
  if (!list.length) {
    const none = st.tripType === "round"
      ? "Fant ingen destinasjon med ledige seter både ut og hjem. Prøv flere dager, flere klasser eller «Bare ut»/«Bare hjem» for å se hver vei for seg."
      : "Ingen ledige seter med disse filtrene akkurat nå. Lagre søket som varsel, så sier vi fra når noe dukker opp.";
    $("list").innerHTML = `<div class="empty">${expired ? "Datoen har passert." : none}</div>`;
    return;
  }
  const section = (title, items) => items.length
    ? `<h3 class="section-h">${title} <small>${items.length} ${items.length === 1 ? "reise" : "reiser"}</small></h3>${cards(items.slice(0, 60))}` : "";
  $("list").innerHTML = out.length && home.length
    ? section("Utreise", out) + section("Hjemreise", home)
    : cards(list.slice(0, 60));
}

function cards(items) {
  return items.map((f) => {
    const cls = f.cabin === "business" ? "biz" : f.cabin === "premium" ? "prem" : "";
    const off = f.daysFromWanted === 0 ? "Ønsket dato" : `${Math.abs(f.daysFromWanted)} ${Math.abs(f.daysFromWanted) === 1 ? "dag" : "dager"} ${f.daysFromWanted < 0 ? "før" : "etter"}`;
    // SAS's Award Finder caps the count at 10, so 10 means "10 or more".
    const n = f.source === "sas.no" && f.seats >= 10 ? "10+" : f.seats;
    const seats = f.seatsUnknown ? `<span class="seats unk">Antall seter ukjent</span>` : `<span class="seats ${f.seats <= st.pax + 1 ? "low" : "ok"}">${n} ${f.seats === 1 ? "sete" : "seter"} ledig</span>`;
    const taxes = f.taxesTotal == null ? "skatter ukjent" : `${fmt(f.taxesTotal)} ${esc(f.taxCurrency || "")} i skatter`;
    return `<article class="card">
      <div class="route"><div><div class="iata">${esc(f.origin)}</div><div class="city">${esc(f.originCity)}</div></div>
        <div class="arrow"></div><div><div class="iata">${esc(f.dest)}</div><div class="city">${esc(f.destCity)}</div></div></div>
      <div class="meta"><div>${dLabel(f.date)} ${f.date.slice(0, 4)}${f.direct === true ? " · Direkte" : f.direct === false ? " · Med stopp" : ""}</div>
        <div class="tags"><span class="tag ${cls}">${CABNAME[f.cabin]}</span><span class="tag ${f.sasOperated ? "" : "partner"}">${esc(f.airlineNames.join(" / "))}</span>
          <span class="tag off">${off}</span>${f.amexApplied ? '<span class="tag amex">Amex 2 for 1</span>' : ""}</div></div>
      <div class="price">${f.pointsTotal == null
        ? `<div class="pts"><small>${f.priceMissing === "cancelled" ? "Poengpris ikke hentet" : f.priceMissing ? "Fant ikke poengprisen" : "Henter poengpris …"}</small></div><div class="sub">${f.amexApplied ? "Amex 2 for 1 gjelder · " : ""}${f.priceMissing ? "se prisen i Award Finder" : ""}</div>`
        : `<div class="pts">${f.amexApplied ? `<span class="strike">${fmt(f.pointsWithoutAmex)}</span>` : ""}${fmt(f.pointsTotal)} <small>poeng</small></div>
        <div class="sub">${f.amexApplied ? `Én betaler ${fmt(f.pointsPerPerson)} p, én reiser gratis` : `${fmt(f.pointsPerPerson)} p per person`} + ${taxes}</div>`}
        <div class="seats-row">${seats}${bookLink(f)}</div></div>
    </article>`;
  }).join("");
}

// ---------- Alerts ----------
function renderWatches() {
  $("watches").innerHTML = status.watches.map((w) => {
    let state;
    if (w.lastError) state = `<span class="w-state err" title="${esc(w.lastError)}">${esc(w.lastError.length > 60 ? w.lastError.slice(0, 60) + "…" : w.lastError)}</span>`;
    else if (!w.lastRun) state = `<span class="w-state wait">Venter på første søk</span>`;
    else if (w.lastHitCount) state = `<span class="w-state hit">${w.lastHitCount} ledige ${timeLabel(w.lastRun)}</span>`;
    else state = `<span class="w-state wait">Ingen ledige ennå</span>`;
    return `<div class="watch"><div class="w-main"><span class="w-title">${esc(w.name)}</span><span class="w-sub">${esc(w.summary)}</span></div>
      <div class="w-side">${state}<button type="button" class="linkbtn" data-del="${w.id}">Slett</button></div></div>`;
  }).join("") || `<div class="watch"><span class="w-sub">Ingen varsler ennå. Sett opp et søk over og trykk «Varsle meg».</span></div>`;
}
$("watches").addEventListener("click", async (e) => {
  const del = e.target.closest("[data-del]"); if (!del) return;
  if (del.dataset.confirm !== "1") { del.dataset.confirm = "1"; del.textContent = "Trykk igjen for å slette"; return; }
  try { await call("removeWatch", { id: del.dataset.del }); toast("Varselet er slettet."); await load(); } catch (err) { toast(err.message); }
});
$("save").onclick = async () => {
  try { const w = await call("addWatch", { params: params(), destName: chosenDest()?.city }); toast(`Varselet «${w.name}» er lagret.`); await load(); } catch (err) { toast(err.message); }
};
$("runall").onclick = async () => {
  const b = $("runall"); b.disabled = true; b.textContent = "Kjører…";
  try {
    const { summary } = await call("run");
    toast(summary.length ? `Ferdig. ${summary.reduce((s, i) => s + i.new, 0)} nye ledige reiser.` : "Du har ingen varsler å kjøre.");
    await load();
  } catch (err) { toast(err.message); }
  b.disabled = false; b.textContent = "Kjør alle varsler nå";
};

// ---------- Settings ----------
$("settings").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await call("saveSettings", { patch: { telegramToken: $("tg-token").value.trim(), telegramChatId: $("tg-chat").value.trim(), channels: { desktop: $("ch-desktop").checked, telegram: $("ch-telegram").checked } } });
    toast("Lagret.");
  } catch (err) { toast(err.message); }
});
$("testnotify").onclick = async () => {
  try {
    $("settings").requestSubmit();
    await new Promise((r) => setTimeout(r, 300));
    const { results } = await call("testNotify");
    toast(results.map((r) => `${r.channel === "desktop" ? "PC" : "Telegram"}: ${r.ok ? "sendt" : r.error}`).join(" · "));
  } catch (err) { toast(err.message); }
};
$("demo").onchange = async (e) => { await call("saveSettings", { patch: { demo: e.target.checked } }); await load(); };

// ---------- Diagnosis ----------
$("diag").onclick = async () => {
  const b = $("diag"), out = $("diag-out");
  b.disabled = true; b.textContent = "Tester…"; out.hidden = false; out.textContent = "Spør sas.no …";
  try { out.textContent = (await call("diagnose")).report; } catch (err) { out.textContent = err.message; }
  b.disabled = false; b.textContent = "Test SAS-koblingen";
};

// ---------- Load ----------
async function load() {
  status = await call("status");
  const s = status.settings;
  $("mode").textContent = s.demo ? "Eksempeldata" : "sas.no";
  $("last").textContent = timeLabel(status.runs.lastRun);
  $("next").textContent = status.nextRun ? timeLabel(status.nextRun) : "–";
  $("dot").classList.toggle("bad", Boolean(status.runs.lastError));
  $("autostate").textContent = status.runs.lastError ? "Siste søk feilet" : "Automatisk søk er på";
  const banner = $("banner");
  if (status.runs.lastError) { banner.hidden = false; banner.className = "banner bad"; banner.textContent = status.runs.lastError; }
  else if (s.demo) { banner.hidden = false; banner.className = "banner"; banner.textContent = "Viser eksempeldata. Slå av «Bruk eksempeldata» under «Datakilde» nederst for å søke på sas.no."; }
  else banner.hidden = true;
  $("demo").checked = s.demo;
  $("source-text").textContent = s.demo
    ? "Akkurat nå brukes oppdiktede eksempelreiser, så du kan prøve alt."
    : "Søker etter bonusseter i SAS Award Finder på sas.no, gjennom din egen innlogging i Chrome. Award Finder viser SAS sine egne fly; bonusseter hos partnere er ikke med.";
  $("ch-desktop").checked = s.channels.desktop; $("ch-telegram").checked = s.channels.telegram;
  if (document.activeElement !== $("tg-token")) $("tg-token").value = s.telegramToken;
  if (document.activeElement !== $("tg-chat")) $("tg-chat").value = s.telegramChatId;
  renderWatches();
}

(async function init() {
  try {
    await load();
    $("from").innerHTML = Object.entries(status.origins).map(([code, city]) => `<option value="${code}">${esc(city)} (${code})</option>`).join("");
    loadDestinations();

    $("want").min = status.today;
    $("want").value = addDays(status.today, 60);
    $("back").min = status.today;
    $("back").value = addDays(status.today, 74);
    setTripType("round");
    flexNote();
  } catch (err) {
    $("list").innerHTML = `<div class="empty">${esc(err.message)}</div>`;
  }
})();
