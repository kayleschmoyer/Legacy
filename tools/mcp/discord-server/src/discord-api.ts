import { getDiscordToken } from './auth.js';

/** Base URL for the Discord REST API (v10). */
export const DISCORD_API_BASE = 'https://discord.com/api/v10';

/** Discord rejects requests without a descriptive User-Agent. */
const USER_AGENT = 'DiscordBot (legacy-sports-mcp-discord, 1.0.0)';

/** Longest Discord-requested rate-limit wait this server will sit through. */
const MAX_RETRY_AFTER_MS = 5_000;

/** Truncate API error bodies and redact anything token-shaped. */
function sanitizeErrorBody(text: string, maxLen = 500): string {
  let sanitized = text
    .replace(/Bot\s+[A-Za-z0-9_\-.]+/gi, 'Bot ***')
    .replace(/Bearer\s+[A-Za-z0-9_\-.]+/gi, 'Bearer ***')
    .replace(
      /[A-Za-z0-9_-]{23,28}\.[A-Za-z0-9_-]{6,7}\.[A-Za-z0-9_-]{27,}/g,
      '***',
    );
  if (sanitized.length > maxLen) {
    const suffix = '... (truncated)';
    sanitized = sanitized.slice(0, maxLen - suffix.length) + suffix;
  }
  return sanitized;
}

function isConnectionError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('enotfound') ||
    msg.includes('socket hang up') ||
    msg.includes('fetch failed')
  );
}

interface DiscordGetOptions {
  /** Path under the API base, e.g. `/channels/123/messages`. */
  path: string;
  /** Query string parameters (entries whose value is undefined are omitted). */
  query?: Record<string, string | number | undefined>;
}

function buildUrl(opts: DiscordGetOptions): string {
  let url = `${DISCORD_API_BASE}${opts.path}`;
  if (opts.query) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(opts.query)) {
      if (value !== undefined && value !== '')
        params.append(key, String(value));
    }
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }
  return url;
}

async function discordGetOnce(
  opts: DiscordGetOptions,
): Promise<{ response: Response; text: string }> {
  const token = await getDiscordToken();
  const response = await fetch(buildUrl(opts), {
    method: 'GET',
    headers: {
      Authorization: `Bot ${token}`,
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
    },
  });
  return { response, text: await response.text() };
}

/** Milliseconds Discord asked us to wait on a 429, or null if it is too long. */
function rateLimitWaitMs(text: string): number | null {
  try {
    const parsed = JSON.parse(text) as { retry_after?: unknown };
    if (typeof parsed.retry_after !== 'number') return null;
    const ms = Math.ceil(parsed.retry_after * 1000);
    return ms <= MAX_RETRY_AFTER_MS ? ms : null;
  } catch {
    return null;
  }
}

/**
 * Make an authenticated GET against the Discord REST API and parse the JSON
 * body. This server only ever reads, so a transient connection error or a
 * short rate limit is retried once; nothing here can mutate Discord state.
 */
export async function discordGet<T>(opts: DiscordGetOptions): Promise<T> {
  let attempt: { response: Response; text: string };
  try {
    attempt = await discordGetOnce(opts);
  } catch (err) {
    if (!isConnectionError(err)) throw err;
    attempt = await discordGetOnce(opts);
  }

  if (attempt.response.status === 429) {
    const waitMs = rateLimitWaitMs(attempt.text);
    if (waitMs !== null) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      attempt = await discordGetOnce(opts);
    }
  }

  if (!attempt.response.ok) {
    throw new Error(
      `Discord API GET ${opts.path} failed (${attempt.response.status}): ${sanitizeErrorBody(attempt.text)}`,
    );
  }

  try {
    return JSON.parse(attempt.text) as T;
  } catch {
    throw new Error(
      `Discord API GET ${opts.path} returned non-JSON response: ${sanitizeErrorBody(attempt.text)}`,
    );
  }
}
