import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Lazily-initialized singletons — created on first request, reused across
// subsequent invocations in the same Vercel function instance (warm starts).
let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
  }
  return redis;
}

let webhookLimiter: Ratelimit | null = null;
let uploadLimiter: Ratelimit | null = null;
let mediaLimiter: Ratelimit | null = null;
let registerLimiter: Ratelimit | null = null;

export function getWebhookLimiter(): Ratelimit {
  return (webhookLimiter ??= new Ratelimit({
    redis: getRedis(),
    limiter: Ratelimit.slidingWindow(100, "60 s"),
    prefix: "rl:webhooks",
  }));
}

export function getUploadLimiter(): Ratelimit {
  return (uploadLimiter ??= new Ratelimit({
    redis: getRedis(),
    limiter: Ratelimit.slidingWindow(10, "60 s"),
    prefix: "rl:upload",
  }));
}

export function getMediaLimiter(): Ratelimit {
  return (mediaLimiter ??= new Ratelimit({
    redis: getRedis(),
    limiter: Ratelimit.slidingWindow(60, "60 s"),
    prefix: "rl:media",
  }));
}

export function getRegisterLimiter(): Ratelimit {
  return (registerLimiter ??= new Ratelimit({
    redis: getRedis(),
    limiter: Ratelimit.slidingWindow(30, "60 s"),
    prefix: "rl:register",
  }));
}
