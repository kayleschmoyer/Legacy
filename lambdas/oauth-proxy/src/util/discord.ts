import { LOGGER } from '@legacy-sports/logging';

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
 */
export function formatNewUserEmbed(
  email: string,
  userId: number,
  signupMethod: 'local' | 'google',
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
 */
export async function notifyNewUserSignup(
  email: string,
  userId: number,
  signupMethod: 'local' | 'google',
): Promise<void> {
  const webhookUrl = process.env['DISCORD_USER_SIGNUP_WEBHOOK_URL'];

  if (!webhookUrl) {
    LOGGER.debug(
      'DISCORD_USER_SIGNUP_WEBHOOK_URL not set — skipping new-user notification',
    );
    return;
  }

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
