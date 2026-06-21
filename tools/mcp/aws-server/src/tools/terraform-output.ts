import { join, relative, resolve } from 'node:path';
import { minifiedJson } from '@legacy-sports/mcp-format';
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

/**
 * Terraform output identifiers are `[a-zA-Z0-9_-]`. Although requested `keys`
 * are only used for in-JS filtering here (never passed to the CLI), validate
 * them at the trust boundary so a metacharacter-bearing name can never reach a
 * `shell: true` command path if this tool is later extended.
 */
const SAFE_TF_OUTPUT_NAME_RE = /^[A-Za-z0-9_-]+$/;

export async function terraformOutput(
  params: TerraformOutputParams,
): Promise<ToolResult> {
  const repoRoot = getRepoRoot();

  const invalidKey = params.keys?.find((k) => !SAFE_TF_OUTPUT_NAME_RE.test(k));
  if (invalidKey !== undefined) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            error: `Invalid output name "${invalidKey}": Terraform output names may only contain letters, digits, underscores, and hyphens.`,
          }),
        },
      ],
      isError: true,
    };
  }

  // Reject absolute paths and validate that the resolved directory stays
  // within the repo root to prevent path traversal attacks.
  // Default to terraform/main since most outputs (vpc_id, lambda ARNs, RDS endpoint,
  // etc.) live there. Pass chdir: 'terraform/runners' for runner-specific outputs
  // (github_runners_webhook_url).
  const chdir = params.chdir ?? 'terraform/main';
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

    // Heterogeneous map of Terraform output values -> minified JSON. The
    // response is a bare `{ outputName: value }` map (keys come from Terraform
    // state, filtered in JS above — never passed to the CLI), so no `ok`
    // envelope is added: an `ok` key would collide with a real output named
    // `ok`. Success is signalled by the absence of `isError` on the ToolResult.
    return {
      content: [
        {
          type: 'text',
          text: minifiedJson(result),
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
