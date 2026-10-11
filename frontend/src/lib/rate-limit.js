/**
 * In-memory sliding-window rate limiter for API endpoints.
 * Minimal zero-dependency implementation.
 */

const ipRequests = new Map()

// Clean up expired entries every 5 minutes to prevent memory leaks
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000
let lastCleanup = Date.now()

function cleanupExpired(windowMs) {
  const now = Date.now()
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return
  lastCleanup = now

  for (const [ip, timestamps] of ipRequests.entries()) {
    const valid = timestamps.filter((t) => now - t < windowMs)
    if (valid.length === 0) {
      ipRequests.delete(ip)
    } else {
      ipRequests.set(ip, valid)
    }
  }
}

/**
 * Check if a request from an IP should be rate limited.
 * @param {string} ip - Client IP identifier
 * @param {number} maxRequests - Maximum allowed requests in the time window
 * @param {number} windowMs - Window duration in milliseconds (default: 60,000ms = 1 minute)
 * @returns {{ allowed: boolean, remaining: number, resetMs: number }}
 */
export function checkRateLimit(ip = '127.0.0.1', maxRequests = 15, windowMs = 60_000) {
  const now = Date.now()
  cleanupExpired(windowMs)

  const timestamps = ipRequests.get(ip) || []
  const validTimestamps = timestamps.filter((t) => now - t < windowMs)

  if (validTimestamps.length >= maxRequests) {
    const oldestTimestamp = validTimestamps[0]
    const resetMs = windowMs - (now - oldestTimestamp)
    return {
      allowed: false,
      remaining: 0,
      resetMs: Math.max(0, resetMs),
    }
  }

  validTimestamps.push(now)
  ipRequests.set(ip, validTimestamps)

  return {
    allowed: true,
    remaining: maxRequests - validTimestamps.length,
    resetMs: windowMs,
  }
}
