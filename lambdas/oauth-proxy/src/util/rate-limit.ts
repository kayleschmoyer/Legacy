import { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda';
import { LOGGER } from '@legacy-sports/logging';

/**
 * Per-Lambda-instance, fixed-window IP rate limiter.
 *
 * This is a defense-in-depth control layered into the application: it does
 * NOT replace edge throttling (API Gateway usage plans / WAF rate-based
 * rules), which see traffic before it reaches a warm instance and across
 * all concurrent containers. A single Lambda execution context handles
 * many sequential requests, so an attacker reusing a warm instance from
 * one IP is throttled here — but auto-scaling means a determined attacker
 * may hit several instances in parallel and divide the per-instance budget.
 * Treat this as the floor of the protection stack, not the ceiling.
 */

interface Bucket {
  windowStart: number;
  count: number;
}

const buckets = new Map<string, Bucket>();

// Maintenance: evict expired buckets occasionally so the map does not grow
// unbounded under sustained traffic. Touched on every check.
let lastSweep = 0;
const SWEEP_INTERVAL_MS = 60 * 1000;

function sweep(now: number, windowMs: number): void {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStart >= windowMs) {
      buckets.delete(key);
    }
  }
}

export interface RateLimitOptions {
  /** Bucket name; combined with the client identifier to form the key. */
  route: string;
  /** Maximum requests allowed per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

/**
 * Extract a best-effort client identifier from an APIGatewayEvent.
 * Prefers X-Forwarded-For (first hop) when present, falls back to
 * the API Gateway source IP. Returns `null` when nothing is available
 * — callers should treat that as "skip rate limiting" so we never
 * deny traffic because of missing identity.
 */
export function getClientIp(event: APIGatewayEvent): string | null {
  const headers = event.headers ?? {};
  const xff = headers['X-Forwarded-For'] ?? headers['x-forwarded-for'];
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  const sourceIp = event.requestContext?.identity?.sourceIp;
  if (sourceIp) return sourceIp;
  return null;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Check (and increment) the rate-limit bucket for a given identifier and
 * route. Returns whether the request should be allowed plus header values
 * the caller can surface to clients.
 */
export function checkRateLimit(
  identifier: string,
  options: RateLimitOptions,
): RateLimitResult {
  const now = Date.now();
  sweep(now, options.windowMs);

  const key = `${options.route}|${identifier}`;
  const existing = buckets.get(key);

  if (!existing || now - existing.windowStart >= options.windowMs) {
    buckets.set(key, { windowStart: now, count: 1 });
    return {
      allowed: true,
      remaining: options.limit - 1,
      retryAfterSeconds: Math.ceil(options.windowMs / 1000),
    };
  }

  if (existing.count >= options.limit) {
    const elapsed = now - existing.windowStart;
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((options.windowMs - elapsed) / 1000),
    );
    return { allowed: false, remaining: 0, retryAfterSeconds };
  }

  existing.count += 1;
  return {
    allowed: true,
    remaining: options.limit - existing.count,
    retryAfterSeconds: Math.ceil(options.windowMs / 1000),
  };
}

/**
 * Apply rate limiting before invoking the wrapped handler. Returns the
 * 429 response directly when the bucket is exhausted; otherwise lets the
 * handler run and returns its result unchanged.
 *
 * When no client identifier can be derived (no X-Forwarded-For, no
 * sourceIp) the limiter is bypassed — fail-open so a misconfigured
 * gateway never causes a denial of service for real users.
 */
export async function withRateLimit(
  event: APIGatewayEvent,
  options: RateLimitOptions,
  handler: () => Promise<APIGatewayProxyResult>,
): Promise<APIGatewayProxyResult> {
  const ip = getClientIp(event);
  if (ip === null) {
    LOGGER.warn(
      'Rate limit skipped: no client IP available on event (check API Gateway integration headers)',
      { route: options.route },
    );
    return handler();
  }

  const result = checkRateLimit(ip, options);
  if (result.allowed) {
    return handler();
  }

  LOGGER.warn('Rate limit exceeded', {
    route: options.route,
    ip,
    retryAfterSeconds: result.retryAfterSeconds,
  });
  return {
    statusCode: 429,
    headers: {
      'Content-Type': 'application/json',
      'Retry-After': String(result.retryAfterSeconds),
    },
    body: JSON.stringify({
      error: 'rate_limited',
      message: 'Too many requests. Please try again later.',
    }),
  };
}

/** Test helper — clears all buckets between cases. Not for production use. */
export function _resetRateLimitForTests(): void {
  buckets.clear();
  lastSweep = 0;
}
