/**
 * Simple in-memory rate limiter for API routes.
 * Uses a sliding window approach to track request counts per IP.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Clean up expired entries periodically (every 60 seconds)
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.resetAt) {
      store.delete(key);
    }
  }
}, 60_000);

interface RateLimitOptions {
  /** Maximum number of requests allowed within the window */
  limit: number;
  /** Time window in seconds */
  windowInSeconds: number;
}

interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetAt: number;
}

export function rateLimit(identifier: string, options: RateLimitOptions): RateLimitResult {
  const { limit, windowInSeconds } = options;
  const now = Date.now();
  const entry = store.get(identifier);

  if (!entry || now > entry.resetAt) {
    store.set(identifier, {
      count: 1,
      resetAt: now + windowInSeconds * 1000,
    });
    return { success: true, remaining: limit - 1, resetAt: now + windowInSeconds * 1000 };
  }

  if (entry.count >= limit) {
    return { success: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count++;
  return { success: true, remaining: limit - entry.count, resetAt: entry.resetAt };
}
