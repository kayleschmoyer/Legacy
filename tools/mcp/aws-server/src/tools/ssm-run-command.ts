import { minifiedJson } from '@legacy-sports/mcp-format';
import { getRepoRoot, runCommand } from '../run-command.js';
import type { ToolResult } from '../types.js';

const SSO_ERROR_PATTERN =
  /sso session.*expired|sso.*expired|credentials.*expired|InvalidClientTokenId|ExpiredToken/i;

function ssoRemedy(): string {
  return 'Run `aws sso login` to re-authenticate, then retry.';
}

// Hard per-call ceiling: cloud sessions kill any MCP call at ~60s (transport
// timeout). Longer waits are re-armed by the caller re-invoking this tool with
// the returned commandId (mirrors ci_wait_run in tools/mcp/ci-server).
const MAX_WAIT_SECONDS = 55;

export interface SsmRunCommandParams {
  instanceId: string;
  commands?: string[];
  commandId?: string;
  timeout?: number;
  maxWaitSeconds?: number;
}

export function ssmRearmHint(instanceId: string, commandId: string): string {
  return (
    `Command is still running. Call aws_ssm_run_command({ instanceId: "${instanceId}", commandId: "${commandId}" }) ` +
    `to continue waiting (each call polls up to ${MAX_WAIT_SECONDS}s and returns a status snapshot — never an ` +
    'error while the command is in progress). Do NOT re-send the command.'
  );
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
  const { instanceId, commands = [], timeout = 60 } = params;

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

  // Validate timeout range
  const effectiveTimeout = Math.max(10, Math.min(timeout, 3600));

  let commandId: string;
  if (params.commandId) {
    // Re-arm mode: re-attach to an in-flight command and continue polling.
    commandId = params.commandId;
  } else {
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

    // Validate commands for shell metacharacters to prevent injection, at the
    // interpolation boundary: `commands` is the only user-controlled value that
    // reaches `aws ssm send-command --parameters` below (there is no --comment
    // argument), and runCommand executes with shell: true. Newlines and quotes
    // are blocked alongside shell operators.
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
  }

  // Poll for command completion — bounded per call. If the command is still
  // running at the deadline, return an in-progress snapshot (not an error)
  // with a re-arm hint so the caller re-invokes with commandId instead of
  // losing an in-flight long-poll to the MCP transport timeout.
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

  const maxWaitSeconds = Math.min(
    params.maxWaitSeconds ?? MAX_WAIT_SECONDS,
    MAX_WAIT_SECONDS,
  );
  const deadlineMs = Date.now() + maxWaitSeconds * 1000;
  const pollIntervalMs = 5_000;

  while (true) {
    let lastStatus = 'InProgress';
    try {
      const invocationOutput = await runCommand('aws', pollArgs, repoRoot);
      const invocationData = JSON.parse(
        invocationOutput,
      ) as GetCommandInvocationOutput;
      const status = invocationData.Status ?? '';
      lastStatus = status || 'InProgress';

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
              text: minifiedJson({
                ok: status === 'Success',
                commandId,
                instanceId,
                status,
                statusDetails: invocationData.StatusDetails ?? null,
                exitCode: invocationData.ResponseCode ?? null,
                stdout: invocationData.StandardOutputContent?.trim() ?? '',
                stderr: invocationData.StandardErrorContent?.trim() ?? '',
              }),
            },
          ],
          isError: status !== 'Success',
        };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // InvocationDoesNotExist means command hasn't propagated yet — retry
      if (message.includes('InvocationDoesNotExist')) {
        lastStatus = 'Pending';
      } else {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                ok: false,
                commandId,
                error: message,
                remedy: SSO_ERROR_PATTERN.test(message)
                  ? ssoRemedy()
                  : undefined,
              }),
            },
          ],
          isError: true,
        };
      }
    }

    // Still running — snapshot instead of sleeping past the per-call budget.
    if (Date.now() + pollIntervalMs >= deadlineMs) {
      return {
        content: [
          {
            type: 'text',
            text: minifiedJson({
              ok: true,
              commandId,
              instanceId,
              status: lastStatus,
              hint: ssmRearmHint(instanceId, commandId),
            }),
          },
        ],
      };
    }
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
}
