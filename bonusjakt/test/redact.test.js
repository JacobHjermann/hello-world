import { test } from "node:test";
import assert from "node:assert/strict";
import { redactEntry, redactJson, redactUrl, redactText } from "../extension/redact.js";

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

test("hides tokens in URLs and personal data in non-JSON text", () => {
  assert.equal(redactUrl("https://www.flysas.com/api/x?from=OSL&token=abc&sessionId=9"), "https://www.flysas.com/api/x?from=OSL&token=%5Bskjult%5D&sessionId=%5Bskjult%5D");
  const e = redactEntry({ url: "https://www.flysas.com/a?jwt=1", method: "POST", status: 200, body: "user=kari&pw=x", response: '{"access_token":"t","fare":{"points":1}}', at: "x" });
  assert.equal(e.body, "user=kari&pw=x");
  assert.deepEqual(JSON.parse(e.response), { access_token: "[skjult]", fare: { points: 1 } });
});

test("redacts Next.js x-component text line by line", () => {
  const rsc = '0:["$","div",null,{"children":"Hei"}]\n1:{"firstName":"Kari","email":"kari@example.no","offers":[{"origin":"OSL","destination":"NRT","points":75000}]}\n2:T12,Ring +47 912 34 567 eller skriv til kari@example.no, EB123456789';
  const out = redactText(rsc).split("\n");
  assert.equal(out[0], '0:["$","div",null,{"children":"Hei"}]');
  assert.deepEqual(JSON.parse(out[1].slice(2)), { firstName: "[skjult]", email: "[skjult]", offers: [{ origin: "OSL", destination: "NRT", points: 75000 }] });
  assert.equal(out[2], "2:T12,Ring [skjult] eller skriv til [skjult], [skjult]");
});

test("keeps only harmless request headers", () => {
  const e = redactEntry({ url: "https://www.flysas.com/x", method: "POST", headers: { "next-action": "abc", cookie: "s=1", authorization: "Bearer x", "content-type": "text/plain" }, response: "{}" });
  assert.deepEqual(e.headers, { "next-action": "abc", "content-type": "text/plain" });
});
