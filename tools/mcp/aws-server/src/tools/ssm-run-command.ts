import { getRepoRoot, runCommand } from '../run-command.js';
import type { ToolResult } from '../types.js';

const SSO_ERROR_PATTERN =
  /sso session.*expired|sso.*expired|credentials.*expired|InvalidClientTokenId|ExpiredToken/i;

function ssoRemedy(): string {
  return 'Run `aws sso login` to re-authenticate, then retry.';
}

export interface SsmRunCommandParams {
  instanceId: string;
  commands: string[];
  timeout?: number;
}

interface SendCommandOutput {
  Command?: {
    CommandId?: string;
  };
}

interface GetCommandInvocationOutput {
  Status?: string;
  StatusDetails?: string;
  StandardOutputContent?: string;
  StandardErrorContent?: string;
  ResponseCode?: number;
}

const INSTANCE_ID_RE = /^i-[0-9a-f]{17}$/;

export async function ssmRunCommand(
  params: SsmRunCommandParams,
): Promise<ToolResult> {
  const repoRoot = getRepoRoot();
  const { instanceId, commands, timeout = 60 } = params;

  if (!INSTANCE_ID_RE.test(instanceId)) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            error: `Invalid instanceId "${instanceId}": must match i-[0-9a-f]{17} (exactly 17 hex chars).`,
          }),
        },
      ],
      isError: true,
    };
  }

  if (!commands || commands.length === 0) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            error: 'commands array must be non-empty.',
          }),
        },
      ],
      isError: true,
    };
  }

  // Reject blank commands before any further validation.
  const blankCommand = commands.find((cmd) => cmd.trim().length === 0);
  if (blankCommand !== undefined) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            error: 'Each command must be a non-blank string.',
          }),
        },
      ],
      isError: true,
    };
  }

  // Validate commands for shell metacharacters to prevent injection.
  // Newlines and quotes are also blocked to prevent shell injection since
  // runCommand executes with shell: true when passing --parameters to the AWS CLI.
  const SHELL_METACHAR_RE = /[\n\r"'`$;&|<>(){}\\]/;
  const badCommand = commands.find((cmd) => SHELL_METACHAR_RE.test(cmd));
  if (badCommand !== undefined) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            error: `Command contains disallowed characters: ${JSON.stringify(badCommand)}. Use simple executables with arguments only — no shell operators, quotes, newlines, or variable expansions.`,
          }),
        },
      ],
      isError: true,
    };
  }

  // Validate timeout range
  const effectiveTimeout = Math.max(10, Math.min(timeout, 3600));

  // Build the --parameters argument as raw JSON.
  // This value is passed as a single argv entry, so shell-style quoting must
  // not be embedded in the string itself.
  const parametersJson = JSON.stringify({ commands });

  const sendArgs = [
    'ssm',
    'send-command',
    '--instance-ids',
    instanceId,
    '--document-name',
    'AWS-RunShellScript',
    '--parameters',
    parametersJson,
    '--timeout-seconds',
    String(effectiveTimeout),
    '--output',
    'json',
  ];

  let commandId: string;
  try {
    const sendOutput = await runCommand('aws', sendArgs, repoRoot);
    const sendData = JSON.parse(sendOutput) as SendCommandOutput;
    commandId = sendData.Command?.CommandId ?? '';
    if (!commandId) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              ok: false,
              error: 'SSM send-command did not return a CommandId.',
            }),
          },
        ],
        isError: true,
      };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            error: message,
            remedy: SSO_ERROR_PATTERN.test(message)
              ? ssoRemedy()
              : message.includes('InvalidInstanceId')
                ? 'The instance may not have the SSM agent running or the IAM role lacks AmazonSSMManagedInstanceCore permissions.'
                : undefined,
          }),
        },
      ],
      isError: true,
    };
  }

  // Poll for command completion
  const pollArgs = [
    'ssm',
    'get-command-invocation',
    '--command-id',
    commandId,
    '--instance-id',
    instanceId,
    '--output',
    'json',
  ];

  const maxWaitMs = (effectiveTimeout + 30) * 1000; // allow extra time beyond command timeout
  const pollIntervalMs = 5_000;
  const startTime = Date.now();

  while (true) {
    const elapsed = Date.now() - startTime;
    if (elapsed > maxWaitMs) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              ok: false,
              commandId,
              error: `Timed out polling for command ${commandId} after ${Math.round(elapsed / 1000)}s.`,
            }),
          },
        ],
        isError: true,
      };
    }

    try {
      const invocationOutput = await runCommand('aws', pollArgs, repoRoot);
      const invocationData = JSON.parse(
        invocationOutput,
      ) as GetCommandInvocationOutput;
      const status = invocationData.Status ?? '';

      if (
        [
          'Success',
          'Failed',
          'Cancelled',
          'TimedOut',
          'Undeliverable',
          'Terminated',
        ].includes(status)
      ) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  ok: status === 'Success',
                  commandId,
                  instanceId,
                  status,
                  statusDetails: invocationData.StatusDetails ?? null,
                  exitCode: invocationData.ResponseCode ?? null,
                  stdout: invocationData.StandardOutputContent?.trim() ?? '',
                  stderr: invocationData.StandardErrorContent?.trim() ?? '',
                },
                null,
                2,
              ),
            },
          ],
          isError: status !== 'Success',
        };
      }

      // Still running — wait and poll again
      await new Promise((r) => setTimeout(r, pollIntervalMs));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // InvocationDoesNotExist means command hasn't propagated yet — retry
      if (message.includes('InvocationDoesNotExist')) {
        await new Promise((r) => setTimeout(r, pollIntervalMs));
        continue;
      }
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              ok: false,
              commandId,
              error: message,
              remedy: SSO_ERROR_PATTERN.test(message) ? ssoRemedy() : undefined,
            }),
          },
        ],
        isError: true,
      };
    }
  }
}
