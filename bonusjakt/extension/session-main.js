// Runs inside sas.no. When the sas.no page itself calls its award booking service (/award-api),
// it sends along the user's login and a few settings as request headers. This script notes those
// headers in the page's own memory, so Bonusjakt can make the same kind of request from the same tab.
// Nothing is stored or sent anywhere else: the values live only as long as the tab, and only go to sas.no.
(() => {
  const MATCH = "/award-api/";
  const KEEP = /^(authorization|channel|pos|locale|language|accept-language|sas-user-session-id)$/i;
  const note = (headers) => {
    const out = {};
    for (const [k, v] of headers) if (KEEP.test(k)) out[k.toLowerCase()] = String(v);
    if (out.authorization) Object.defineProperty(window, "__bonusjaktAwardHeaders", { value: out, configurable: true, enumerable: false });
  };
  const entries = (h) => {
    try { return [...new Headers(h || {}).entries()]; } catch (e) { return []; }
  };

  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    try {
      const url = typeof input === "string" ? input : input && input.url;
      if (url && String(url).includes(MATCH)) note([...entries(input && input.headers), ...entries(init && init.headers)]);
    } catch (e) { /* never disturb the site */ }
    return origFetch.apply(this, arguments);
  };

  const open = XMLHttpRequest.prototype.open;
  const setHeader = XMLHttpRequest.prototype.setRequestHeader;
  const send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) { this.__bjAward = String(url).includes(MATCH) ? [] : null; return open.apply(this, arguments); };
  XMLHttpRequest.prototype.setRequestHeader = function (k, v) { if (this.__bjAward) this.__bjAward.push([k, v]); return setHeader.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function () { try { if (this.__bjAward) note(this.__bjAward); } catch (e) { /* ignore */ } return send.apply(this, arguments); };
})();
