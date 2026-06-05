import { LOGGER } from '@legacy-sports/logging';
import { readSecret } from '@legacy-sports/aws-utils';

/**
 * Cached promise for the new-user signup Discord webhook URL. Resolved on
 * first use and reused for subsequent invocations of the same warm Lambda
 * container. If the fetch rejects, the cache is cleared so the next caller
 * retries (transient Secrets Manager / IAM failures should not permanently
 * poison the container).
 */
let webhookUrlPromise: Promise<string> | null = null;

function getWebhookUrl(): Promise<string> {
  if (!webhookUrlPromise) {
    // Treat an empty-string local env var as "unset" so a blank value in the
    // environment doesn't short-circuit the Secrets Manager fallback.
    const localWebhookUrl = process.env['DISCORD_USER_SIGNUP_WEBHOOK_URL'];
    const pending = readSecret({
      localEnvVar: localWebhookUrl
        ? 'DISCORD_USER_SIGNUP_WEBHOOK_URL'
        : undefined,
      secretPathEnvVar: 'DISCORD_USER_SIGNUP_WEBHOOK_URL_SECRET_NAME',
    });
    pending.catch(() => {
      if (webhookUrlPromise === pending) {
        webhookUrlPromise = null;
      }
    });
    webhookUrlPromise = pending;
  }
  return webhookUrlPromise;
}

/** Discord embed object sent via webhook. */
interface DiscordEmbed {
  title: string;
  description: string;
  color: number;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  timestamp?: string;
  footer?: { text: string };
}

const COLOR_NEW_USER = 0x57f287; // Green

/**
 * Format a new-user signup event as a Discord embed.
 *
 * @param signupMethod - The provider the user signed up with: one of
 *   `'local' | 'google' | 'discord' | 'apple'`.
 */
export function formatNewUserEmbed(
  email: string,
  userId: number,
  signupMethod: 'local' | 'google' | 'discord' | 'apple',
): DiscordEmbed {
  const [localPart, domain] = email.split('@');
  const maskedLocal = localPart.length <= 1 ? '***' : `${localPart[0]}***`;
  const maskedEmail = `${maskedLocal}@${domain}`;

  return {
    title: 'New User Signup',
    description: `A new user has joined Legacy Sports!`,
    color: COLOR_NEW_USER,
    fields: [
      { name: 'User ID', value: String(userId), inline: true },
      { name: 'Email', value: maskedEmail, inline: true },
      { name: 'Method', value: signupMethod, inline: true },
    ],
    timestamp: new Date().toISOString(),
    footer: { text: 'Legacy Sports' },
  };
}

/**
 * Post a Discord embed to the configured user-signup webhook.
 *
 * This is fire-and-forget: failures are logged but never thrown,
 * so they cannot block user registration.
 *
 * @param signupMethod - The provider the user signed up with: one of
 *   `'local' | 'google' | 'discord' | 'apple'`.
 */
export async function notifyNewUserSignup(
  email: string,
  userId: number,
  signupMethod: 'local' | 'google' | 'discord' | 'apple',
): Promise<void> {
  if (
    !process.env['DISCORD_USER_SIGNUP_WEBHOOK_URL'] &&
    !process.env['DISCORD_USER_SIGNUP_WEBHOOK_URL_SECRET_NAME']
  ) {
    LOGGER.debug(
      'Discord new-user signup webhook not configured — skipping notification',
    );
    return;
  }

  let webhookUrl: string;
  try {
    webhookUrl = await getWebhookUrl();
  } catch (err) {
    // Warn rather than error — the webhook is optional/best-effort and the
    // secret may simply have no value set yet (e.g. feature not yet configured
    // in this environment). A warn keeps it out of Rollbar while still
    // surfacing the issue in CloudWatch.
    LOGGER.warn(
      'Discord new-user signup webhook URL unavailable — skipping notification',
      err instanceof Error ? err : String(err),
    );
    return;
  }
  if (!webhookUrl) return;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);

  try {
    const embed = formatNewUserEmbed(email, userId, signupMethod);
    const body = JSON.stringify({ embeds: [embed] });

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      LOGGER.error(
        `Discord new-user webhook failed: ${response.status} ${response.statusText}`,
        { body: text },
      );
      return;
    }

    LOGGER.info('Discord new-user signup notification sent', { userId });
  } catch (error) {
    LOGGER.error('Failed to send Discord new-user notification', {
      error:
        error instanceof Error
          ? { name: error.name, message: error.message, stack: error.stack }
          : String(error),
    });
  } finally {
    clearTimeout(timeout);
  }
}
