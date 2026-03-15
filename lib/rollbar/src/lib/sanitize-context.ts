const REDACTED = '[REDACTED]';

const DEFAULT_SENSITIVE_KEYS = [
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'token',
  'access_token',
  'refresh_token',
  'id_token',
  'password',
  'secret',
  'jwt',
  'session',
  // PII fields
  'email',
  'phone',
  'address',
  'ssn',
  'name',
  'ip',
];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function shouldRedactKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return DEFAULT_SENSITIVE_KEYS.some(
    (sensitive) =>
      normalized === sensitive ||
      normalized.endsWith(`_${sensitive}`) ||
      normalized.includes(sensitive),
  );
}

function sanitizeValue(
  value: unknown,
  depth: number,
  seen: WeakSet<object>,
): unknown {
  if (depth <= 0) return '[Truncated]';

  if (value === null || value === undefined) return value;
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, depth - 1, seen));
  }

  if (typeof value === 'object') {
    if (seen.has(value)) return '[Circular]';
    seen.add(value);

    if (isPlainObject(value)) {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) {
        if (shouldRedactKey(k)) {
          out[k] = REDACTED;
        } else {
          out[k] = sanitizeValue(v, depth - 1, seen);
        }
      }
      return out;
    }

    // For non-plain objects (Errors, Dates, etc), stringify safely.
    try {
      if (value instanceof Error) return value.message;
      if (value instanceof Date) return value.toISOString();
      return JSON.stringify(value) ?? '[Unserializable]';
    } catch {
      return '[Unserializable]';
    }
  }

  return typeof value === 'symbol' ? value.toString() : String(value as string);
}

export function sanitizeContext(
  context: Record<string, unknown>,
  options?: { maxDepth?: number },
): Record<string, unknown> {
  const maxDepth = options?.maxDepth ?? 6;
  return sanitizeValue(context, maxDepth, new WeakSet()) as Record<
    string,
    unknown
  >;
}
