// Removes personal details from a recorded SAS answer before it is stored or shared.
// Keeps the structure (field names, airport codes, dates, points) that is needed to read award seats.

const SECRET_PARAM = /(token|auth|session|sid|key|sig|code|jwt|nonce)/i;
const PERSONAL_KEY = /^((first|last|given|family|full|middle|sur)_?name|name|e-?mail|phone|mobile|tel|address|street|zip|postal|birth|dob|gender|title|eurobonus.*(id|number|no)|member.*(id|number|no)|membership.*|customer.*(id|number)|loyalty.*(id|number)|frequentflyer.*|passport.*|password|token|access_?token|refresh_?token|id_?token|card.*|iban|ssn)$/i;
const KEEP_HEADERS = /^(content-type|accept|next-action|next-router-state-tree|rsc|next-url|x-requested-with)$/i;

// Patterns hidden in any text: e-mail, phone numbers, EuroBonus numbers, long digit runs and JWTs.
const TEXT_PATTERNS = [
  /[^\s@"'<>]+@[^\s@"'<>]+\.[a-z]{2,}/gi,
  /\bEB\d{6,}\b/gi,
  /\+?\d[\d ]{7,}\d/g,
  /\beyJ[\w-]+\.[\w-]+\.[\w-]+/g,
];

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
  if (typeof value === "string") return redactPlain(value);
  return value;
}

export function redactPlain(text) {
  let t = text;
  for (const re of TEXT_PATTERNS) t = t.replace(re, "[skjult]");
  return t;
}

/**
 * Redact recorded text. JSON is redacted field by field. Next.js "x-component" text is a list of
 * lines like `1:{...}`; each JSON part is redacted the same way. Anything else gets pattern redaction.
 */
export function redactText(text) {
  if (text == null) return null;
  try { return JSON.stringify(redactJson(JSON.parse(text))); } catch { /* not plain JSON */ }
  return text.split("\n").map((line) => {
    const m = line.match(/^([0-9a-z]+:[A-Z]?)(.*)$/i);
    if (m) { try { return m[1] + JSON.stringify(redactJson(JSON.parse(m[2]))); } catch { /* not JSON */ } }
    try { return JSON.stringify(redactJson(JSON.parse(line))); } catch { return redactPlain(line); }
  }).join("\n");
}

export function redactEntry(e) {
  const headers = {};
  for (const [k, v] of Object.entries(e.headers || {})) if (KEEP_HEADERS.test(k)) headers[k] = v;
  return {
    at: e.at, kind: e.kind || "response", method: e.method, status: e.status, contentType: e.contentType || null,
    url: redactUrl(e.url), headers, body: redactText(e.body), response: redactText(e.response),
  };
}
