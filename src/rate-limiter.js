export function createFixedWindowRateLimiter({ windowMs, maxAttempts, now = Date.now }) {
  const buckets = new Map();

  function prune() {
    const current = now();
    for (const [key, bucket] of buckets.entries()) {
      if (bucket.resetAt <= current) {
        buckets.delete(key);
      }
    }
  }

  return {
    hit(key) {
      prune();

      const current = now();
      const existing = buckets.get(key);
      const bucket = !existing || existing.resetAt <= current
        ? { count: 0, resetAt: current + windowMs }
        : existing;

      bucket.count += 1;
      buckets.set(key, bucket);

      return {
        allowed: bucket.count <= maxAttempts,
        retryAfterMs: Math.max(bucket.resetAt - current, 0),
        remaining: Math.max(maxAttempts - bucket.count, 0)
      };
    }
  };
}
