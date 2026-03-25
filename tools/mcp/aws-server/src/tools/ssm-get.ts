import { getRepoRoot, runCommand } from '../run-command.js';
import type { ToolResult } from '../types.js';

interface SsmGetParams {
  name: string;
  environment: string;
  decrypt?: boolean;
}

interface SsmParameter {
  Name?: string;
  Value?: string;
  Type?: string;
  LastModifiedDate?: string;
  Version?: number;
}

interface SsmParameterList {
  Parameters?: SsmParameter[];
}

export async function ssmGet(params: SsmGetParams): Promise<ToolResult> {
  const repoRoot = getRepoRoot();

  // If the name starts with '/' treat as absolute path, otherwise build a conventional path
  const paramPath = params.name.startsWith('/')
    ? params.name
    : `/legacy-sports/${params.environment}/${params.name}`;

  const decryptArgs = params.decrypt ? ['--with-decryption'] : [];

  // Try exact parameter first, then fall back to path prefix
  try {
    const output = await runCommand(
      'aws',
      [
        'ssm',
        'get-parameter',
        '--name',
        paramPath,
        ...decryptArgs,
        '--output',
        'json',
      ],
      repoRoot,
    );

    const data = JSON.parse(output) as { Parameter?: SsmParameter };
    const p = data.Parameter;

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            found: true,
            mode: 'exact',
            parameter: {
              name: p?.Name,
              value:
                p?.Type === 'SecureString' && !params.decrypt
                  ? '***REDACTED***'
                  : p?.Value,
              type: p?.Type,
              lastModified: p?.LastModifiedDate,
              version: p?.Version,
            },
          }),
        },
      ],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isNotFoundOrValidation =
      /ParameterNotFound/i.test(message) || /parameter name/i.test(message);

    if (!isNotFoundOrValidation) {
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
              path: paramPath,
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
    // Exact match failed with a "not found" or validation error — try as a path prefix
  }

  try {
    const output = await runCommand(
      'aws',
      [
        'ssm',
        'get-parameters-by-path',
        '--path',
        paramPath,
        '--recursive',
        ...decryptArgs,
        '--output',
        'json',
      ],
      repoRoot,
    );

    const data = JSON.parse(output) as SsmParameterList;
    const parameters = (data.Parameters ?? []).map((p) => ({
      name: p.Name,
      value:
        p.Type === 'SecureString' && !params.decrypt
          ? '***REDACTED***'
          : p.Value,
      type: p.Type,
      lastModified: p.LastModifiedDate,
      version: p.Version,
    }));

    if (parameters.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              found: false,
              path: paramPath,
              error: `No SSM parameters found at path "${paramPath}".`,
            }),
          },
        ],
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            found: true,
            mode: 'prefix',
            path: paramPath,
            count: parameters.length,
            parameters,
          }),
        },
      ],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
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
            path: paramPath,
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
