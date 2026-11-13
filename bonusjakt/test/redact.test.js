import { test } from "node:test";
import assert from "node:assert/strict";
import { redactEntry, redactJson, redactUrl } from "../extension/redact.js";

test("removes personal details but keeps flight data", () => {
  const out = redactJson({
    customer: { firstName: "Kari", lastName: "Nordmann", email: "kari@example.no", euroBonusNumber: "EB123456789", phone: "+4791234567" },
    offers: [{ origin: "OSL", destination: "NRT", departureDate: "2027-03-15", cabin: "BUSINESS", points: 75000, seatsLeft: 2, airline: "SK" }],
    contact: "kari@example.no",
  });
  assert.equal(out.customer.firstName, "[skjult]");
  assert.equal(out.customer.lastName, "[skjult]");
  assert.equal(out.customer.email, "[skjult]");
  assert.equal(out.customer.euroBonusNumber, "[skjult]");
  assert.equal(out.customer.phone, "[skjult]");
  assert.equal(out.contact, "[skjult]");
  assert.deepEqual(out.offers[0], { origin: "OSL", destination: "NRT", departureDate: "2027-03-15", cabin: "BUSINESS", points: 75000, seatsLeft: 2, airline: "SK" });
});

test("hides tokens in URLs and drops non-JSON bodies", () => {
  assert.equal(redactUrl("https://www.flysas.com/api/x?from=OSL&token=abc&sessionId=9"), "https://www.flysas.com/api/x?from=OSL&token=%5Bskjult%5D&sessionId=%5Bskjult%5D");
  const e = redactEntry({ url: "https://www.flysas.com/a?jwt=1", method: "POST", status: 200, body: "user=kari&pw=x", response: '{"access_token":"t","fare":{"points":1}}', at: "x" });
  assert.equal(e.body, "[ikke JSON – utelatt]");
  assert.deepEqual(JSON.parse(e.response), { access_token: "[skjult]", fare: { points: 1 } });
});
