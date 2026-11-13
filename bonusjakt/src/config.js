import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Minimal .env loader so the app runs without extra dependencies.
// Real environment variables always win over the file.
function loadDotEnv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith("#")) continue;
    let val = m[2];
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = val;
  }
}
loadDotEnv(path.join(root, ".env"));

const env = process.env;
const num = (v, d) => (v === undefined || v === "" || isNaN(Number(v)) ? d : Number(v));

export const config = {
  root,
  port: num(env.PORT, 3000),
  appPassword: env.APP_PASSWORD || "",
  dataDir: env.DATA_DIR || path.join(root, "data"),
  timezone: env.TZ_NAME || "Europe/Oslo",
  intervalHours: num(env.SEARCH_INTERVAL_HOURS, 3),
  publicUrl: env.PUBLIC_URL || "",

  seatsAero: {
    apiKey: env.SEATSAERO_API_KEY || "",
    baseUrl: env.SEATSAERO_BASE_URL || "https://seats.aero/partnerapi",
    source: env.SEATSAERO_SOURCE || "eurobonus",
    // seats.aero reports taxes in minor units (e.g. cents). Set to 1 if they turn out to be whole units.
    taxDivisor: num(env.SEATSAERO_TAX_DIVISOR, 100),
    maxPages: num(env.SEATSAERO_MAX_PAGES, 10),
  },

  email: {
    host: env.SMTP_HOST || "",
    port: num(env.SMTP_PORT, 587),
    secure: env.SMTP_SECURE === "true",
    user: env.SMTP_USER || "",
    pass: env.SMTP_PASS || "",
    from: env.MAIL_FROM || env.SMTP_USER || "",
  },

  twilio: {
    sid: env.TWILIO_ACCOUNT_SID || "",
    token: env.TWILIO_AUTH_TOKEN || "",
    from: env.TWILIO_FROM || "",
  },

  telegram: {
    token: env.TELEGRAM_BOT_TOKEN || "",
  },
};

export const channelsConfigured = () => ({
  email: Boolean(config.email.host && config.email.from),
  sms: Boolean(config.twilio.sid && config.twilio.token && config.twilio.from),
  telegram: Boolean(config.telegram.token),
});
