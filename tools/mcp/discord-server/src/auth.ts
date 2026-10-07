// Discord bot-token and channel configuration.
//
// The server reads ONE channel, fixed at deploy time. The channel id is
// Lambda configuration, never a tool argument, so a prompt-injected agent
// cannot point this server at a different channel.
//
// Token sources (resolution order, first non-empty wins):
//   1. `DISCORD_BOT_TOKEN` env var — direct value injection (unit tests and
//      manual override only; the hosted Lambda does not set it).
//   2. AWS Secrets Manager secret named by `DISCORD_BOT_TOKEN_SECRET_NAME` —
//      the hosted Lambda path. The Lambda role is granted
//      `secretsmanager:GetSecretValue` on this one secret only.
//
// The fetched value is cached across warm Lambda invocations so later tool
// calls do not re-hit Secrets Manager.

import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';

/** Environment variable holding the bot token directly (tests/override). */
export const DISCORD_BOT_TOKEN_ENV = 'DISCORD_BOT_TOKEN';

/** Environment variable naming the Secrets Manager secret holding the token. */
export const DISCORD_BOT_TOKEN_SECRET_NAME_ENV =
  'DISCORD_BOT_TOKEN_SECRET_NAME';

/** Environment variable holding the single channel id this server may read. */
export const DISCORD_BUG_CHANNEL_ID_ENV = 'DISCORD_BUG_CHANNEL_ID';

/** A Discord snowflake id: a 64-bit integer rendered as 15-25 decimal digits. */
export const SNOWFLAKE_PATTERN = /^\d{15,25}$/;

let cachedToken: string | null = null;
let secretsClient: SecretsManagerClient | null = null;

function getSecretsClient(): SecretsManagerClient {
  if (!secretsClient) secretsClient = new SecretsManagerClient({});
  return secretsClient;
}

async function fetchTokenFromSecretsManager(
  secretName: string,
): Promise<string> {
  const result = await getSecretsClient().send(
    new GetSecretValueCommand({ SecretId: secretName }),
  );
  const raw = result.SecretString?.trim();
  if (!raw) {
    throw new Error(
      `Secrets Manager secret "${secretName}" has an empty SecretString — ` +
        'populate it with the Discord bot token.',
    );
  }
  return raw;
}

/**
 * Resolve the Discord bot token. Returns the cached value on warm invocations;
 * otherwise checks the env var, then Secrets Manager. Throws with an
 * actionable message if neither source is configured.
 */
export async function getDiscordToken(): Promise<string> {
  if (cachedToken) return cachedToken;

  const envToken = process.env[DISCORD_BOT_TOKEN_ENV];
  if (envToken && envToken.length > 0) {
    cachedToken = envToken;
    return cachedToken;
  }

  const secretName = process.env[DISCORD_BOT_TOKEN_SECRET_NAME_ENV];
  if (secretName && secretName.length > 0) {
    cachedToken = await fetchTokenFromSecretsManager(secretName);
    return cachedToken;
  }

  throw new Error(
    `No Discord bot token found. Set ${DISCORD_BOT_TOKEN_ENV} in the environment ` +
      `or set ${DISCORD_BOT_TOKEN_SECRET_NAME_ENV} to a Secrets Manager secret holding the bot token.`,
  );
}

/** Non-throwing variant of {@link getDiscordToken}. */
export async function tryGetDiscordToken(): Promise<string | null> {
  try {
    return await getDiscordToken();
  } catch {
    return null;
  }
}

/**
 * Return the one channel id this server is allowed to read. Throws when it is
 * missing or is not a snowflake — which also keeps anything path-shaped out of
 * the request URL.
 */
export function getChannelId(): string {
  const channelId = process.env[DISCORD_BUG_CHANNEL_ID_ENV]?.trim();
  if (!channelId || !SNOWFLAKE_PATTERN.test(channelId)) {
    throw new Error(
      `${DISCORD_BUG_CHANNEL_ID_ENV} must be set to the numeric id of the one Discord channel this server reads.`,
    );
  }
  return channelId;
}

/** Non-throwing variant of {@link getChannelId}. */
export function tryGetChannelId(): string | null {
  try {
    return getChannelId();
  } catch {
    return null;
  }
}

/** Test helper: drop the cached token so a subsequent resolve re-fetches. */
export function _resetDiscordTokenCacheForTests(): void {
  cachedToken = null;
}
