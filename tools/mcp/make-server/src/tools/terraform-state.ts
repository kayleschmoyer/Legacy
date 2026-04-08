import { join, resolve, relative } from 'node:path';
import { existsSync, statSync, unlinkSync } from 'node:fs';
import { writeFile as writeFileAsync } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { runCommand } from '../run-command.js';

// Absolute path: Windows (C:\... or C:/...) or Unix (/...)
const ABSOLUTE_PATH_REGEX = /^([A-Za-z]:[/\\]|\/)/;

/**
 * Validate a `dir` parameter and resolve the working directory.
 * Returns the resolved path, or throws an Error if the directory doesn't exist.
 */
function resolveDir(dir: string, repoRoot: string): string {
  const trimmed = dir.trim();
  if (!trimmed) {
    throw new Error(
      'dir must be a non-empty path to a Terraform working directory',
    );
  }
  // If it's an absolute path, use it directly; otherwise resolve relative to repo root.
  // Use path.resolve (not path.join) so that traversal sequences like "../.." are
  // collapsed before the containment check below.
  const resolved = ABSOLUTE_PATH_REGEX.test(trimmed)
    ? trimmed
    : resolve(repoRoot, trimmed);

  // Guard against path traversal: relative paths must stay inside repoRoot.
  if (!ABSOLUTE_PATH_REGEX.test(trimmed)) {
    const rel = relative(repoRoot, resolved);
    if (rel.startsWith('..')) {
      throw new Error(
        `dir must not escape the repository root: "${dir}" resolves outside ${repoRoot}`,
      );
    }
  }

  if (!existsSync(resolved)) {
    throw new Error(`Directory not found: ${resolved}`);
  }

  if (!statSync(resolved).isDirectory()) {
    throw new Error(`Path is not a directory: ${resolved}`);
  }

  return resolved;
}

/** Validate an address/resource name to prevent shell injection. */
function validateAddress(addr: string): string | null {
  // Reject addresses starting with '-' to prevent CLI flag injection
  if (addr.startsWith('-')) {
    return `Address must not start with '-': "${addr}"`;
  }
  // Reject control characters (U+0000–U+001F, U+007F)
  const hasControlChar = [...addr].some((c) => {
    const code = c.charCodeAt(0);
    return code <= 0x1f || code === 0x7f;
  });
  if (hasControlChar) {
    return `Address contains control characters: "${addr}"`;
  }
  // Allow alphanumeric, dots, brackets, underscores, hyphens, slashes, and quotes
  // Reject any shell special chars that aren't needed for terraform addresses
  if (/[;&|`$<>!#%^*{}\n\r]/.test(addr)) {
    return `Address contains disallowed characters: "${addr}"`;
  }
  return null;
}

export type TerraformStateResult =
  | { content: [{ type: 'text'; text: string }]; isError: true }
  | { content: [{ type: 'text'; text: string }] };

// --- terraform_state_pull ---
export async function terraformStatePull(params: {
  dir: string;
  repoRoot: string;
}): Promise<TerraformStateResult> {
  let resolvedDir: string;
  try {
    resolvedDir = resolveDir(params.dir, params.repoRoot);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ success: false, error: errorMsg }),
        },
      ],
      isError: true,
    };
  }

  try {
    const output = await runCommand(
      'terraform',
      ['-chdir=' + resolvedDir, 'state', 'pull'],
      resolvedDir,
      120_000,
      false,
      50 * 1024 * 1024, // 50MB — state JSON can be very large
    );
    // Lightweight validity check — avoid full JSON.parse which can OOM on large state files
    if (
      output.length === 0 ||
      !output.startsWith('{') ||
      !output.endsWith('}')
    ) {
      const preview =
        output.length > 256
          ? output.slice(0, 256) + '\n...[truncated]'
          : output;
      return {
        content: [
          {
            type: 'text',
            text: `terraform state pull output does not look like valid JSON:\n${preview}`,
          },
        ],
        isError: true,
      };
    }
    return {
      content: [
        {
          type: 'text',
          text: output,
        },
      ],
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      content: [
        { type: 'text', text: `terraform state pull failed:\n${errorMsg}` },
      ],
      isError: true,
    };
  }
}

// --- terraform_state_push ---
export async function terraformStatePush(params: {
  dir: string;
  stateJson: string;
  force?: boolean;
  repoRoot: string;
}): Promise<TerraformStateResult> {
  let resolvedDir: string;
  try {
    resolvedDir = resolveDir(params.dir, params.repoRoot);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ success: false, error: errorMsg }),
        },
      ],
      isError: true,
    };
  }

  // Lightweight pre-flight check — Terraform validates the full JSON during state push anyway.
  // Avoid JSON.parse on potentially large state files to prevent OOM in the MCP server.
  if (
    !params.stateJson.trimStart().startsWith('{') ||
    !params.stateJson.trimEnd().endsWith('}')
  ) {
    return {
      content: [
        {
          type: 'text',
          text: 'stateJson does not look like valid JSON (must start with { and end with }).',
        },
      ],
      isError: true,
    };
  }

  // Write state to a temp file with a random name and restrictive permissions
  const tmpFile = join(
    tmpdir(),
    `tf-state-push-${randomBytes(16).toString('hex')}.tfstate`,
  );
  try {
    await writeFileAsync(tmpFile, params.stateJson, {
      encoding: 'utf8',
      mode: 0o600,
    });

    const args = ['-chdir=' + resolvedDir, 'state', 'push'];
    if (params.force) args.push('-force');
    args.push(tmpFile);

    const output = await runCommand(
      'terraform',
      args,
      resolvedDir,
      120_000,
      false,
    );
    let cleanupWarning: string | undefined;
    try {
      unlinkSync(tmpFile);
    } catch (cleanupError) {
      const cleanupErrCode =
        cleanupError != null &&
        typeof cleanupError === 'object' &&
        'code' in cleanupError
          ? (cleanupError as NodeJS.ErrnoException).code
          : undefined;
      if (cleanupErrCode !== 'ENOENT') {
        cleanupWarning =
          `Failed to delete temporary state file ${tmpFile}: ` +
          (cleanupError instanceof Error
            ? cleanupError.message
            : String(cleanupError)) +
          ' — the file may contain sensitive Terraform state; please delete it manually.';
      }
    }
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              output: output || '(no output)',
              ...(cleanupWarning !== undefined && {
                cleanupWarning,
              }),
            },
            null,
            2,
          ),
        },
      ],
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    let cleanupWarning: string | undefined;
    try {
      unlinkSync(tmpFile);
    } catch (cleanupError) {
      const cleanupErrCode =
        cleanupError != null &&
        typeof cleanupError === 'object' &&
        'code' in cleanupError
          ? (cleanupError as NodeJS.ErrnoException).code
          : undefined;
      if (cleanupErrCode !== 'ENOENT') {
        cleanupWarning =
          `Failed to delete temporary state file ${tmpFile}: ` +
          (cleanupError instanceof Error
            ? cleanupError.message
            : String(cleanupError)) +
          ' — the file may contain sensitive Terraform state; please delete it manually.';
      }
    }
    return {
      content: [
        {
          type: 'text',
          text:
            `terraform state push failed:\n${errorMsg}` +
            (cleanupWarning !== undefined
              ? `\n\nWarning: ${cleanupWarning}`
              : ''),
        },
      ],
      isError: true,
    };
  }
}

// --- terraform_state_mv ---
export async function terraformStateMv(params: {
  dir: string;
  source: string;
  destination: string;
  repoRoot: string;
}): Promise<TerraformStateResult> {
  let resolvedDir: string;
  try {
    resolvedDir = resolveDir(params.dir, params.repoRoot);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ success: false, error: errorMsg }),
        },
      ],
      isError: true,
    };
  }

  const sourceErr = validateAddress(params.source);
  if (sourceErr) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ success: false, error: sourceErr }),
        },
      ],
      isError: true,
    };
  }

  const destErr = validateAddress(params.destination);
  if (destErr) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ success: false, error: destErr }),
        },
      ],
      isError: true,
    };
  }

  try {
    const output = await runCommand(
      'terraform',
      [
        '-chdir=' + resolvedDir,
        'state',
        'mv',
        params.source,
        params.destination,
      ],
      resolvedDir,
      60_000,
      false,
    );
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              source: params.source,
              destination: params.destination,
              output: output || '(no output)',
            },
            null,
            2,
          ),
        },
      ],
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      content: [
        { type: 'text', text: `terraform state mv failed:\n${errorMsg}` },
      ],
      isError: true,
    };
  }
}

// --- terraform_state_list ---
export async function terraformStateList(params: {
  dir: string;
  address?: string;
  repoRoot: string;
}): Promise<TerraformStateResult> {
  let resolvedDir: string;
  try {
    resolvedDir = resolveDir(params.dir, params.repoRoot);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ success: false, error: errorMsg }),
        },
      ],
      isError: true,
    };
  }

  if (params.address) {
    const addrErr = validateAddress(params.address);
    if (addrErr) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ success: false, error: addrErr }),
          },
        ],
        isError: true,
      };
    }
  }

  const args = ['-chdir=' + resolvedDir, 'state', 'list'];
  if (params.address) args.push(params.address);

  try {
    const output = await runCommand(
      'terraform',
      args,
      resolvedDir,
      60_000,
      false,
    );
    const resources = output.trim().split(/\r?\n/).filter(Boolean);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            { success: true, count: resources.length, resources },
            null,
            2,
          ),
        },
      ],
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      content: [
        { type: 'text', text: `terraform state list failed:\n${errorMsg}` },
      ],
      isError: true,
    };
  }
}

// --- terraform_state_rm ---
export async function terraformStateRm(params: {
  dir: string;
  address: string;
  dryRun?: boolean;
  repoRoot: string;
}): Promise<TerraformStateResult> {
  let resolvedDir: string;
  try {
    resolvedDir = resolveDir(params.dir, params.repoRoot);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ success: false, error: errorMsg }),
        },
      ],
      isError: true,
    };
  }

  const addrErr = validateAddress(params.address);
  if (addrErr) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ success: false, error: addrErr }),
        },
      ],
      isError: true,
    };
  }

  const args = ['-chdir=' + resolvedDir, 'state', 'rm'];
  if (params.dryRun) args.push('-dry-run');
  args.push(params.address);

  try {
    const output = await runCommand(
      'terraform',
      args,
      resolvedDir,
      60_000,
      false,
    );
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              address: params.address,
              dryRun: params.dryRun ?? false,
              output: output || '(no output)',
            },
            null,
            2,
          ),
        },
      ],
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      content: [
        { type: 'text', text: `terraform state rm failed:\n${errorMsg}` },
      ],
      isError: true,
    };
  }
}

// --- terraform_state_mv_batch ---
export interface MvPair {
  from: string;
  to: string;
}

export interface MvBatchResult {
  from: string;
  to: string;
  success: boolean;
  output?: string;
  error?: string;
}

/** Default overall timeout for a batch of state mv operations (seconds). */
const MV_BATCH_TIMEOUT_SECONDS = 300;

export async function terraformStateMvBatch(params: {
  dir: string;
  moves: MvPair[];
  batchTimeoutSeconds?: number;
  repoRoot: string;
}): Promise<TerraformStateResult> {
  let resolvedDir: string;
  try {
    resolvedDir = resolveDir(params.dir, params.repoRoot);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ success: false, error: errorMsg }),
        },
      ],
      isError: true,
    };
  }

  if (params.moves.length === 0) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: 'moves array must not be empty',
          }),
        },
      ],
      isError: true,
    };
  }

  if (params.moves.length > 200) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: `Too many moves: ${params.moves.length} (max 200)`,
          }),
        },
      ],
      isError: true,
    };
  }

  // Validate all addresses upfront before touching state
  for (let i = 0; i < params.moves.length; i++) {
    const { from, to } = params.moves[i];
    const fromErr = validateAddress(from);
    if (fromErr) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: `moves[${i}].from: ${fromErr}`,
            }),
          },
        ],
        isError: true,
      };
    }
    const toErr = validateAddress(to);
    if (toErr) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: `moves[${i}].to: ${toErr}`,
            }),
          },
        ],
        isError: true,
      };
    }
  }

  const batchTimeoutMs =
    (params.batchTimeoutSeconds ?? MV_BATCH_TIMEOUT_SECONDS) * 1000;
  const batchStartMs = Date.now();

  const results: MvBatchResult[] = [];
  for (const { from, to } of params.moves) {
    const remainingMs = batchTimeoutMs - (Date.now() - batchStartMs);
    if (remainingMs <= 0) {
      results.push({
        from,
        to,
        success: false,
        error: `Batch timeout exceeded (${params.batchTimeoutSeconds ?? MV_BATCH_TIMEOUT_SECONDS}s) — skipped`,
      });
      continue;
    }

    try {
      const output = await runCommand(
        'terraform',
        ['-chdir=' + resolvedDir, 'state', 'mv', from, to],
        resolvedDir,
        Math.min(60_000, remainingMs),
        false,
      );
      results.push({
        from,
        to,
        success: true,
        output: output || '(no output)',
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      results.push({ from, to, success: false, error: errorMsg });
    }
  }

  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  if (failed > 0) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: false,
              summary: { total: results.length, succeeded, failed },
              results,
            },
            null,
            2,
          ),
        },
      ],
      isError: true,
    };
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            success: true,
            summary: { total: results.length, succeeded, failed },
            results,
          },
          null,
          2,
        ),
      },
    ],
  };
}
