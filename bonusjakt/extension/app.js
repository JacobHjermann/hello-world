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

const st = { region: "all", cabins: new Set(["business"]), pax: 2, partners: true, amex: false };
let status = null;

const params = () => ({ from: $("from").value, want: $("want").value, flex: Number($("flex").value), region: st.region, cabins: [...st.cabins], pax: st.pax, partners: st.partners, amex: st.amex });
const setPax = (n) => { st.pax = Math.max(1, Math.min(9, n)); $("paxv").textContent = st.pax; };

// ---------- Filters ----------
$("regions").addEventListener("click", (e) => {
  const b = e.target.closest(".chip"); if (!b) return;
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
["want", "flex"].forEach((id) => $(id).addEventListener("change", flexNote));
function flexNote() {
  const want = $("want").value, fx = Number($("flex").value);
  if (!want) return;
  $("flexnote").innerHTML = fx ? `Søker fra <b>${dLabel(addDays(want, -fx))}</b> til <b>${dLabel(addDays(want, fx))}</b>.` : `Søker kun <b>${dLabel(want)}</b>.`;
}

// ---------- Search ----------
$("search").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("go"); btn.disabled = true; btn.innerHTML = '<span class="spin"></span>Søker…';
  $("results-head").hidden = false;
  try {
    const data = await call("search", { params: params() });
    render(data.results, data.expired);
  } catch (err) {
    $("count").textContent = "Søket feilet";
    $("list").innerHTML = `<div class="empty">${esc(err.message)}</div>`;
  } finally { btn.disabled = false; btn.textContent = "Søk nå"; }
});

function render(list, expired) {
  list.sort((a, b) => a.pointsTotal - b.pointsTotal);
  $("count").textContent = `${list.length} ${list.length === 1 ? "ledig bonusreise" : "ledige bonusreiser"} for ${st.pax} ${st.pax === 1 ? "person" : "personer"}`;
  if (!list.length) {
    $("list").innerHTML = `<div class="empty">${expired ? "Datoen har passert." : "Ingen ledige seter med disse filtrene akkurat nå. Lagre søket som varsel, så sier vi fra når noe dukker opp."}</div>`;
    return;
  }
  $("list").innerHTML = list.slice(0, 60).map((f) => {
    const cls = f.cabin === "business" ? "biz" : f.cabin === "premium" ? "prem" : "";
    const off = f.daysFromWanted === 0 ? "Ønsket dato" : `${Math.abs(f.daysFromWanted)} ${Math.abs(f.daysFromWanted) === 1 ? "dag" : "dager"} ${f.daysFromWanted < 0 ? "før" : "etter"}`;
    const seats = f.seatsUnknown ? `<span class="seats unk">Antall seter ukjent</span>` : `<span class="seats ${f.seats <= st.pax + 1 ? "low" : "ok"}">${f.seats} ${f.seats === 1 ? "sete" : "seter"} ledig</span>`;
    const taxes = f.taxesTotal == null ? "skatter ukjent" : `${fmt(f.taxesTotal)} ${esc(f.taxCurrency || "")} i skatter`;
    return `<article class="card">
      <div class="route"><div><div class="iata">${esc(f.origin)}</div><div class="city">${esc(f.originCity)}</div></div>
        <div class="arrow"></div><div><div class="iata">${esc(f.dest)}</div><div class="city">${esc(f.destCity)}</div></div></div>
      <div class="meta"><div>${dLabel(f.date)} ${f.date.slice(0, 4)}${f.direct === true ? " · Direkte" : f.direct === false ? " · Med stopp" : ""}</div>
        <div class="tags"><span class="tag ${cls}">${CABNAME[f.cabin]}</span><span class="tag ${f.sasOperated ? "" : "partner"}">${esc(f.airlineNames.join(" / "))}</span>
          <span class="tag off">${off}</span>${f.amexApplied ? '<span class="tag amex">Amex 2 for 1</span>' : ""}</div></div>
      <div class="price"><div class="pts">${f.amexApplied ? `<span class="strike">${fmt(f.pointsWithoutAmex)}</span>` : ""}${fmt(f.pointsTotal)} <small>poeng</small></div>
        <div class="sub">${f.amexApplied ? `Én betaler ${fmt(f.pointsPerPerson)} p, én reiser gratis` : `${fmt(f.pointsPerPerson)} p per person`} + ${taxes}</div>
        <div class="seats-row">${seats}<a class="book" href="https://www.flysas.com/no-no/" target="_blank" rel="noopener">Bestill ↗</a></div></div>
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
  try { const w = await call("addWatch", { params: params() }); toast(`Varselet «${w.name}» er lagret.`); await load(); } catch (err) { toast(err.message); }
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

// ---------- Recorder ----------
$("recording").onchange = async (e) => { await call("setRecording", { on: e.target.checked }); toast(e.target.checked ? "Opptak er på. Gjør et bonussøk på flysas.com." : "Opptak er av."); };
$("recclear").onclick = async () => { await call("clearRecordings"); await load(); toast("Opptaket er slettet."); };
$("recdownload").onclick = async () => {
  const { recordings } = await call("getRecordings");
  if (!recordings.length) return toast("Ingenting er tatt opp ennå.");
  const blob = new Blob([JSON.stringify({ version: chrome.runtime.getManifest().version, recordings }, null, 2)], { type: "application/json" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `bonusjakt-opptak-${new Date().toISOString().slice(0, 10)}.json` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
};

// ---------- Load ----------
async function load() {
  status = await call("status");
  const s = status.settings;
  $("mode").textContent = s.demo ? "Eksempeldata" : "flysas.com";
  $("last").textContent = timeLabel(status.runs.lastRun);
  $("next").textContent = status.nextRun ? timeLabel(status.nextRun) : "–";
  $("dot").classList.toggle("bad", Boolean(status.runs.lastError));
  $("autostate").textContent = status.runs.lastError ? "Siste søk feilet" : "Automatisk søk er på";
  const banner = $("banner");
  if (status.runs.lastError) { banner.hidden = false; banner.className = "banner bad"; banner.textContent = status.runs.lastError; }
  else if (s.demo) { banner.hidden = false; banner.className = "banner"; banner.textContent = "Viser eksempeldata. SAS-koblingen blir ferdig når Claude har fått et opptak av ett bonussøk (se «Datakilde» nederst)."; }
  else banner.hidden = true;
  $("demo").checked = s.demo;
  $("source-text").textContent = s.demo ? "Akkurat nå brukes oppdiktede eksempelreiser, så du kan prøve alt." : "Søker på flysas.com gjennom din egen innlogging i Chrome.";
  $("ch-desktop").checked = s.channels.desktop; $("ch-telegram").checked = s.channels.telegram;
  if (document.activeElement !== $("tg-token")) $("tg-token").value = s.telegramToken;
  if (document.activeElement !== $("tg-chat")) $("tg-chat").value = s.telegramChatId;
  $("recording").checked = status.recording;
  $("reccount").textContent = `${status.recordingCount} ${status.recordingCount === 1 ? "svar" : "svar"} tatt opp`;
  renderWatches();
}

(async function init() {
  try {
    await load();
    $("from").innerHTML = Object.entries(status.origins).map(([code, city]) => `<option value="${code}">${esc(city)} (${code})</option>`).join("");
    $("want").min = status.today;
    $("want").value = addDays(status.today, 60);
    flexNote();
  } catch (err) {
    $("list").innerHTML = `<div class="empty">${esc(err.message)}</div>`;
  }
})();
