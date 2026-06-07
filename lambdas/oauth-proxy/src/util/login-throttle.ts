import {
  DeleteItemCommand,
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';
import { LOGGER } from '@legacy-sports/logging';
import crypto from 'crypto';

/**
 * Per-email failed-login throttle with lockout (LGN-020 / LS-6675).
 *
 * The IP rate limiter in util/rate-limit.ts is a per-Lambda-instance, per-IP
 * floor: it does NOT see traffic across concurrent warm containers, and it
 * does NOT throttle by target identity. That leaves credential-stuffing
 * against a single email from many IPs completely untouched.
 *
 * This module closes that gap with a per-EMAIL failed-attempt counter that is
 * shared across all Lambda containers via DynamoDB (with a fixed window and a
 * TTL so entries self-expire). Local dev falls back to an in-memory Map when
 * LOGIN_THROTTLE_TABLE_NAME is unset — same semantics, single-process only.
 *
 * The control fails OPEN: any storage error degrades to "not locked" /
 * best-effort record, mirroring the IP limiter, so a backing-store outage can
 * never deny legitimate users.
 */

// Max failed attempts against a single email before the email is locked out
// for the remainder of the window. Tuned well above legitimate retry/typo
// behaviour but low enough to make online credential-stuffing impractical.
export const MAX_FAILED_ATTEMPTS = 10;

// Fixed window length. Both the lockout duration and the counter reset window.
export const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;

// DynamoDB TTL is epoch SECONDS; keep a small grace beyond the logical window
// so the row outlives an in-flight lockout before DynamoDB lazily evicts it.
const TTL_GRACE_SECONDS = 60;

const TABLE_NAME = process.env.LOGIN_THROTTLE_TABLE_NAME;

let dynamoClient: DynamoDBClient | null = null;

function getDynamoClient(): DynamoDBClient {
  if (!dynamoClient) {
    dynamoClient = new DynamoDBClient({
      region: process.env.AWS_REGION ?? 'us-east-1',
    });
  }
  return dynamoClient;
}

/**
 * Derive the throttle key from an email. The email is normalised (trimmed,
 * lower-cased) so casing/whitespace variants share one bucket, then hashed —
 * we never store the raw email (PII) in the throttle table.
 */
function throttleKey(email: string): string {
  const normalised = email.trim().toLowerCase();
  return crypto.createHash('sha256').update(normalised).digest('hex');
}

export interface LoginLockState {
  locked: boolean;
  retryAfterSeconds: number;
}

const NOT_LOCKED: LoginLockState = { locked: false, retryAfterSeconds: 0 };

// ---------------------------------------------------------------------------
// In-memory fallback (local dev only — not shared across instances)
// ---------------------------------------------------------------------------

interface ThrottleEntry {
  attempts: number;
  windowExpiresAt: number;
}

const inMemory = new Map<string, ThrottleEntry>();

function memoryRecord(key: string, now: number): void {
  const existing = inMemory.get(key);
  if (!existing || existing.windowExpiresAt <= now) {
    inMemory.set(key, {
      attempts: 1,
      windowExpiresAt: now + LOCKOUT_WINDOW_MS,
    });
    return;
  }
  existing.attempts += 1;
}

function memoryLockState(key: string, now: number): LoginLockState {
  const existing = inMemory.get(key);
  if (!existing || existing.windowExpiresAt <= now) return NOT_LOCKED;
  if (existing.attempts < MAX_FAILED_ATTEMPTS) return NOT_LOCKED;
  return {
    locked: true,
    retryAfterSeconds: Math.max(
      1,
      Math.ceil((existing.windowExpiresAt - now) / 1000),
    ),
  };
}

// ---------------------------------------------------------------------------
// DynamoDB backend (shared across all Lambda containers)
// ---------------------------------------------------------------------------

async function dynamoRecord(key: string, now: number): Promise<void> {
  const client = getDynamoClient();
  try {
    // Increment only while the current window is still open — keeps the window
    // fixed from the first failure rather than sliding on every attempt.
    await client.send(
      new UpdateItemCommand({
        TableName: TABLE_NAME,
        Key: { emailHash: { S: key } },
        UpdateExpression: 'ADD attempts :one',
        ConditionExpression:
          'attribute_exists(windowExpiresAt) AND windowExpiresAt > :now',
        ExpressionAttributeValues: {
          ':one': { N: '1' },
          ':now': { N: String(now) },
        },
      }),
    );
  } catch (error) {
    if ((error as Error).name !== 'ConditionalCheckFailedException')
      throw error;
    // No open window (first failure, or the previous window expired): start a
    // fresh window with a single attempt.
    const windowExpiresAt = now + LOCKOUT_WINDOW_MS;
    await client.send(
      new PutItemCommand({
        TableName: TABLE_NAME,
        Item: {
          emailHash: { S: key },
          attempts: { N: '1' },
          windowExpiresAt: { N: String(windowExpiresAt) },
          ttl: {
            N: String(Math.floor(windowExpiresAt / 1000) + TTL_GRACE_SECONDS),
          },
        },
      }),
    );
  }
}

async function dynamoLockState(
  key: string,
  now: number,
): Promise<LoginLockState> {
  const client = getDynamoClient();
  const response = await client.send(
    new GetItemCommand({
      TableName: TABLE_NAME,
      Key: { emailHash: { S: key } },
    }),
  );

  const item = response.Item;
  if (!item) return NOT_LOCKED;

  const windowExpiresAt = Number(item.windowExpiresAt?.N ?? '0');
  const attempts = Number(item.attempts?.N ?? '0');
  // DynamoDB TTL deletion is lazy (up to ~48h), so honour the logical window
  // ourselves rather than trusting the row's mere existence.
  if (windowExpiresAt <= now || attempts < MAX_FAILED_ATTEMPTS) {
    return NOT_LOCKED;
  }
  return {
    locked: true,
    retryAfterSeconds: Math.max(1, Math.ceil((windowExpiresAt - now) / 1000)),
  };
}

// ---------------------------------------------------------------------------
// Public API (fail-open dispatch over the configured backend)
// ---------------------------------------------------------------------------

/**
 * Whether logins for `email` are currently locked out. Fails open: any storage
 * error is logged and treated as "not locked" so an outage never blocks users.
 */
export async function isLoginLocked(email: string): Promise<LoginLockState> {
  const now = Date.now();
  const key = throttleKey(email);
  try {
    return TABLE_NAME
      ? await dynamoLockState(key, now)
      : memoryLockState(key, now);
  } catch (error) {
    LOGGER.error(
      'Login throttle lock check failed; failing open',
      error instanceof Error ? error : new Error(String(error)),
    );
    return NOT_LOCKED;
  }
}

/**
 * Record a failed login attempt for `email`. Best-effort: a storage error is
 * logged and swallowed so a backing-store outage never breaks the login path.
 */
export async function recordFailedLogin(email: string): Promise<void> {
  const now = Date.now();
  const key = throttleKey(email);
  try {
    if (TABLE_NAME) {
      await dynamoRecord(key, now);
    } else {
      memoryRecord(key, now);
    }
  } catch (error) {
    LOGGER.error(
      'Login throttle record failed (non-fatal)',
      error instanceof Error ? error : new Error(String(error)),
    );
  }
}

/**
 * Clear the failed-attempt counter for `email` after a successful login.
 * Best-effort: a storage error is logged and swallowed.
 */
export async function clearFailedLogins(email: string): Promise<void> {
  const key = throttleKey(email);
  try {
    if (TABLE_NAME) {
      await getDynamoClient().send(
        new DeleteItemCommand({
          TableName: TABLE_NAME,
          Key: { emailHash: { S: key } },
        }),
      );
    } else {
      inMemory.delete(key);
    }
  } catch (error) {
    LOGGER.error(
      'Login throttle clear failed (non-fatal)',
      error instanceof Error ? error : new Error(String(error)),
    );
  }
}

/** Test helper — clears in-memory state between cases. Not for production use. */
export function _resetLoginThrottleForTests(): void {
  inMemory.clear();
}
