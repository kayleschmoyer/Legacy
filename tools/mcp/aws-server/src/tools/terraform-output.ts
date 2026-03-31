import { join, relative, resolve } from 'node:path';
import { getRepoRoot, runCommand } from '../run-command.js';
import type { ToolResult } from '../types.js';

interface TerraformOutputParams {
  keys?: string[];
  chdir?: string;
}

/** Shape of a single Terraform output value in the JSON output. */
interface TerraformOutputValue {
  value: unknown;
  type: unknown;
  sensitive?: boolean;
}

type TerraformOutputMap = Record<string, TerraformOutputValue>;

export async function terraformOutput(
  params: TerraformOutputParams,
): Promise<ToolResult> {
  const repoRoot = getRepoRoot();

  // Reject absolute paths and validate that the resolved directory stays
  // within the repo root to prevent path traversal attacks.
  const chdir = params.chdir ?? 'terraform';
  if (chdir.startsWith('/') || chdir.startsWith('\\')) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            error: 'chdir must be a relative path, not an absolute path.',
          }),
        },
      ],
      isError: true,
    };
  }
  const tfDir = resolve(join(repoRoot, chdir));
  // Use path.relative() for a separator-agnostic containment check (works on
  // both POSIX and Windows). If the resolved path escapes the repo root,
  // relative() will start with '..'.
  const rel = relative(repoRoot, tfDir);
  if (rel.startsWith('..')) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            error: 'chdir must resolve within the repository root.',
          }),
        },
      ],
      isError: true,
    };
  }

  try {
    const raw = await runCommand('terraform', ['output', '-json'], tfDir);
    const parsed = JSON.parse(raw) as TerraformOutputMap;

    // Unwrap the {value, type, sensitive} envelope
    const unwrapped: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(parsed)) {
      unwrapped[key] = entry.sensitive ? '***SENSITIVE***' : entry.value;
    }

    // Filter to requested keys if provided, omitting missing keys rather than
    // returning null (which is ambiguous with a legitimately null Terraform output).
    const result: Record<string, unknown> =
      params.keys && params.keys.length > 0
        ? Object.fromEntries(
            params.keys
              .filter((k) => k in unwrapped)
              .map((k) => [k, unwrapped[k]]),
          )
        : unwrapped;

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isSsoError =
      /sso session.*expired|sso.*expired|credentials.*expired|InvalidClientTokenId|ExpiredToken/i.test(
        message,
      );
    const isNotInit =
      /terraform.*not.*init|no state|The directory.*has not been initialized/i.test(
        message,
      );

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            chdir: tfDir,
            error: message,
            remedy: isSsoError
              ? 'Run `aws sso login` to re-authenticate, then retry.'
              : isNotInit
                ? 'Run `terraform init` in the terraform directory first.'
                : undefined,
          }),
        },
      ],
      isError: true,
    };
  }
}
