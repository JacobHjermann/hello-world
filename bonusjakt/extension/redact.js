// Removes personal details from a recorded SAS answer before it is stored or shared.
// Keeps the structure (field names, airport codes, dates, points) that is needed to read award seats.

const SECRET_PARAM = /(token|auth|session|sid|key|sig|code|jwt|nonce)/i;
const PERSONAL_KEY = /^((first|last|given|family|full|middle|sur)_?name|name|e-?mail|phone|mobile|tel|address|street|zip|postal|birth|dob|gender|title|eurobonus.*(id|number|no)|member.*(id|number|no)|membership.*|customer.*(id|number)|loyalty.*(id|number)|frequentflyer.*|passport.*|password|token|access_?token|refresh_?token|id_?token|card.*|iban|ssn)$/i;

export function redactUrl(url) {
  try {
    const u = new URL(url);
    for (const k of [...u.searchParams.keys()]) if (SECRET_PARAM.test(k)) u.searchParams.set(k, "[skjult]");
    return u.href;
  } catch { return url; }
}

export function redactJson(value) {
  if (Array.isArray(value)) return value.map(redactJson);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = PERSONAL_KEY.test(k) && (typeof v === "string" || typeof v === "number") ? "[skjult]" : redactJson(v);
    }
    return out;
  }
  if (typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "[skjult]";
  return value;
}

/** Redact a text that may hold JSON. Non-JSON text is dropped, since it can't be checked. */
export function redactText(text) {
  if (text == null) return null;
  try { return JSON.stringify(redactJson(JSON.parse(text))); } catch { return "[ikke JSON – utelatt]"; }
}

export function redactEntry(e) {
  return { at: e.at, method: e.method, status: e.status, url: redactUrl(e.url), body: redactText(e.body), response: redactText(e.response) };
}
