import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The provider keeps caches in chrome.storage; a small in-memory stand-in is enough here.
const mem = {};
globalThis.chrome = { storage: { local: {
  get: async (k) => (typeof k === "string" ? { [k]: mem[k] } : Object.fromEntries([].concat(k).map((x) => [x, mem[x]]))),
  set: async (o) => Object.assign(mem, o),
} } };
const { createSasProvider, SearchCancelled } = await import("../extension/sas.js");

const fx = (f) => JSON.parse(readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8"));
const destinations = fx("sas-award-destinations.json");
const partner = fx("sas-partner-flights-OSL-LON.json");

function fakes() {
  const calls = [];
  return {
    calls,
    fetchJson: async (url) => {
      calls.push(url);
      const u = new URL(url);
      if (u.searchParams.get("availability") === "true") return u.searchParams.get("destinations").split(",").map((c) => ({ ...destinations.find((d) => d.airportCode === c), availability: { outbound: [], inbound: [] } }));
      return destinations;
    },
    fetchAward: async (url) => { calls.push(url); return partner; },
  };
}

test("progress counts every request of a round trip to one destination", async () => {
  for (const k of Object.keys(mem)) delete mem[k];
  const f = fakes();
  const seen = [];
  const provider = createSasProvider({ ...f, priceLookups: 0, pauseMs: 0, onProgress: (p) => seen.push(p) });
  await provider.fetchTrips({ origin: "OSL", dest: "LON", region: "all", cabins: ["business", "economy"], partners: true, pax: 2, dirs: ["out", "home"], start: "2026-12-09", end: "2026-12-11", backStart: "2026-12-16", backEnd: "2026-12-18" });
  const last = seen.at(-1);
  // 1 destination list + 1 Award Finder request for London + 3 paired partner days.
  assert.equal(f.calls.length, 5);
  assert.equal(last.done, 5);
  assert.equal(last.total, 5);
  assert.ok(seen.some((p) => /Partnerfly: dag 2 av 3/.test(p.phase)));
  assert.ok(seen.every((p) => p.done <= p.total));
});

test("cancelling stops the search after the request in flight", async () => {
  const f = fakes();
  const controller = new AbortController();
  let partnerCalls = 0;
  const provider = createSasProvider({
    ...f, priceLookups: 0, pauseMs: 0, signal: controller.signal,
    fetchAward: async (url) => { partnerCalls++; if (partnerCalls === 2) controller.abort(); return partner; },
  });
  await assert.rejects(
    provider.fetchTrips({ origin: "OSL", dest: "LON", region: "all", cabins: ["business"], partners: true, pax: 1, dirs: ["out"], start: "2026-12-01", end: "2026-12-14" }),
    SearchCancelled,
  );
  assert.equal(partnerCalls, 2, "no requests after cancelling");
});
