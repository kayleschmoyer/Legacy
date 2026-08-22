import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';
import { getEnvVarOptional } from '@legacy-sports/env-utilities';

// Create client outside of handler to reuse
export const secretsClient = new SecretsManagerClient({
  region: 'us-east-1',
});

export interface SecretConfiguration {
  localEnvVar: string | undefined;
  secretPathEnvVar: string;
}

export async function readSecret(config: SecretConfiguration): Promise<string> {
  if (config.localEnvVar) {
    const envVarValue = getEnvVarOptional(config.localEnvVar);

    if (envVarValue !== undefined) {
      return envVarValue;
    }
  }

  const secretKeyPath = getEnvVarOptional(config.secretPathEnvVar);

  if (secretKeyPath === undefined) {
    throw new Error(
      `A value must be provided to retrieve secret configuration. Secret Path: ${config.secretPathEnvVar}`,
    );
  }

  return await retrieveSecretParameterValue(secretKeyPath);
}

/**
 * How long a resolved secret stays cached in module scope.
 *
 * A Lambda execution environment survives many invocations, and before LS-9530
 * every one of them paid a fresh Secrets Manager round trip for the same
 * values — 333 ms for the JWT signing key and 624 ms for the database
 * credentials on a warm container. Caching removes that from the request path.
 *
 * The TTL is what keeps credential *rotation* working: a rotated secret is
 * picked up within one TTL without a redeploy, so this must stay bounded and
 * short. Five minutes trades a small rotation lag for effectively eliminating
 * the per-request cost. Override with `SECRET_CACHE_TTL_MS` (0 disables
 * caching entirely, restoring the pre-LS-9530 read-every-time behaviour).
 */
const DEFAULT_SECRET_CACHE_TTL_MS = 5 * 60 * 1000;

function getSecretCacheTtlMs(): number {
  const raw = getEnvVarOptional('SECRET_CACHE_TTL_MS');
  if (raw === undefined) return DEFAULT_SECRET_CACHE_TTL_MS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0
    ? parsed
    : DEFAULT_SECRET_CACHE_TTL_MS;
}

interface SecretCacheEntry {
  /** The in-flight or settled fetch. Cached as a promise, not a value, so that
   *  concurrent callers for the same secret share one round trip rather than
   *  racing to issue duplicates. */
  value: Promise<string>;
  /** Epoch ms after which this entry is considered stale. */
  expiresAt: number;
}

const secretCache = new Map<string, SecretCacheEntry>();

/**
 * Drop cached secrets so the next read goes back to Secrets Manager.
 *
 * Call with a secret name to evict one entry, or with no argument to clear the
 * whole cache. Used to recover from a rotation mid-TTL — e.g. the database
 * client evicts its credentials on an authentication failure and retries
 * rather than waiting out the TTL.
 */
export function invalidateSecretCache(secret_name?: string): void {
  if (secret_name === undefined) {
    secretCache.clear();
    return;
  }
  secretCache.delete(secret_name);
}

async function fetchSecretParameterValue(secret_name: string): Promise<string> {
  const response = await secretsClient.send(
    new GetSecretValueCommand({
      SecretId: secret_name,
      VersionStage: 'AWSCURRENT', // VersionStage defaults to AWSCURRENT if unspecified
    }),
  );

  if (response.SecretString === undefined) {
    throw new Error(`${secret_name} is undefined!`);
  }

  return response.SecretString;
}

export function retrieveSecretParameterValue(
  secret_name: string,
): Promise<string> {
  const ttlMs = getSecretCacheTtlMs();
  if (ttlMs === 0) {
    return fetchSecretParameterValue(secret_name);
  }

  const now = Date.now();
  const cached = secretCache.get(secret_name);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const value = fetchSecretParameterValue(secret_name);
  secretCache.set(secret_name, { value, expiresAt: now + ttlMs });

  // Never let a rejection stick in the cache: a transient Secrets Manager
  // failure must not poison reads for the rest of the TTL. The catch is
  // attached to a copy of the promise so the returned one keeps its rejection
  // for the caller to handle.
  value.catch(() => {
    if (secretCache.get(secret_name)?.value === value) {
      secretCache.delete(secret_name);
    }
  });

  return value;
}

/**
 * Warm the cache for `secret_name` without blocking or throwing.
 *
 * Intended for module-scope warmup in a Lambda: kicking every secret the
 * handler will need off together means they share one TLS handshake and
 * resolve concurrently, instead of each paying a serialized round trip on the
 * request path (LS-9530). Failures are ignored here — the real read that
 * follows surfaces them.
 */
export function prefetchSecret(secret_name: string): void {
  void retrieveSecretParameterValue(secret_name).catch(() => undefined);
}
