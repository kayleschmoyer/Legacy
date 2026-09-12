import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { getRepoRoot } from '../run-command.js';
import type { ToolResult } from '../types.js';
import { SSO_ERROR_PATTERN, ssoRemedy } from '../aws-error.js';

const execFileAsync = promisify(execFile);

const SAFE_SECRET_ID_RE = /^[A-Za-z0-9/_+=.@-]+$/;
const SAFE_ENV_RE = /^[A-Za-z0-9/_\-.=@+]+$/;
const SAFE_GH_SECRET_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SAFE_GH_REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

type Scope = 'repo' | 'environment' | 'dependabot';

export interface SyncSecretToGithubParams {
  secretId: string;
  repoSecret: string;
  environment?: string;
  env?: string;
  scope?: Scope;
  repo?: string;
}

/**
 * Fetch the raw AWS Secrets Manager value as a string. Default impl shells to
 * `aws secretsmanager get-secret-value`. Overridable for tests so neither the
 * AWS CLI nor real network access is required.
 */
export type AwsSecretFetcher = (secretId: string) => Promise<string>;

/**
 * Pipe a value into `gh secret set` with the given args (no shell). Returns
 * null on success or an error message on failure. Overridable for tests.
 */
export type GithubSecretWriter = (
  ghArgs: string[],
  secretValue: string,
) => Promise<string | null>;

export interface SyncSecretDeps {
  fetchAwsSecret?: AwsSecretFetcher;
  writeGithubSecret?: GithubSecretWriter;
  audit?: (line: string) => void;
}

function errorResponse(
  error: string,
  extra?: Record<string, unknown>,
): ToolResult {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ ok: false, error, ...extra }),
      },
    ],
    isError: true,
  };
}

/**
 * Default audit sink — stderr. The value itself is NEVER logged; only the
 * source secret ID and the destination GitHub secret name. stderr is used
 * because stdout on a stdio MCP server carries the JSON-RPC protocol stream.
 */
function defaultAudit(line: string): void {
  process.stderr.write(`[aws-server audit] ${line}\n`);
}

async function defaultFetchAwsSecret(secretId: string): Promise<string> {
  const { stdout } = await execFileAsync(
    'aws',
    [
      'secretsmanager',
      'get-secret-value',
      '--secret-id',
      secretId,
      '--output',
      'json',
    ],
    {
      cwd: getRepoRoot(),
      timeout: 60_000,
      env: { ...process.env, AWS_PAGER: '' },
      // No shell:true — the secret value will be parsed from this output and
      // we want zero shell involvement on either CLI side.
      maxBuffer: 10 * 1024 * 1024,
    },
  );
  const data = JSON.parse(stdout) as {
    SecretString?: string;
    SecretBinary?: string;
  };
  if (typeof data.SecretString === 'string') {
    return data.SecretString;
  }
  if (typeof data.SecretBinary === 'string') {
    return Buffer.from(data.SecretBinary, 'base64').toString('utf-8');
  }
  throw new Error(
    'AWS returned neither SecretString nor SecretBinary for this secret.',
  );
}

async function defaultWriteGithubSecret(
  ghArgs: string[],
  secretValue: string,
): Promise<string | null> {
  return await new Promise<string | null>((resolveErr) => {
    const child = spawn('gh', ghArgs, {
      cwd: getRepoRoot(),
      // shell: false (default for spawn) — values on stdin never touch a shell.
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stderrBuf = '';
    // Drain stdout without buffering it — its contents aren't needed, but the
    // stream must be consumed or the child process can stall on a full pipe.
    child.stdout.resume();
    child.stderr.on('data', (chunk: Buffer) => {
      stderrBuf += chunk.toString('utf-8');
    });
    child.on('error', (e) => resolveErr(e.message));
    child.on('close', (code) => {
      if (code === 0) {
        resolveErr(null);
      } else {
        resolveErr(
          stderrBuf.trim() || `gh secret set exited with code ${code}`,
        );
      }
    });
    // No trailing newline — `gh secret set` treats the entire stdin as the value.
    child.stdin.end(secretValue);
  });
}

export async function syncSecretToGithub(
  params: SyncSecretToGithubParams,
  deps: SyncSecretDeps = {},
): Promise<ToolResult> {
  const {
    secretId,
    repoSecret,
    environment = 'dev',
    env,
    scope = 'repo',
    repo,
  } = params;
  const fetchAwsSecret = deps.fetchAwsSecret ?? defaultFetchAwsSecret;
  const writeGithubSecret = deps.writeGithubSecret ?? defaultWriteGithubSecret;
  const audit = deps.audit ?? defaultAudit;

  // ---- Input validation ----
  if (!SAFE_SECRET_ID_RE.test(secretId)) {
    return errorResponse(
      'Invalid secretId: only alphanumerics and the characters /_+=.@- are allowed. ARNs are not supported — pass the secret name only (e.g. "dev/my-secret").',
    );
  }
  if (!SAFE_ENV_RE.test(environment)) {
    return errorResponse(
      'Invalid environment: only alphanumerics and the characters /_+=.@- are allowed.',
    );
  }
  if (!SAFE_GH_SECRET_NAME_RE.test(repoSecret)) {
    return errorResponse(
      'Invalid repoSecret: GitHub secret names must match /^[A-Za-z_][A-Za-z0-9_]*$/ (no spaces, no dashes, must not start with GITHUB_).',
    );
  }
  if (repoSecret.startsWith('GITHUB_')) {
    return errorResponse(
      'Invalid repoSecret: GitHub forbids secret names starting with "GITHUB_".',
    );
  }
  if (scope !== 'repo' && scope !== 'environment' && scope !== 'dependabot') {
    return errorResponse(
      `Invalid scope "${String(scope)}": must be one of "repo", "environment", or "dependabot".`,
    );
  }
  if (scope === 'environment' && (env === undefined || env === '')) {
    return errorResponse(
      'scope="environment" requires the "env" parameter (the GitHub environment name).',
    );
  }
  if (env !== undefined && !SAFE_ENV_RE.test(env)) {
    return errorResponse(
      'Invalid env: only alphanumerics and the characters /_+=.@- are allowed.',
    );
  }
  if (repo !== undefined && !SAFE_GH_REPO_RE.test(repo)) {
    return errorResponse(
      'Invalid repo: must be "owner/name" (alphanumerics, underscore, dot, hyphen).',
    );
  }

  const resolvedSecretId = secretId.includes('/')
    ? secretId
    : `${environment}/${secretId}`;

  // ---- Fetch the AWS secret value (server-side; never returned to the agent) ----
  let secretValue: string;
  try {
    secretValue = await fetchAwsSecret(resolvedSecretId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errorResponse(`Failed to fetch AWS secret: ${message}`, {
      secretId: resolvedSecretId,
      remedy: SSO_ERROR_PATTERN.test(message) ? ssoRemedy() : undefined,
    });
  }

  // ---- Push to GitHub via `gh secret set` (no shell expansion) ----
  // gh handles libsodium sealed-box encryption and all three scopes natively:
  //   --app dependabot          → dependabot secret
  //   --env <env>               → environment secret
  //   (default)                 → actions repo secret
  const ghArgs = ['secret', 'set', repoSecret];
  if (scope === 'dependabot') {
    ghArgs.push('--app', 'dependabot');
  } else if (scope === 'environment' && env !== undefined) {
    ghArgs.push('--env', env);
  }
  if (repo !== undefined) {
    ghArgs.push('--repo', repo);
  }

  const ghError = await writeGithubSecret(ghArgs, secretValue);
  if (ghError !== null) {
    return errorResponse(`Failed to set GitHub secret: ${ghError}`, {
      secretId: resolvedSecretId,
      repoSecret,
      scope,
    });
  }

  const auditSuffix =
    scope === 'environment'
      ? ` (env=${env})`
      : scope === 'dependabot'
        ? ' (dependabot)'
        : '';
  audit(`synced ${resolvedSecretId} → ${repoSecret}${auditSuffix}`);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            ok: true,
            synced: true,
            secretId: resolvedSecretId,
            repoSecret,
            scope,
            ...(scope === 'environment' ? { env } : {}),
            ...(repo !== undefined ? { repo } : {}),
          },
          null,
          2,
        ),
      },
    ],
  };
}
