import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_REFRESH_TTL_DAYS, planRefresh, type RefreshCandidate } from "../src/ingestion/refresh.ts";

const NOW = new Date("2026-06-07T00:00:00.000Z");

function candidate(id: string, lastSeenAt: string): RefreshCandidate {
  return { productId: id, gtin: id, lastSeenAt };
}

test("planRefresh selects only entries older than the TTL", () => {
  const stale = candidate("stale", "2026-01-01T00:00:00.000Z"); // ~5 months old
  const fresh = candidate("fresh", "2026-06-01T00:00:00.000Z"); // 6 days old
  const result = planRefresh([fresh, stale], NOW, DEFAULT_REFRESH_TTL_DAYS);
  assert.deepEqual(result.map((c) => c.productId), ["stale"]);
});

test("planRefresh treats unparseable dates as stale", () => {
  const result = planRefresh([candidate("bad", "not-a-date")], NOW);
  assert.equal(result.length, 1);
});

test("planRefresh returns oldest first", () => {
  const older = candidate("older", "2026-01-01T00:00:00.000Z");
  const old = candidate("old", "2026-03-01T00:00:00.000Z");
  const result = planRefresh([old, older], NOW, 30);
  assert.deepEqual(result.map((c) => c.productId), ["older", "old"]);
});

test("a fresh-only catalog yields no refresh work", () => {
  assert.deepEqual(planRefresh([candidate("a", "2026-06-05T00:00:00.000Z")], NOW), []);
});
