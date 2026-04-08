import { getRepoRoot, runCommand } from '../run-command.js';
import type { ToolResult } from '../types.js';

/** Allowed characters in an AWS profile name. */
const SAFE_PROFILE_RE = /^[A-Za-z0-9._-]+$/;

/** aws sso login requires user interaction — allow up to 5 minutes. */
const SSO_LOGIN_TIMEOUT = 300_000;

interface SsoLoginParams {
  profile?: string;
}

export async function ssoLogin(params: SsoLoginParams): Promise<ToolResult> {
  const repoRoot = getRepoRoot();
  const profile = params.profile ?? process.env.AWS_PROFILE ?? 'default';

  if (!SAFE_PROFILE_RE.test(profile)) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            error:
              'Invalid profile name: only letters, digits, dots, underscores, and hyphens are allowed.',
          }),
        },
      ],
      isError: true,
    };
  }

  // aws sso login --no-browser outputs the device auth URL to stdout
  // so the user can authenticate in their browser without blocking the terminal.
  const args = ['sso', 'login', '--profile', profile, '--no-browser'];

  try {
    const output = await runCommand(
      'aws',
      args,
      repoRoot,
      {},
      SSO_LOGIN_TIMEOUT,
    );
    // Extract the URL if present in output
    const urlMatch = output.match(
      /https:\/\/device\.sso\.[^\s]+|https:\/\/[^\s]*sso[^\s]*/i,
    );
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: true,
            profile,
            output: output.trim(),
            deviceAuthUrl: urlMatch?.[0] ?? null,
            note: urlMatch
              ? 'Visit the deviceAuthUrl in your browser to complete SSO login, then call aws_sso_status to verify.'
              : 'SSO login initiated. Complete authentication in your browser, then call aws_sso_status to verify.',
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
            profile,
            error: message,
            remedy:
              'Ensure AWS SSO is configured: `aws configure sso`. Check that the profile exists in ~/.aws/config.',
          }),
        },
      ],
      isError: true,
    };
  }
}
