import type { ToolResult } from './types.js';

export const SSO_ERROR_PATTERN =
  /sso session.*expired|sso.*expired|credentials.*expired|InvalidClientTokenId|ExpiredToken/i;

export function ssoRemedy(): string {
  return 'Run `aws sso login` to re-authenticate, then retry.';
}

/** Matches the actionable ENOENT message `runCommand` rewrites (LS-9537). */
export const CLI_NOT_FOUND_PATTERN = /CLI not found \(spawn \S+ ENOENT\)/;

export function cliNotFoundRemedy(): string {
  return (
    'The AWS/Terraform CLI is not installed in this environment (expected in Claude Code ' +
    'Remote sessions). Run this from a local/dev environment with the CLI configured, or use ' +
    'an alternative verification method (e.g. Terraform apply output, GitHub Actions logs).'
  );
}

export function errorResult(context: string, message: string): ToolResult {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          ok: false,
          error: `${context}: ${message}`,
          remedy: SSO_ERROR_PATTERN.test(message)
            ? ssoRemedy()
            : CLI_NOT_FOUND_PATTERN.test(message)
              ? cliNotFoundRemedy()
              : undefined,
        }),
      },
    ],
    isError: true,
  };
}
