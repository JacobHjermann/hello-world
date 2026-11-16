// Runs inside sas.no (and other SAS sites) and passes on what the site itself loads while you search: data answers
// (JSON and Next.js "x-component" text), page changes, and the data Next.js embeds in result pages.
// Nothing is sent anywhere: the extension only stores it locally, and only while recording is on.
(() => {
  const TAG = "__bonusjakt_rec";
  // Skip tracking, analytics and static files; keep everything else that is text.
  // Never record pages about the member: profile, login, payment, saved travellers, own trips.
  const SKIP = /(customer|profile|auth\/|login|session|checkout|payment|passengers\/saved|my-trips|travelers|campaigns|cdn-cgi|challenge|analytics|collect|beacon|telemetry|tracking|optimizely|adobe|google|doubleclick|newrelic|datadog|sentry|hotjar|cookie|consent|\.(js|css|png|jpe?g|svg|webp|gif|woff2?|ico)(\?|$))/i;
  const TEXT = /(json|x-component|text\/plain|text\/x-|ndjson|event-stream)/i;
  const KEEP_HEADERS = /^(content-type|accept|next-action|next-router-state-tree|rsc|next-url|x-requested-with)$/i;
  const MAX = 400000;
  const post = (d) => window.postMessage({ [TAG]: true, kind: "response", ...d }, location.origin);
  const bodyText = (b) => (typeof b === "string" ? b.slice(0, 20000) : b instanceof URLSearchParams ? b.toString().slice(0, 20000) : null);
  const headerList = (h) => {
    const out = {};
    try { new Headers(h || {}).forEach((v, k) => { if (KEEP_HEADERS.test(k)) out[k] = String(v).slice(0, 300); }); } catch (e) { /* ignore */ }
    return out;
  };

  const origFetch = window.fetch;
  window.fetch = async function (input, init) {
    const res = await origFetch.apply(this, arguments);
    try {
      const url = new URL(typeof input === "string" ? input : input.url, location.href).href;
      const ct = res.headers.get("content-type") || "";
      if (!SKIP.test(url) && TEXT.test(ct)) {
        const method = (init && init.method) || (input && input.method) || "GET";
        const headers = headerList((init && init.headers) || (input && input.headers));
        res.clone().text().then((t) => post({ url, method, headers, contentType: ct, body: bodyText(init && init.body), status: res.status, response: t.slice(0, MAX) })).catch(() => {});
      }
    } catch (e) { /* never disturb the site */ }
    return res;
  };

  const open = XMLHttpRequest.prototype.open;
  const send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) { this.__bj = { method, url }; return open.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function (body) {
    const info = this.__bj;
    if (info && !SKIP.test(info.url)) {
      this.addEventListener("load", () => {
        try {
          const ct = this.getResponseHeader("content-type") || "";
          if (!TEXT.test(ct)) return;
          post({ url: new URL(info.url, location.href).href, method: info.method, headers: {}, contentType: ct, body: bodyText(body), status: this.status, response: String(this.responseText).slice(0, MAX) });
        } catch (e) { /* ignore */ }
      });
    }
    return send.apply(this, arguments);
  };

  // Page changes, so it is clear which page each answer belongs to.
  const nav = () => window.postMessage({ [TAG]: true, kind: "nav", url: location.href }, location.origin);
  for (const fn of ["pushState", "replaceState"]) {
    const orig = history[fn];
    history[fn] = function () { const r = orig.apply(this, arguments); setTimeout(nav, 0); return r; };
  }
  window.addEventListener("popstate", nav);

  // Result pages may carry their data inside the page itself (Next.js). Capture it once loaded.
  const embedded = () => {
    try {
      nav();
      const parts = [];
      const nd = document.getElementById("__NEXT_DATA__");
      if (nd) parts.push(nd.textContent);
      if (Array.isArray(window.__next_f)) {
        for (const item of window.__next_f) if (Array.isArray(item) && typeof item[1] === "string") parts.push(item[1]);
      }
      if (parts.length) {
        post({ kind: "embedded", url: location.href, method: "PAGE", headers: {}, contentType: nd ? "next-data" : "x-component", body: null, status: 200, response: parts.join("\n").slice(0, MAX) });
      }
    } catch (e) { /* ignore */ }
  };
  if (document.readyState === "complete") setTimeout(embedded, 1500);
  else window.addEventListener("load", () => setTimeout(embedded, 1500));
  // Client-side page changes don't fire "load"; look again shortly after each change.
  for (const fn of ["pushState", "replaceState"]) {
    const orig = history[fn];
    history[fn] = function () { const r = orig.apply(this, arguments); setTimeout(embedded, 3000); return r; };
  }
})();
