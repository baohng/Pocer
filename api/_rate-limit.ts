// Best-effort per-IP throttle for the public insight endpoint.
//
// Deliberately in-memory: an edge isolate is per-region and gets recycled, so
// a determined caller can wash through it by spreading requests around. That's
// accepted. The job here is to stop a bot from looping on the endpoint and
// running up the DeepSeek bill, which this does at zero latency and with no
// extra infrastructure. The real backstop is a spending cap on the provider
// account -- this is the speed bump in front of it.

const WINDOW_MS = 5 * 60_000;
const MAX_REQUESTS = 12; // per IP per window; a human tapping the button uses a handful
const MAX_TRACKED_IPS = 5000; // bounds memory if someone rotates addresses

const hits = new Map<string, number[]>();

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

/** Client address as seen through Vercel's proxy. Everything unattributable
 *  shares one bucket, which is the conservative direction: worst case a few
 *  real users behind an unknown proxy share a quota. */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "unknown";
}

export function rateLimit(ip: string, now = Date.now()): RateLimitResult {
  if (hits.size > MAX_TRACKED_IPS) hits.clear();

  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);

  if (recent.length >= MAX_REQUESTS) {
    hits.set(ip, recent);
    const oldest = recent[0];
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((WINDOW_MS - (now - oldest)) / 1000)),
    };
  }

  recent.push(now);
  hits.set(ip, recent);
  return { allowed: true, retryAfterSeconds: 0 };
}
