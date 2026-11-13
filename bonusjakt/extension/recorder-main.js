// Runs inside flysas.com and passes on the JSON answers the site itself fetches while you search.
// Nothing is sent anywhere: the extension only stores them locally, and only while recording is on.
(() => {
  const TAG = "__bonusjakt_rec";
  const RX = /(offer|flight|award|avail|search|calendar|point|bonus|reward|fare|bound)/i;
  const post = (d) => window.postMessage({ [TAG]: true, ...d }, location.origin);
  const bodyText = (b) => (typeof b === "string" ? b.slice(0, 5000) : null);

  const origFetch = window.fetch;
  window.fetch = async function (input, init) {
    const res = await origFetch.apply(this, arguments);
    try {
      const url = typeof input === "string" ? input : input.url;
      const ct = res.headers.get("content-type") || "";
      if (RX.test(url) && ct.includes("json")) {
        res.clone().text().then((t) => post({
          url: new URL(url, location.href).href,
          method: (init && init.method) || (input && input.method) || "GET",
          body: bodyText(init && init.body),
          status: res.status,
          response: t.slice(0, 300000),
        })).catch(() => {});
      }
    } catch (e) { /* never disturb the site */ }
    return res;
  };

  const open = XMLHttpRequest.prototype.open;
  const send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) { this.__bj = { method, url }; return open.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function (body) {
    const info = this.__bj;
    if (info && RX.test(info.url)) {
      this.addEventListener("load", () => {
        try {
          if (!(this.getResponseHeader("content-type") || "").includes("json")) return;
          post({ url: new URL(info.url, location.href).href, method: info.method, body: bodyText(body), status: this.status, response: String(this.responseText).slice(0, 300000) });
        } catch (e) { /* ignore */ }
      });
    }
    return send.apply(this, arguments);
  };
})();
