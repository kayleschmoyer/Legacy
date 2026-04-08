import {
  resolve,
  sep,
  dirname,
  basename,
  isAbsolute as pathIsAbsolute,
} from 'node:path';
import { writeFileSync, chmodSync, mkdirSync, realpathSync } from 'node:fs';
import { getRepoRoot, runCommand } from '../run-command.js';
import type { ToolResult } from '../types.js';
import { SSO_ERROR_PATTERN, ssoRemedy } from '../aws-error.js';

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

/** Allows alphanumerics plus all valid AWS Secrets Manager name characters (/_+=.@-). No wildcards — avoids shell glob expansion with shell:true. */
const SAFE_FILTER_RE = /^[A-Za-z0-9/_\-.=@+]+$/;
/** Allowlist for secret IDs — matches AWS Secrets Manager allowed characters: alphanumeric plus /_+=.@-
 * Note: ARN format (arn:aws:secretsmanager:...) is NOT supported — only secret names are accepted.
 * Colons (':') are excluded from the allowlist because they are not valid in secret names and
 * accepting them would require broader shell-safety analysis. Pass the secret name, not its ARN. */
const SAFE_SECRET_ID_RE = /^[A-Za-z0-9/_+=.@-]+$/;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DescribeSecretResponse {
  ARN?: string;
  Name?: string;
  Description?: string;
  KmsKeyId?: string;
  RotationEnabled?: boolean;
  LastChangedDate?: string;
  LastAccessedDate?: string;
  Tags?: Array<{ Key?: string; Value?: string }>;
  VersionIdsToStages?: Record<string, string[]>;
}

interface SecretListEntry {
  ARN?: string;
  Name?: string;
  Description?: string;
  LastChangedDate?: string;
  Tags?: Array<{ Key?: string; Value?: string }>;
}

interface ListSecretsResponse {
  SecretList?: SecretListEntry[];
  NextToken?: string;
}

// ---------------------------------------------------------------------------
// aws_secretsmanager_describe_secret
// ---------------------------------------------------------------------------

export interface DescribeSecretParams {
  secretId: string;
  environment?: string;
}

export async function describeSecret(
  params: DescribeSecretParams,
): Promise<ToolResult> {
  const repoRoot = getRepoRoot();
  const { secretId, environment = 'dev' } = params;

  if (!SAFE_SECRET_ID_RE.test(secretId)) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            error:
              'Invalid secretId: only alphanumerics and the characters /_+=.@- are allowed. ARNs are not supported — pass the secret name only (e.g. "dev/my-secret").',
          }),
        },
      ],
      isError: true,
    };
  }
  if (!SAFE_FILTER_RE.test(environment)) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            error:
              'Invalid environment: only alphanumerics and the characters /_+=.@- are allowed.',
          }),
        },
      ],
      isError: true,
    };
  }

  // Expand short IDs: "mlb-data-api-key" -> "dev/mlb-data-api-key"
  const resolvedId = secretId.includes('/')
    ? secretId
    : `${environment}/${secretId}`;

  const args = [
    'secretsmanager',
    'describe-secret',
    '--secret-id',
    resolvedId,
    '--output',
    'json',
  ];

  try {
    const output = await runCommand('aws', args, repoRoot);
    const data = JSON.parse(output) as DescribeSecretResponse;
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              ok: true,
              arn: data.ARN,
              name: data.Name,
              description: data.Description ?? null,
              kmsKeyId: data.KmsKeyId ?? null,
              rotationEnabled: data.RotationEnabled ?? false,
              lastChangedDate: data.LastChangedDate ?? null,
              lastAccessedDate: data.LastAccessedDate ?? null,
              tags: Object.fromEntries(
                (data.Tags ?? [])
                  .filter((t) => t.Key !== undefined)
                  .map((t) => [t.Key!, t.Value ?? '']),
              ),
              versionCount: Object.keys(data.VersionIdsToStages ?? {}).length,
            },
            null,
            2,
          ),
        },
      ],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            secretId: resolvedId,
            error: message,
            remedy: SSO_ERROR_PATTERN.test(message) ? ssoRemedy() : undefined,
          }),
        },
      ],
      isError: true,
    };
  }
}

// ---------------------------------------------------------------------------
// aws_secretsmanager_get_secret_value
// ---------------------------------------------------------------------------

export interface GetSecretValueParams {
  secretId: string;
  environment?: string;
  outputFile: string;
}

export async function getSecretValue(
  params: GetSecretValueParams,
): Promise<ToolResult> {
  const repoRoot = getRepoRoot();
  const { secretId, environment = 'dev', outputFile } = params;

  if (!SAFE_SECRET_ID_RE.test(secretId)) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            error:
              'Invalid secretId: only alphanumerics and the characters /_+=.@- are allowed. ARNs are not supported — pass the secret name only (e.g. "dev/my-secret").',
          }),
        },
      ],
      isError: true,
    };
  }
  if (!SAFE_FILTER_RE.test(environment)) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            error:
              'Invalid environment: only alphanumerics and the characters /_+=.@- are allowed.',
          }),
        },
      ],
      isError: true,
    };
  }

  const resolvedId = secretId.includes('/')
    ? secretId
    : `${environment}/${secretId}`;

  // Normalize whitespace first so all subsequent checks operate on the same value.
  const trimmedOutputFile = outputFile.trim();

  // Reject absolute outputFile paths — only relative paths (resolved under the repo root) are allowed.
  // The Windows drive-letter check (/^[A-Za-z]:[\\/]/) is needed because path.isAbsolute() is
  // platform-dependent: on Linux/macOS, `C:\secret.tmp` is treated as a relative path.
  // The UNC check (/^(?:\\\\|\/\/)/) rejects Windows UNC paths (\\server\share\file or //server/share/file)
  // because path.isAbsolute() won't treat them as absolute on non-Windows hosts.
  const WINDOWS_ABSOLUTE_RE = /^[A-Za-z]:[\\/]/;
  const WINDOWS_UNC_RE = /^(?:\\\\|\/\/)/;
  if (
    pathIsAbsolute(trimmedOutputFile) ||
    WINDOWS_ABSOLUTE_RE.test(trimmedOutputFile) ||
    WINDOWS_UNC_RE.test(trimmedOutputFile)
  ) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            error: 'Absolute outputFile paths are not allowed.',
          }),
        },
      ],
      isError: true,
    };
  }

  // Reject degenerate outputFile values that would resolve to the repo root itself or be ambiguous.
  if (
    trimmedOutputFile === '' ||
    trimmedOutputFile === '.' ||
    trimmedOutputFile === '..'
  ) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            error:
              'outputFile must resolve to a file path under the repo root.',
          }),
        },
      ],
      isError: true,
    };
  }

  // Resolve relative paths under the repo root, guarding against traversal.
  const resolvedOutput = resolve(repoRoot, trimmedOutputFile);
  const resolvedRoot = resolve(repoRoot);

  // Reject paths that resolve exactly to the repo root (would overwrite the directory itself).
  if (resolvedOutput === resolvedRoot) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            error:
              'outputFile must resolve to a file path under the repo root.',
          }),
        },
      ],
      isError: true,
    };
  }

  // Resolve symlinks in the parent directory (if it exists) before doing the containment check.
  // This prevents symlink-based escapes from the repo root.
  // Note: realpathSync is only applied to the directory component because the output file may
  // not exist yet. If the directory itself does not exist yet, the prefix check falls back to
  // the unresolved path (symlink-based escape via a not-yet-created directory is not possible).
  const outputDir = dirname(resolvedOutput);
  let realOutputDir: string;
  try {
    realOutputDir = realpathSync(outputDir);
  } catch {
    // Directory doesn't exist yet — fall back to the resolved (non-symlink-resolved) path.
    realOutputDir = outputDir;
  }
  let realRoot: string;
  try {
    realRoot = realpathSync(resolvedRoot);
  } catch {
    realRoot = resolvedRoot;
  }

  // Reconstruct the effective output path using the realpath-resolved directory and the
  // basename of the target file (the file itself can't be a symlink yet since we only write
  // new files — see the atomic wx write below).
  const realResolvedOutput = resolve(realOutputDir, basename(resolvedOutput));

  if (
    realResolvedOutput !== realRoot &&
    !realResolvedOutput.startsWith(realRoot + sep)
  ) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            error: 'outputFile must be within the repo root.',
          }),
        },
      ],
      isError: true,
    };
  }

  // Fetch the full JSON response so we can handle both SecretString and SecretBinary.
  const args = [
    'secretsmanager',
    'get-secret-value',
    '--secret-id',
    resolvedId,
    '--output',
    'json',
  ];

  try {
    const rawOutput = await runCommand('aws', args, repoRoot);
    const data = JSON.parse(rawOutput) as {
      SecretString?: string;
      SecretBinary?: string;
    };

    let secretContent: string | Buffer;
    let encoding: 'utf-8' | 'binary';
    if (data.SecretString !== undefined && data.SecretString !== null) {
      secretContent = data.SecretString;
      encoding = 'utf-8';
    } else if (data.SecretBinary !== undefined && data.SecretBinary !== null) {
      // SecretBinary is returned as a base64-encoded string by the AWS CLI; decode it to raw bytes.
      secretContent = Buffer.from(data.SecretBinary, 'base64');
      encoding = 'binary';
    } else {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              ok: false,
              secretId: resolvedId,
              error:
                'AWS returned neither SecretString nor SecretBinary for this secret.',
            }),
          },
        ],
        isError: true,
      };
    }

    // Ensure the parent directory exists before writing.
    const writeOutputDir = dirname(resolvedOutput);
    mkdirSync(writeOutputDir, { recursive: true });

    // Re-verify containment AFTER mkdirSync to close the TOCTOU directory-swap window: a local
    // attacker could replace the directory with a symlink between our earlier realpath check and
    // the actual write. Re-resolving the now-guaranteed-to-exist directory catches that swap.
    let postMkdirRealOutputDir: string;
    try {
      postMkdirRealOutputDir = realpathSync(writeOutputDir);
    } catch {
      postMkdirRealOutputDir = writeOutputDir;
    }
    const verifiedOutput = resolve(
      postMkdirRealOutputDir,
      basename(resolvedOutput),
    );
    if (
      verifiedOutput !== realRoot &&
      !verifiedOutput.startsWith(realRoot + sep)
    ) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              ok: false,
              error:
                'outputFile path escaped the repo root after directory creation — possible symlink swap attack.',
            }),
          },
        ],
        isError: true,
      };
    }

    // Use exclusive-create flag ('wx') to atomically prevent overwrites and symlink-swap races:
    // 'wx' fails with EEXIST if the path already exists (file or symlink), eliminating the
    // TOCTOU race that would exist with a separate existsSync() + writeFileSync() sequence.
    try {
      writeFileSync(verifiedOutput, secretContent, { flag: 'wx', mode: 0o600 });
    } catch (writeErr) {
      if (
        writeErr instanceof Error &&
        (writeErr as NodeJS.ErrnoException).code === 'EEXIST'
      ) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                ok: false,
                error:
                  'outputFile already exists — delete it first to prevent accidental overwrites',
              }),
            },
          ],
          isError: true,
        };
      }
      throw writeErr;
    }
    chmodSync(verifiedOutput, 0o600);
    const byteLength =
      secretContent instanceof Buffer
        ? secretContent.byteLength
        : Buffer.byteLength(secretContent, encoding);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: true,
            secretId: resolvedId,
            path: verifiedOutput,
            encoding,
            bytes: byteLength,
            note: 'Secret value written to file. Value is NOT included in this response.',
          }),
        },
      ],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            secretId: resolvedId,
            error: message,
            remedy: SSO_ERROR_PATTERN.test(message) ? ssoRemedy() : undefined,
          }),
        },
      ],
      isError: true,
    };
  }
}

// ---------------------------------------------------------------------------
// aws_secretsmanager_list_secrets
// ---------------------------------------------------------------------------

export interface ListSecretsParams {
  environment?: string;
  filter?: string;
}

export async function listSecrets(
  params: ListSecretsParams,
): Promise<ToolResult> {
  const repoRoot = getRepoRoot();
  const { environment = 'dev', filter } = params;

  if (filter !== undefined && !SAFE_FILTER_RE.test(filter)) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            error:
              'Invalid filter: only alphanumerics and the characters /_+=.@- are allowed.',
          }),
        },
      ],
      isError: true,
    };
  }
  if (!SAFE_FILTER_RE.test(environment)) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            error:
              'Invalid environment: only alphanumerics and the characters /_+=.@- are allowed.',
          }),
        },
      ],
      isError: true,
    };
  }

  // Filter by environment prefix if no explicit filter
  const nameFilter = filter ?? `${environment}/`;
  const baseArgs = [
    'secretsmanager',
    'list-secrets',
    '--output',
    'json',
    '--filters',
    `Key=name,Values=${nameFilter}`,
  ];

  try {
    const allSecrets: SecretListEntry[] = [];
    let nextToken: string | undefined;

    do {
      const args = nextToken
        ? [...baseArgs, '--next-token', nextToken]
        : baseArgs;
      const output = await runCommand('aws', args, repoRoot);
      const data = JSON.parse(output) as ListSecretsResponse;
      allSecrets.push(...(data.SecretList ?? []));
      nextToken = data.NextToken;
    } while (nextToken !== undefined);

    // Post-filter to match documented prefix contract: when no explicit filter is provided,
    // keep only secrets whose Name starts with `${environment}/`. The AWS --filters flag uses
    // a contains match for Key=name, so it may return entries outside the prefix.
    const filtered =
      filter !== undefined
        ? allSecrets
        : allSecrets.filter((s) =>
            (s.Name ?? '').startsWith(`${environment}/`),
          );

    const secrets = filtered.map((s) => ({
      name: s.Name,
      arn: s.ARN,
      description: s.Description ?? null,
      lastChangedDate: s.LastChangedDate ?? null,
    }));
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            { ok: true, count: secrets.length, secrets },
            null,
            2,
          ),
        },
      ],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            error: message,
            remedy: SSO_ERROR_PATTERN.test(message) ? ssoRemedy() : undefined,
          }),
        },
      ],
      isError: true,
    };
  }
}
