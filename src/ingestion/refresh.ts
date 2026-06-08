// Always-on pipeline: the pure staleness logic that decides which catalog entries the nightly cron
// should re-fetch/re-score. Kept pure + testable; the cron wiring (scheduled handler + queue) is the
// deploy-time integration around it.

export const DEFAULT_REFRESH_TTL_DAYS = 30;

export interface RefreshCandidate {
  productId: string;
  gtin: string;
  // When Optiyou last observed/refreshed this record (ISO). Older than the TTL → stale.
  lastSeenAt: string;
}

// Returns the candidates whose lastSeenAt is older than `ttlDays` before `now`, oldest first.
// Records with an unparseable date are treated as stale (they should be re-observed).
export function planRefresh(
  candidates: RefreshCandidate[],
  now: Date,
  ttlDays: number = DEFAULT_REFRESH_TTL_DAYS
): RefreshCandidate[] {
  const cutoff = now.getTime() - ttlDays * 24 * 60 * 60 * 1000;
  return candidates
    .filter((candidate) => {
      const observed = Date.parse(candidate.lastSeenAt);
      return !Number.isFinite(observed) || observed < cutoff;
    })
    .sort((a, b) => sortKey(a.lastSeenAt) - sortKey(b.lastSeenAt));
}

function sortKey(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
