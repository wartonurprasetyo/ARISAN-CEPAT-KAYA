import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().min(1).max(254),
  password: z.string().min(1).max(1024),
});

// Browsers always send Origin on cross-origin POSTs; non-browser clients may omit it.
export function isAllowedOrigin(origin: string | null, host: string | null) {
  if (origin === null) return true;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

// Where to go after signing in. Anything that resolves to another site falls back.
export function safeNextPath(value: string | undefined, fallback = "/admin/schools") {
  if (!value?.startsWith("/")) return fallback;
  const base = "http://internal.invalid";
  // The URL parser treats "\" and embedded tabs the same way browsers do.
  const url = new URL(value, base);
  if (url.origin !== base || url.pathname.startsWith("//")) return fallback;
  return url.pathname + url.search + url.hash;
}

// The last X-Forwarded-For entry is the one added by the nearest proxy; earlier
// entries are supplied by the client.
export function clientIp(forwardedFor: string | null) {
  return forwardedFor?.split(",").pop()?.trim() || "unknown";
}

// shortcut: counters live in this process, so each instance limits on its own and
// a restart clears them; move to a database table when running more than one.
export function createRateLimiter(limit: number, windowMs: number, maxKeys = 10_000) {
  const entries = new Map<string, { count: number; resetAt: number }>();

  return {
    /** Counts one attempt. Returns 0 when allowed, otherwise seconds to wait. */
    take(key: string, now = Date.now()) {
      let entry = entries.get(key);
      if (!entry || entry.resetAt <= now) {
        if (entries.size >= maxKeys) {
          entries.forEach((value, k) => {
            if (value.resetAt <= now) entries.delete(k);
          });
          if (entries.size >= maxKeys) entries.delete(entries.keys().next().value!);
        }
        entry = { count: 0, resetAt: now + windowMs };
        entries.set(key, entry);
      }
      entry.count += 1;
      return entry.count <= limit ? 0 : Math.ceil((entry.resetAt - now) / 1000);
    },
    reset(key: string) {
      entries.delete(key);
    },
  };
}
