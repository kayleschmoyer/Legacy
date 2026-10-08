import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';
import { createHash, createSign } from 'node:crypto';

/**
 * Fetch a migration file from GitHub by repo ref (LS-10974).
 *
 * `db_migrate` originally accepted a migration only as inline `tsSource` /
 * `jsSource`, so the agent had to re-emit the whole file inside a tool-call
 * argument. Large seed/backfill migrations (~80–100 KB, LS-10674) got truncated
 * in transit and produced invalid JSON. This module lets the server read the
 * file itself: the caller passes `{ branch | sha, path }` and the Lambda reads
 * the file from `bkrupa/legacy-sports` with the Agent Author GitHub App
 * credentials the GitHub/CI MCP Lambdas already use (`mcp_github_token`
 * secret, via `GITHUB_TOKEN_SECRET_NAME`).
 *
 * Blast radius is bounded twice: the repo is fixed (never caller-supplied), and
 * the path must be a top-level migration file under `lib/db-client/migrations/`
 * whose name matches the runner's `YYYYMMDD_HHMMSS_*.ts` shape.
 */

/** The only repository `db_migrate` will read migrations from. */
export const MIGRATION_REPO = 'bkrupa/legacy-sports';

/** Directory every by-ref migration path must live directly under. */
export const MIGRATION_DIR = 'lib/db-client/migrations/';

/**
 * Accepted by-ref path: a single file directly under `MIGRATION_DIR` named like
 * the runner's migration files. `[^/\\]` keeps it to one path segment, so no
 * subdirectory or traversal can match; `..` is also rejected explicitly.
 */
const MIGRATION_PATH_RE =
  /^lib\/db-client\/migrations\/(\d{8}_\d{6}_[^/\\]+\.ts)$/;

/** Branch names: git-ref-safe characters only, no `..`, no leading `-`/`/`. */
const BRANCH_RE = /^[A-Za-z0-9._][A-Za-z0-9._/-]{0,254}$/;

/** Abbreviated or full commit SHA. */
const SHA_RE = /^[0-9a-f]{7,40}$/i;

/** Agent Author app defaults — same as tools/mcp/github-server/src/auth.ts. */
const DEFAULT_APP_ID = '3158619';
const DEFAULT_INSTALLATION_ID = '118260223';

/** Regenerate the installation token this long before it expires. */
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000;

const GITHUB_TIMEOUT_MS = 10_000;

/** Caller-supplied reference to a migration file in the repo. */
export interface MigrationRef {
  /** Branch to read from. Provide exactly one of `branch` / `sha`. */
  branch?: string;
  /** Commit SHA to read from. Provide exactly one of `branch` / `sha`. */
  sha?: string;
  /** Repo path, e.g. `lib/db-client/migrations/20261006_180000_x.ts`. */
  path: string;
}

/** Provenance of a by-ref migration, reported back so callers can verify what ran. */
export interface MigrationSourceInfo {
  name: string;
  repo: string;
  path: string;
  /** The branch or SHA the caller asked for. */
  ref: string;
  /** Git blob SHA of the fetched file (matches `git hash-object <file>`). */
  blobSha: string;
  /** SHA-256 of the fetched file's bytes. */
  sha256: string;
  bytes: number;
}

export interface FetchedMigration {
  name: string;
  tsSource: string;
  source: MigrationSourceInfo;
}

/**
 * Validate a ref and return the migration filename it points at. Throws on any
 * path outside `MIGRATION_DIR`, a non-migration filename, or a bad branch/SHA.
 */
export function validateMigrationRef(ref: MigrationRef): {
  name: string;
  gitRef: string;
} {
  if (!ref || typeof ref !== 'object') {
    throw new Error('Migration ref must be an object { branch | sha, path }.');
  }
  const path = typeof ref.path === 'string' ? ref.path : '';
  const match = MIGRATION_PATH_RE.exec(path);
  if (!match || path.includes('..')) {
    throw new Error(
      `Migration ref path '${path}' is not allowed — it must be a ` +
        `${MIGRATION_DIR}YYYYMMDD_HHMMSS_<name>.ts file.`,
    );
  }

  const hasBranch = typeof ref.branch === 'string' && ref.branch.length > 0;
  const hasSha = typeof ref.sha === 'string' && ref.sha.length > 0;
  if (hasBranch === hasSha) {
    throw new Error(
      `Migration ref for '${path}' must provide exactly one of branch or sha.`,
    );
  }
  if (hasBranch) {
    const branch = ref.branch as string;
    if (!BRANCH_RE.test(branch) || branch.includes('..')) {
      throw new Error(`Invalid branch name in migration ref: '${branch}'.`);
    }
    return { name: match[1], gitRef: branch };
  }
  const sha = ref.sha as string;
  if (!SHA_RE.test(sha)) {
    throw new Error(`Invalid commit sha in migration ref: '${sha}'.`);
  }
  return { name: match[1], gitRef: sha };
}

/** Git blob SHA-1 of `content`, identical to `git hash-object`. */
export function gitBlobSha(content: Buffer): string {
  return createHash('sha1')
    .update(`blob ${content.length}\0`)
    .update(content)
    .digest('hex');
}

// ---------------------------------------------------------------------------
// GitHub App installation token
// ---------------------------------------------------------------------------

interface AppCredentials {
  appId: string;
  installationId: string;
  privateKey: string;
}

const sm = new SecretsManagerClient({});

let cachedToken: { token: string; expiresAt: number } | null = null;

/** Reset the cached installation token (tests only). */
export function resetGitHubTokenCache(): void {
  cachedToken = null;
}

async function readAppCredentials(): Promise<AppCredentials> {
  const secretName = process.env['GITHUB_TOKEN_SECRET_NAME'];
  if (!secretName) {
    throw new Error(
      'GITHUB_TOKEN_SECRET_NAME is not configured — by-ref migrations are unavailable; pass tsSource instead.',
    );
  }
  const result = await sm.send(
    new GetSecretValueCommand({ SecretId: secretName }),
  );
  const raw = result.SecretString?.trim();
  if (!raw) throw new Error(`Secret "${secretName}" is missing SecretString`);
  let secret: {
    app_id?: string;
    installation_id?: string;
    private_key?: string;
  };
  try {
    secret = JSON.parse(raw) as typeof secret;
  } catch {
    throw new Error(`Secret "${secretName}" is not valid JSON`);
  }
  if (!secret.private_key) {
    throw new Error(
      `Secret "${secretName}" is missing required field: private_key`,
    );
  }
  return {
    appId: secret.app_id || DEFAULT_APP_ID,
    installationId: secret.installation_id || DEFAULT_INSTALLATION_ID,
    privateKey: secret.private_key.replace(/\\n/g, '\n'),
  };
}

function createAppJwt(privateKey: string, appId: string): string {
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  const signingInput = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({
    iat: now - 60,
    exp: now + 600,
    iss: appId,
  })}`;
  const signature = createSign('RSA-SHA256')
    .update(signingInput)
    .sign(privateKey, 'base64url');
  return `${signingInput}.${signature}`;
}

async function getInstallationToken(): Promise<string> {
  if (
    cachedToken &&
    Date.now() < cachedToken.expiresAt - TOKEN_EXPIRY_BUFFER_MS
  ) {
    return cachedToken.token;
  }
  const creds = await readAppCredentials();
  const res = await fetch(
    `https://api.github.com/app/installations/${creds.installationId}/access_tokens`,
    {
      method: 'POST',
      signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${createAppJwt(creds.privateKey, creds.appId)}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    },
  );
  if (!res.ok) {
    throw new Error(
      `GitHub App token exchange failed (${res.status}): ${await res.text()}`,
    );
  }
  const body = (await res.json()) as { token: string; expires_at: string };
  cachedToken = {
    token: body.token,
    expiresAt: new Date(body.expires_at).getTime(),
  };
  return body.token;
}

// ---------------------------------------------------------------------------
// File fetch
// ---------------------------------------------------------------------------

interface ContentsResponse {
  type?: string;
  sha?: string;
  size?: number;
  encoding?: string;
  content?: string;
}

/**
 * Fetch one migration file at `ref` from `MIGRATION_REPO` via the contents API
 * (JSON form, base64 content — files up to 1 MB, well above any migration).
 * The returned blob SHA is recomputed from the decoded bytes and must match
 * what GitHub reported, so a corrupted transfer can never be applied.
 */
export async function fetchMigrationFromRepo(
  ref: MigrationRef,
): Promise<FetchedMigration> {
  const { name, gitRef } = validateMigrationRef(ref);
  const token = await getInstallationToken();

  const encodedPath = ref.path.split('/').map(encodeURIComponent).join('/');
  const url =
    `https://api.github.com/repos/${MIGRATION_REPO}/contents/${encodedPath}` +
    `?ref=${encodeURIComponent(gitRef)}`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (res.status === 404) {
    throw new Error(
      `Migration '${ref.path}' not found at ref '${gitRef}' in ${MIGRATION_REPO} — is the branch pushed?`,
    );
  }
  if (!res.ok) {
    throw new Error(
      `GitHub contents fetch for '${ref.path}' at '${gitRef}' failed (${res.status}): ${await res.text()}`,
    );
  }

  const body = (await res.json()) as ContentsResponse;
  if (body.type !== 'file' || body.encoding !== 'base64' || !body.content) {
    throw new Error(
      `GitHub returned no inline file content for '${ref.path}' at '${gitRef}' (type=${body.type ?? '?'}, size=${body.size ?? '?'}).`,
    );
  }

  const bytes = Buffer.from(body.content, 'base64');
  const blobSha = gitBlobSha(bytes);
  if (body.sha && body.sha !== blobSha) {
    throw new Error(
      `Blob SHA mismatch for '${ref.path}' at '${gitRef}': GitHub reported ${body.sha}, decoded content hashes to ${blobSha}.`,
    );
  }

  return {
    name,
    tsSource: bytes.toString('utf-8'),
    source: {
      name,
      repo: MIGRATION_REPO,
      path: ref.path,
      ref: gitRef,
      blobSha,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      bytes: bytes.length,
    },
  };
}
