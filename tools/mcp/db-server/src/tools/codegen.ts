import { getRepoRoot, runPnpm } from '../run-command.js';
import type { ToolResult } from '../types.js';

interface CodegenParams {
  worktreePath?: string;
  printSchemaFirst?: boolean;
  base?: string;
  skipNxCache?: boolean;
}

interface CodegenResult {
  success: boolean;
  ranPrintSchema: boolean;
  output: string;
}

const SAFE_GIT_REF = /^[\w.\-\/]+$/;

const CODEGEN_TIMEOUT_MS = 10 * 60_000;

export async function codegen(params: CodegenParams): Promise<ToolResult> {
  const repoRoot = params.worktreePath || getRepoRoot();
  const shouldPrintSchema = params.printSchemaFirst ?? false;
  const runOutput: string[] = [];

  try {
    if (shouldPrintSchema) {
      const schemaOutput = await runPnpm(
        ['exec', 'nx', 'run', 'db:print-schema'],
        repoRoot,
        CODEGEN_TIMEOUT_MS,
      );
      runOutput.push(`=== db:print-schema ===\n${schemaOutput}`);
    }

    const args = ['exec', 'nx', 'affected', '-t', 'codegen'];
    if (params.base && params.base.trim().length > 0) {
      const base = params.base.trim();
      if (!SAFE_GIT_REF.test(base)) {
        return {
          content: [
            {
              type: 'text',
              text: `Invalid base ref: "${base}". Must match [\\w.\\-\\/]+.`,
            },
          ],
          isError: true,
        };
      }
      args.push(`--base=${base}`);
    }
    if (params.skipNxCache) {
      args.push('--skip-nx-cache');
    }

    const codegenOutput = await runPnpm(args, repoRoot, CODEGEN_TIMEOUT_MS);
    runOutput.push(`=== nx affected -t codegen ===\n${codegenOutput}`);

    const result: CodegenResult = {
      success: true,
      ranPrintSchema: shouldPrintSchema,
      output: runOutput.join('\n\n'),
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Failed to run codegen: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}
