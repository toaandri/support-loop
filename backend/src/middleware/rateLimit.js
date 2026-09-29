// Simple in-memory rate limiter — no external dependency.
// Tracks requests per IP using a sliding window.
// Usage: app.use(rateLimit({ windowMs: 60_000, max: 60 }))

export function rateLimit({ windowMs = 60_000, max = 60, keyFn = (req) => req.ip } = {}) {
  const buckets = new Map(); // key -> [timestamp, ...]

  // Prune expired entries every windowMs to avoid memory leaks.
  const prune = () => {
    const cutoff = Date.now() - windowMs;
    for (const [key, timestamps] of buckets) {
      const valid = timestamps.filter((t) => t > cutoff);
      if (valid.length === 0) buckets.delete(key);
      else buckets.set(key, valid);
    }
  };
  const pruneInterval = setInterval(prune, windowMs);
  // Allow the Node process to exit even if this interval is active.
  if (pruneInterval.unref) pruneInterval.unref();

  return function rateLimitMiddleware(req, res, next) {
    const key = keyFn(req) || 'unknown';
    const now = Date.now();
    const cutoff = now - windowMs;
    const existing = (buckets.get(key) || []).filter((t) => t > cutoff);
    if (existing.length >= max) {
      return res.status(429).json({ error: 'Too many requests. Please slow down.' });
    }
    existing.push(now);
    buckets.set(key, existing);
    return next();
  };
}
