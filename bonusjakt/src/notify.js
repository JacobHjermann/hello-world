import nodemailer from "nodemailer";
import { channelsConfigured } from "./config.js";
export { buildAlertMessage, tripLine } from "./messages.js";

export function createNotifier(cfg, fetchImpl = globalThis.fetch) {
  let mailer;
  const getMailer = () =>
    (mailer ??= nodemailer.createTransport({
      host: cfg.email.host, port: cfg.email.port, secure: cfg.email.secure,
      auth: cfg.email.user ? { user: cfg.email.user, pass: cfg.email.pass } : undefined,
    }));

  const senders = {
    async email(settings, msg) {
      if (!settings.email) throw new Error("Ingen e-postadresse er lagt inn.");
      await getMailer().sendMail({ from: cfg.email.from, to: settings.email, subject: msg.subject, text: msg.text });
    },
    async sms(settings, msg) {
      if (!settings.phone) throw new Error("Inget mobilnummer er lagt inn.");
      const { sid, token, from } = cfg.twilio;
      const res = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: "POST",
        headers: { authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"), "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ From: from, To: settings.phone, Body: msg.short.slice(0, 600) }),
      });
      if (!res.ok) throw new Error(`Twilio svarte ${res.status}: ${(await res.text()).slice(0, 200)}`);
    },
    async telegram(settings, msg) {
      if (!settings.telegramChatId) throw new Error("Ingen Telegram chat-ID er lagt inn.");
      const res = await fetchImpl(`https://api.telegram.org/bot${cfg.telegram.token}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: settings.telegramChatId, text: `${msg.subject}\n\n${msg.text}` }),
      });
      if (!res.ok) throw new Error(`Telegram svarte ${res.status}: ${(await res.text()).slice(0, 200)}`);
    },
  };

  return {
    /** Send on every channel that is both switched on in settings and configured on the server. */
    async send(settings, msg) {
      const ready = channelsConfigured();
      const results = [];
      for (const ch of Object.keys(senders)) {
        if (!settings.channels?.[ch] || !ready[ch]) continue;
        try {
          await senders[ch](settings, msg);
          results.push({ channel: ch, ok: true });
        } catch (err) {
          results.push({ channel: ch, ok: false, error: err.message });
        }
      }
      return results;
    },
  };
}
