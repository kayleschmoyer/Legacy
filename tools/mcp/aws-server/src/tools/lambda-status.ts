import { getRepoRoot, runCommand } from '../run-command.js';
import type { ToolResult } from '../types.js';

interface LambdaStatusParams {
  function: string;
  environment: string;
}

interface LambdaConfig {
  FunctionName?: string;
  Runtime?: string;
  State?: string;
  LastModified?: string;
  MemorySize?: number;
  Timeout?: number;
  Handler?: string;
  CodeSize?: number;
  Description?: string;
}

export async function lambdaStatus(
  params: LambdaStatusParams,
): Promise<ToolResult> {
  const repoRoot = getRepoRoot();
  // Normalize: strip trailing '-lambda' suffix to match deployed function names
  // (e.g. 'stats-lambda' → 'stats', matching the convention in logs-tail)
  const normalizedFunctionName = params.function.endsWith('-lambda')
    ? params.function.slice(0, -'-lambda'.length)
    : params.function;
  const fullName = `legacy-sports-${params.environment}-${normalizedFunctionName}`;

  try {
    const output = await runCommand(
      'aws',
      [
        'lambda',
        'get-function-configuration',
        '--function-name',
        fullName,
        '--output',
        'json',
      ],
      repoRoot,
    );

    const config = JSON.parse(output) as LambdaConfig;

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            exists: true,
            functionName: config.FunctionName,
            state: config.State ?? 'Active',
            runtime: config.Runtime,
            lastModified: config.LastModified,
            memorySize: config.MemorySize,
            timeout: config.Timeout,
            handler: config.Handler,
            codeSize: config.CodeSize,
            description: config.Description || null,
          }),
        },
      ],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    if (/ResourceNotFoundException|Function not found/i.test(message)) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              exists: false,
              functionName: fullName,
              error: `Lambda function "${fullName}" does not exist.`,
            }),
          },
        ],
      };
    }

    const isSsoError =
      /sso session.*expired|sso.*expired|credentials.*expired|InvalidClientTokenId|ExpiredToken/i.test(
        message,
      );

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            functionName: fullName,
            error: message,
            remedy: isSsoError
              ? 'Run `aws sso login` to re-authenticate, then retry.'
              : undefined,
          }),
        },
      ],
      isError: true,
    };
  }
}
