/*
 * Tiny in-memory TTL cache for expensive, read-only admin aggregations
 * (dashboard counters, rankings). One instance only: fine for a single
 * server, and a stale number for a few seconds is harmless for a dashboard.
 */
export function createTtlCache({ ttlMs = 30_000, max = 200 } = {}) {
  const store = new Map();
  return {
    get(key) {
      const hit = store.get(key);
      if (!hit) return undefined;
      if (hit.expires < Date.now()) {
        store.delete(key);
        return undefined;
      }
      return hit.value;
    },
    set(key, value) {
      if (store.size >= max) store.delete(store.keys().next().value);
      store.set(key, { value, expires: Date.now() + ttlMs });
      return value;
    },
    /** Returns the cached value or computes (and caches) it. Concurrent callers share one computation. */
    async wrap(key, compute) {
      const hit = this.get(key);
      if (hit !== undefined) return hit;
      const pending = store.get(`pending:${key}`);
      if (pending) return pending.value;
      const promise = Promise.resolve().then(compute);
      store.set(`pending:${key}`, { value: promise, expires: Date.now() + ttlMs });
      try {
        const value = await promise;
        this.set(key, value);
        return value;
      } finally {
        store.delete(`pending:${key}`);
      }
    },
    clear: () => store.clear(),
  };
}
