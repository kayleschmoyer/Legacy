import type { ToolResult } from './types.js';

export const SSO_ERROR_PATTERN =
  /sso session.*expired|sso.*expired|credentials.*expired|InvalidClientTokenId|ExpiredToken/i;

export function ssoRemedy(): string {
  return 'Run `aws sso login` to re-authenticate, then retry.';
}

export function errorResult(context: string, message: string): ToolResult {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          ok: false,
          error: `${context}: ${message}`,
          remedy: SSO_ERROR_PATTERN.test(message) ? ssoRemedy() : undefined,
        }),
      },
    ],
    isError: true,
  };
}
