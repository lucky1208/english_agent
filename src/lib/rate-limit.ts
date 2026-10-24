import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const developmentBuckets = new Map<string, number[]>();
const limiters = new Map<number, Ratelimit>();

function getLimiter(limit: number) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const existing = limiters.get(limit);
  if (existing) return existing;
  const limiter = new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(limit, "1 m"),
    analytics: true,
    prefix: `english-mate:ratelimit:${limit}`,
  });
  limiters.set(limit, limiter);
  return limiter;
}

export async function enforceRateLimit(userId: string, route: string, limit = 30) {
  let configured: Ratelimit | null = null;
  try {
    configured = getLimiter(limit);
  } catch (error) {
    console.error("rate limiter configuration failed", error instanceof Error ? error.message : "unknown");
    return { allowed: false, remaining: 0, configurationError: true };
  }

  if (configured) {
    try {
      const result = await configured.limit(`${route}:${userId}`);
      return { allowed: result.success, remaining: result.remaining };
    } catch (error) {
      console.error("rate limiter request failed", error instanceof Error ? error.message : "unknown");
      return { allowed: false, remaining: 0, configurationError: true };
    }
  }

  if (process.env.NODE_ENV === "production" && !process.env.FIXED_ACCOUNT_EMAIL) {
    return { allowed: false, remaining: 0, configurationError: true };
  }

  const key = `${limit}:${route}:${userId}`;
  const now = Date.now();
  const fresh = (developmentBuckets.get(key) ?? []).filter((time) => now - time < 60_000);
  if (fresh.length >= limit) return { allowed: false, remaining: 0 };
  fresh.push(now);
  developmentBuckets.set(key, fresh);
  return { allowed: true, remaining: limit - fresh.length };
}