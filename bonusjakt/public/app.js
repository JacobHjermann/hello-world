(function () {
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => n.toLocaleString("nb-NO");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const MONTHS = ["jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "des"];
  const CABNAME = { business: "Business", premium: "Premium", economy: "Economy" };
  const dLabel = (iso) => { const [, m, d] = iso.split("-").map(Number); return `${d}. ${MONTHS[m - 1]}`; };
  const dFull = (iso) => `${dLabel(iso)} ${iso.slice(0, 4)}`;
  const addDays = (iso, n) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const timeLabel = (iso) => {
    if (!iso) return "aldri";
    const d = new Date(iso), now = new Date();
    const hm = d.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" });
    return d.toDateString() === now.toDateString() ? `i dag ${hm}` : `${d.getDate()}. ${MONTHS[d.getMonth()]} ${hm}`;
  };

  const st = { region: "all", cabins: new Set(["business"]), pax: 2, partners: true, amex: false, sort: "pts" };
  let status = null, lastResults = [], searchSeq = 0;

  async function api(path, opts = {}) {
    const res = await fetch(path, { ...opts, headers: { "content-type": "application/json", ...(opts.headers || {}) } });
    if (res.status === 204) return null;
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `Feil ${res.status}`);
    return body;
  }
  function toast(t) { const el = document.createElement("div"); el.className = "toast"; el.setAttribute("role", "status"); el.textContent = t; document.body.append(el); setTimeout(() => el.remove(), 3600); }

  function params() {
    return { from: $("from").value, want: $("want").value, flex: Number($("flex").value), region: st.region, cabins: [...st.cabins], pax: st.pax, partners: st.partners, amex: st.amex };
  }

  // ---------- Filters ----------
  $("regions").addEventListener("click", (e) => {
    const b = e.target.closest(".chip"); if (!b) return;
    st.region = b.dataset.v;
    $("regions").querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", c === b));
    document.querySelectorAll(".scene").forEach((sc) => sc.classList.toggle("on", sc.dataset.scene === st.region));
    $("caption").textContent = SCENES[st.region].cap; $("h1").textContent = SCENES[st.region].h;
    search();
  });
  $("cabins").addEventListener("click", (e) => {
    const b = e.target.closest(".chip"); if (!b) return; const v = b.dataset.v;
    if (st.cabins.has(v)) { if (st.cabins.size === 1) return; st.cabins.delete(v); } else st.cabins.add(v);
    b.setAttribute("aria-pressed", st.cabins.has(v)); search();
  });
  const setPax = (n) => { st.pax = Math.max(1, Math.min(9, n)); $("paxv").textContent = st.pax; };
  $("minus").onclick = () => { setPax(st.pax - 1); if (st.pax < 2 && st.amex) { st.amex = false; $("amex").checked = false; } search(); };
  $("plus").onclick = () => { setPax(st.pax + 1); search(); };
  $("partners").onchange = (e) => { st.partners = e.target.checked; search(); };
  $("amex").onchange = (e) => { st.amex = e.target.checked; if (st.amex && st.pax < 2) setPax(2); search(); };
  $("sort").onchange = (e) => { st.sort = e.target.value; renderResults(); };
  ["want", "flex", "from"].forEach((id) => $(id).addEventListener("change", search));
  $("search").addEventListener("submit", (e) => { e.preventDefault(); search(true); });

  function updateFlexNote() {
    const want = $("want").value, fx = Number($("flex").value);
    if (!want) { $("flexnote").textContent = ""; return; }
    $("flexnote").innerHTML = fx ? `Søker fra <b>${dLabel(addDays(want, -fx))}</b> til <b>${dLabel(addDays(want, fx))}</b>, altså ${fx} dager før og etter ønsket dato.` : `Søker kun <b>${dLabel(want)}</b>.`;
    $("amexhint").textContent = st.amex ? "Gjelder SAS-fly. Partnerfly vises med full pris." : "Den andre personen reiser gratis på SAS-fly";
  }

  // ---------- Search ----------
  async function search(manual) {
    updateFlexNote();
    const seq = ++searchSeq;
    const btn = $("go");
    btn.disabled = true; btn.innerHTML = '<span class="spin"></span>Søker…';
    try {
      const data = await api("/api/search", { method: "POST", body: JSON.stringify(params()) });
      if (seq !== searchSeq) return;
      lastResults = data.results;
      renderResults(data.expired);
      if (manual) toast(`Fant ${data.results.length} ledige reiser.`);
    } catch (err) {
      if (seq !== searchSeq) return;
      lastResults = [];
      $("count").textContent = "Søket feilet";
      $("list").innerHTML = `<div class="empty">${esc(err.message)}</div>`;
    } finally {
      if (seq === searchSeq) { btn.disabled = false; btn.textContent = "Søk nå"; }
    }
  }

  function renderResults(expired) {
    const list = [...lastResults];
    if (st.sort === "date") list.sort((a, b) => Math.abs(a.daysFromWanted) - Math.abs(b.daysFromWanted) || a.daysFromWanted - b.daysFromWanted);
    else if (st.sort === "seats") list.sort((a, b) => (b.seats || 0) - (a.seats || 0));
    else list.sort((a, b) => a.pointsTotal - b.pointsTotal);
    $("count").textContent = `${list.length} ${list.length === 1 ? "ledig bonusreise" : "ledige bonusreiser"} for ${st.pax} ${st.pax === 1 ? "person" : "personer"}`;
    if (!list.length) {
      $("list").innerHTML = `<div class="empty">${expired ? "Datoen har passert. Velg en ny ønsket avreise." : "Ingen ledige seter med disse filtrene akkurat nå. Prøv færre reisende, flere seteklasser, en større datoperiode, eller ta med partnerflyselskaper. Du kan også lagre søket som varsel, så sier vi fra når noe dukker opp."}</div>`;
      return;
    }
    $("list").innerHTML = list.slice(0, 100).map((f) => {
      const cls = f.cabin === "business" ? "biz" : f.cabin === "premium" ? "prem" : "";
      const off = f.daysFromWanted === 0 ? "Ønsket dato" : `${Math.abs(f.daysFromWanted)} ${Math.abs(f.daysFromWanted) === 1 ? "dag" : "dager"} ${f.daysFromWanted < 0 ? "før" : "etter"}`;
      const stops = f.direct === true ? "Direkte" : f.direct === false ? "Med stopp" : "";
      const seats = f.seatsUnknown ? `<span class="seats unk">Antall seter ukjent</span>` : `<span class="seats ${f.seats <= st.pax + 1 ? "low" : "ok"}">${f.seats} ${f.seats === 1 ? "sete" : "seter"} ledig</span>`;
      const taxes = f.taxesTotal == null ? "skatter ukjent" : `${fmt(f.taxesTotal)} ${esc(f.taxCurrency || "")} i skatter`.replace("  ", " ");
      return `<article class="card">
        <div class="route"><div><div class="iata">${esc(f.origin)}</div><div class="city">${esc(f.originCity)}</div></div>
          <div class="arrow"></div><div><div class="iata">${esc(f.dest)}</div><div class="city">${esc(f.destCity)}</div></div></div>
        <div class="meta"><div>${dFull(f.date)}${stops ? " · " + stops : ""}</div>
          <div class="tags"><span class="tag ${cls}">${CABNAME[f.cabin]}</span><span class="tag ${f.sasOperated ? "" : "partner"}">${esc(f.airlineNames.join(" / "))}</span>
            <span class="tag off">${off}</span>${f.amexApplied ? '<span class="tag amex">Amex 2 for 1</span>' : ""}</div></div>
        <div class="price"><div class="pts">${f.amexApplied ? `<span class="strike">${fmt(f.pointsWithoutAmex)}</span>` : ""}${fmt(f.pointsTotal)} <small>poeng</small></div>
          <div class="sub">${f.amexApplied ? `Én betaler ${fmt(f.pointsPerPerson)} p, én reiser gratis` : `${fmt(f.pointsPerPerson)} p per person`} + ${taxes}</div>
          <div class="seats-row">${seats}<a class="book" href="https://www.flysas.com/no-no/" target="_blank" rel="noopener">Bestill ↗</a></div></div>
      </article>`;
    }).join("");
  }

  // ---------- Alerts ----------
  async function loadWatches() {
    const watches = await api("/api/watches");
    $("watches").innerHTML = watches.map((w) => {
      let state;
      if (w.lastError) state = `<span class="w-state err" title="${esc(w.lastError)}">${esc(w.lastError.length > 70 ? w.lastError.slice(0, 70) + "…" : w.lastError)}</span>`;
      else if (!w.lastRun) state = `<span class="w-state wait">Venter på første søk</span>`;
      else if (w.lastHitCount) state = `<span class="w-state hit">${w.lastHitCount} ledige ${timeLabel(w.lastRun)}</span>`;
      else state = `<span class="w-state wait">Ingen ledige ennå · sjekket ${timeLabel(w.lastRun)}</span>`;
      return `<div class="watch"><div class="w-main"><span class="w-title">${esc(w.name)}</span><span class="w-sub">${esc(w.summary)}</span></div>
        <div class="w-side">${state}<button type="button" class="linkbtn" data-load="${w.id}">Vis</button><button type="button" class="linkbtn" data-del="${w.id}">Slett</button></div></div>`;
    }).join("") || `<div class="watch"><span class="w-sub">Ingen varsler ennå. Sett opp et søk over og trykk «Varsle meg om dette søket».</span></div>`;
    $("watches").dataset.json = JSON.stringify(watches);
  }
  $("watches").addEventListener("click", async (e) => {
    const del = e.target.closest("[data-del]"), load = e.target.closest("[data-load]");
    if (del) {
      if (del.dataset.confirm !== "1") { del.dataset.confirm = "1"; del.textContent = "Trykk igjen for å slette"; return; }
      try { await api(`/api/watches/${del.dataset.del}`, { method: "DELETE" }); toast("Varselet er slettet."); loadWatches(); } catch (err) { toast(err.message); }
    }
    if (load) {
      const w = JSON.parse($("watches").dataset.json || "[]").find((x) => x.id === load.dataset.load);
      if (w) applyParams(w.params);
    }
  });
  function applyParams(p) {
    $("from").value = p.from; $("want").value = p.want; $("flex").value = String(p.flex);
    setPax(p.pax); st.partners = p.partners; $("partners").checked = p.partners; st.amex = p.amex; $("amex").checked = p.amex;
    st.cabins = new Set(p.cabins);
    $("cabins").querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", st.cabins.has(c.dataset.v)));
    $("regions").querySelector(`[data-v="${p.region}"]`)?.click();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  $("save").onclick = async () => {
    try {
      const w = await api("/api/watches", { method: "POST", body: JSON.stringify({ params: params() }) });
      await loadWatches();
      const s = await api("/api/settings");
      const any = ["email", "sms", "telegram"].some((c) => s.channels[c] && status?.channels[c]);
      toast(any ? `Varselet «${w.name}» er lagret. Du får beskjed når en reise blir ledig.` : `Varselet er lagret, men ingen varslingskanal er klar. Fyll inn e-post eller mobil under.`);
    } catch (err) { toast(err.message); }
  };
  $("runall").onclick = async () => {
    const b = $("runall"); b.disabled = true; b.textContent = "Kjører…";
    try {
      const { summary } = await api("/api/run", { method: "POST" });
      const fresh = summary.reduce((s, i) => s + i.new, 0);
      toast(summary.length ? `Ferdig. ${fresh} nye ledige reiser.` : "Du har ingen varsler å kjøre.");
      await Promise.all([loadWatches(), loadStatus()]);
    } catch (err) { toast(err.message); }
    b.disabled = false; b.textContent = "Kjør alle varsler nå";
  };

  // ---------- Settings ----------
  async function loadSettings() {
    const s = await api("/api/settings");
    $("email").value = s.email; $("phone").value = s.phone; $("tg").value = s.telegramChatId;
    $("ch-email").checked = s.channels.email; $("ch-sms").checked = s.channels.sms; $("ch-telegram").checked = s.channels.telegram;
  }
  function channelNotes() {
    const notes = {
      email: ["Sendes fra serverens e-postkonto.", "E-post er ikke satt opp på serveren ennå (SMTP_* i .env)."],
      sms: ["Sendes via Twilio. Skriv nummeret med +47.", "SMS er ikke satt opp på serveren ennå (TWILIO_* i .env)."],
      telegram: ["Send /start til boten din, og lim inn chat-ID-en her.", "Telegram er ikke satt opp på serveren ennå (TELEGRAM_BOT_TOKEN i .env)."],
    };
    for (const c of Object.keys(notes)) {
      const ok = status?.channels[c];
      const el = $(`note-${c}`); el.textContent = notes[c][ok ? 0 : 1]; el.classList.toggle("warn", !ok);
    }
  }
  $("settings").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await api("/api/settings", { method: "PUT", body: JSON.stringify({
        email: $("email").value, phone: $("phone").value, telegramChatId: $("tg").value,
        channels: { email: $("ch-email").checked, sms: $("ch-sms").checked, telegram: $("ch-telegram").checked },
      }) });
      toast("Lagret.");
    } catch (err) { toast(err.message); }
  });
  $("testnotify").onclick = async () => {
    try {
      $("settings").requestSubmit();
      await new Promise((r) => setTimeout(r, 300));
      const { results } = await api("/api/notify/test", { method: "POST" });
      toast(results.map((r) => `${r.channel}: ${r.ok ? "sendt" : r.error}`).join(" · "));
    } catch (err) { toast(err.message); }
  };

  // ---------- Status ----------
  async function loadStatus() {
    status = await api("/api/status");
    const mode = $("mode"); mode.hidden = false;
    mode.textContent = status.mode === "live" ? "Live · seats.aero" : "Demo · eksempeldata";
    $("last").textContent = timeLabel(status.lastRun);
    $("dot").classList.toggle("bad", Boolean(status.lastError));
    $("autostate").textContent = status.lastError ? "Siste automatiske søk feilet" : "Automatisk søk er på";
    const banner = $("banner");
    if (status.lastError) { banner.hidden = false; banner.className = "banner bad"; banner.textContent = status.lastError; }
    else if (status.mode === "demo") { banner.hidden = false; banner.className = "banner"; banner.textContent = "Siden viser eksempeldata fordi serveren ikke har en seats.aero API-nøkkel ennå. Alt annet virker, inkludert varsler."; }
    else banner.hidden = true;
    channelNotes();
    tick();
  }
  function tick() {
    if (!status?.nextRun) return;
    const cycle = status.intervalHours * 3600000;
    const left = Math.max(0, Date.parse(status.nextRun) - Date.now());
    const h = Math.floor(left / 3600000), m = Math.floor((left % 3600000) / 60000);
    $("next").textContent = left < 60000 ? "under ett minutt" : `${h} t ${String(m).padStart(2, "0")} min`;
    $("bar").style.width = Math.min(100, 100 - (left / cycle) * 100).toFixed(1) + "%";
    if (left === 0) setTimeout(() => { loadStatus(); loadWatches(); }, 20000);
  }
  setInterval(tick, 30000);
  setInterval(() => { loadStatus().catch(() => {}); loadWatches().catch(() => {}); }, 10 * 60000);

  // ---------- Start ----------
  (async function init() {
    try {
      await loadStatus();
      $("from").innerHTML = Object.entries(status.origins).map(([code, city]) => `<option value="${code}">${esc(city)} (${code})</option>`).join("");
      $("want").min = status.today;
      $("want").value = addDays(status.today, 60);
      await Promise.all([loadSettings(), loadWatches()]);
      search();
    } catch (err) {
      $("list").innerHTML = `<div class="empty">Får ikke kontakt med serveren: ${esc(err.message)}</div>`;
    }
  })();
})();
