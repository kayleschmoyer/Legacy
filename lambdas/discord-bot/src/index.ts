/**
 * Discord Bot Lambda — handles Discord slash command interactions.
 *
 * Endpoint: POST /discord-bot (via API Gateway)
 * Discord sends interaction payloads here when users invoke slash commands.
 *
 * Commands:
 *   /jira <summary> [type] [description]
 *     Creates a Jira ticket and responds with the ticket link.
 *
 * (LS-1673: Discord bot integration to create Jira tickets from Discord)
 */

import type { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda';
import { LOGGER } from '@legacy-sports/logging';
import { retrieveSecretParameterValue } from '@legacy-sports/aws-utils';
import {
  getRollbarConfigFromEnv,
  initRollbar,
  withRollbar,
} from '@legacy-sports/rollbar';
import { webcrypto } from 'crypto';

// Initialize Rollbar
const rollbarConfig = getRollbarConfigFromEnv();
if (rollbarConfig) {
  initRollbar(rollbarConfig);
}

// ── Discord Interaction Types ────────────────────────────────────────────────

const INTERACTION_TYPE_PING = 1;
const INTERACTION_TYPE_APPLICATION_COMMAND = 2;

const RESPONSE_TYPE_PONG = 1;
const RESPONSE_TYPE_CHANNEL_MESSAGE = 4;
const RESPONSE_TYPE_DEFERRED_CHANNEL_MESSAGE = 5;

/** Maximum age (in seconds) for a Discord interaction timestamp before it is rejected as stale. */
const MAX_TIMESTAMP_AGE_SECONDS = 300; // 5 minutes

interface DiscordInteraction {
  type: number;
  id: string;
  application_id: string;
  token: string;
  data?: {
    name: string;
    options?: Array<{
      name: string;
      type: number;
      value: string | number;
    }>;
  };
  member?: { user?: { username?: string } };
  user?: { username?: string };
}

// ── Secret Caching ──────────────────────────────────────────────────────────

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name}`);
  return value;
}

const DISCORD_PUBLIC_KEY = requireEnv('DISCORD_BOT_PUBLIC_KEY');
const JIRA_SECRET_NAME = requireEnv('JIRA_CREDENTIALS_SECRET_NAME');
const JIRA_PROJECT_KEY = process.env['JIRA_PROJECT_KEY'] ?? 'LS';

let jiraCredsPromise: Promise<{
  email: string;
  api_token: string;
  base_url: string;
}> | null = null;

function getJiraCreds() {
  if (!jiraCredsPromise) {
    jiraCredsPromise = retrieveSecretParameterValue(JIRA_SECRET_NAME).then(
      (raw) =>
        JSON.parse(raw) as {
          email: string;
          api_token: string;
          base_url: string;
        },
    );
  }
  return jiraCredsPromise;
}

// ── Discord Signature Verification ──────────────────────────────────────────

async function verifyDiscordSignature(
  body: string,
  signature: string,
  timestamp: string,
): Promise<boolean> {
  try {
    const publicKeyBytes = hexToUint8Array(DISCORD_PUBLIC_KEY);
    const signatureBytes = hexToUint8Array(signature);
    const message = new TextEncoder().encode(timestamp + body);

    const key = await webcrypto.subtle.importKey(
      'raw',
      publicKeyBytes,
      { name: 'Ed25519' },
      false,
      ['verify'],
    );

    return await webcrypto.subtle.verify(
      'Ed25519',
      key,
      signatureBytes,
      message,
    );
  } catch (err) {
    LOGGER.warn('Discord signature verification error', {
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

function hexToUint8Array(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

// ── Jira API ────────────────────────────────────────────────────────────────

async function createJiraTicket(
  summary: string,
  issueType: string,
  description: string,
): Promise<{ key: string; url: string }> {
  const creds = await getJiraCreds();
  const auth = Buffer.from(`${creds.email}:${creds.api_token}`).toString(
    'base64',
  );

  const body = {
    fields: {
      project: { key: JIRA_PROJECT_KEY },
      summary,
      issuetype: { name: issueType },
      ...(description
        ? {
            description: {
              type: 'doc',
              version: 1,
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: description }],
                },
              ],
            },
          }
        : {}),
    },
  };

  const response = await fetch(`${creds.base_url}/rest/api/3/issue`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Jira API error ${response.status}: ${text}`);
  }

  const result = (await response.json()) as { key: string };
  return {
    key: result.key,
    url: `${creds.base_url}/browse/${result.key}`,
  };
}

// ── Discord Follow-up ────────────────────────────────────────────────────────

const DISCORD_API = 'https://discord.com/api/v10';

async function sendFollowup(
  applicationId: string,
  interactionToken: string,
  content: string,
  ephemeral = false,
): Promise<void> {
  const url = `${DISCORD_API}/webhooks/${applicationId}/${interactionToken}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content,
      ...(ephemeral ? { flags: 64 } : {}),
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    LOGGER.warn('Failed to send Discord follow-up', {
      status: response.status,
      body: text,
    });
  }
}

// ── Interaction Handler ─────────────────────────────────────────────────────

function jsonResponse(
  statusCode: number,
  body: Record<string, unknown>,
): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function handleInteraction(
  interaction: DiscordInteraction,
): APIGatewayProxyResult {
  // PING — required for Discord endpoint validation
  if (interaction.type === INTERACTION_TYPE_PING) {
    return jsonResponse(200, { type: RESPONSE_TYPE_PONG });
  }

  // Application command (slash command)
  if (
    interaction.type === INTERACTION_TYPE_APPLICATION_COMMAND &&
    interaction.data?.name === 'jira'
  ) {
    const options = interaction.data.options ?? [];
    const summary =
      (options.find((o) => o.name === 'summary')?.value as string) ?? '';
    const issueType =
      (options.find((o) => o.name === 'type')?.value as string) ?? 'Task';
    const description =
      (options.find((o) => o.name === 'description')?.value as string) ?? '';
    const username =
      interaction.member?.user?.username ??
      interaction.user?.username ??
      'unknown';

    if (!summary) {
      return jsonResponse(200, {
        type: RESPONSE_TYPE_CHANNEL_MESSAGE,
        data: {
          content: 'Please provide a summary for the Jira ticket.',
          flags: 64, // Ephemeral
        },
      });
    }

    // Respond with a deferred message first, then follow up after Jira call completes.
    // This avoids Discord's 3-second interaction response timeout.
    const deferredResponse = jsonResponse(200, {
      type: RESPONSE_TYPE_DEFERRED_CHANNEL_MESSAGE,
    });

    // Fire-and-forget: create ticket and send follow-up via webhook
    void (async () => {
      try {
        const ticket = await createJiraTicket(
          summary,
          issueType,
          description || `Filed from Discord by @${username}`,
        );

        LOGGER.info('Jira ticket created from Discord', {
          key: ticket.key,
          username,
          issueType,
        });

        await sendFollowup(
          interaction.application_id,
          interaction.token,
          `Created **${ticket.key}**: ${summary}\n${ticket.url}`,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        LOGGER.error('Failed to create Jira ticket from Discord', {
          error: msg,
          username,
        });

        await sendFollowup(
          interaction.application_id,
          interaction.token,
          'Something went wrong creating the Jira ticket. Please try again or contact an admin.',
          true,
        );
      }
    })();

    return deferredResponse;
  }

  return jsonResponse(200, {
    type: RESPONSE_TYPE_CHANNEL_MESSAGE,
    data: {
      content: 'Unknown command.',
      flags: 64,
    },
  });
}

// ── Lambda Handler ──────────────────────────────────────────────────────────

export const baseHandler = async (
  event: APIGatewayEvent,
): Promise<APIGatewayProxyResult> => {
  // Health check
  if (event.httpMethod === 'GET') {
    return jsonResponse(200, { status: 'ok', service: 'discord-bot' });
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  const body = event.isBase64Encoded
    ? Buffer.from(event.body ?? '', 'base64').toString('utf-8')
    : (event.body ?? '');

  const signature =
    event.headers['x-signature-ed25519'] ??
    event.headers['X-Signature-Ed25519'] ??
    '';
  const timestamp =
    event.headers['x-signature-timestamp'] ??
    event.headers['X-Signature-Timestamp'] ??
    '';

  // Verify Discord signature
  const isValid = await verifyDiscordSignature(body, signature, timestamp);
  if (!isValid) {
    LOGGER.warn('Discord signature verification failed');
    return jsonResponse(401, { error: 'Invalid request signature' });
  }

  // Reject stale timestamps to prevent replay attacks
  const timestampSeconds = Number(timestamp);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - timestampSeconds) > MAX_TIMESTAMP_AGE_SECONDS) {
    LOGGER.warn('Discord interaction timestamp too old', {
      timestamp,
      age: Math.abs(nowSeconds - timestampSeconds),
    });
    return jsonResponse(401, { error: 'Interaction expired' });
  }

  const interaction = JSON.parse(body) as DiscordInteraction;
  return handleInteraction(interaction);
};

export const handler = withRollbar(baseHandler);
