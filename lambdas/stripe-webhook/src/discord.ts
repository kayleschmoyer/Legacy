import { LOGGER } from '@legacy-sports/logging';
import { readSecret } from '@legacy-sports/aws-utils';

/**
 * Cached promise for the Stripe-event Discord webhook URL. Resolved on first
 * use and reused for subsequent invocations of the same warm Lambda
 * container. If the fetch rejects, the cache is cleared so the next caller
 * retries (transient Secrets Manager / IAM failures should not permanently
 * poison the container).
 */
let webhookUrlPromise: Promise<string> | null = null;

function getWebhookUrl(): Promise<string> {
  if (!webhookUrlPromise) {
    // Treat an empty-string local env var as "unset" so a blank value in the
    // environment doesn't short-circuit the Secrets Manager fallback.
    const localWebhookUrl = process.env['DISCORD_STRIPE_WEBHOOK_URL'];
    const pending = readSecret({
      localEnvVar: localWebhookUrl ? 'DISCORD_STRIPE_WEBHOOK_URL' : undefined,
      secretPathEnvVar: 'DISCORD_STRIPE_WEBHOOK_URL_SECRET_NAME',
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

// Discord embed color constants
const COLOR_SUCCESS = 0x57f287; // Green
const COLOR_WARNING = 0xfee75c; // Yellow
const COLOR_ERROR = 0xed4245; // Red
const COLOR_INFO = 0x5865f2; // Blurple

interface StripeEventInfo {
  eventType: string;
  customerId?: string | null;
  subscriptionId?: string | null;
  userId?: number | null;
  status?: string | null;
  amount?: number | null;
  currency?: string | null;
}

function eventToEmbed(info: StripeEventInfo): DiscordEmbed | null {
  const { eventType, customerId, subscriptionId, userId, status } = info;

  const fields: DiscordEmbed['fields'] = [];

  if (userId != null) {
    fields.push({ name: 'User ID', value: String(userId), inline: true });
  }
  if (customerId) {
    fields.push({ name: 'Customer', value: customerId, inline: true });
  }
  if (subscriptionId) {
    fields.push({
      name: 'Subscription',
      value: subscriptionId,
      inline: true,
    });
  }
  if (status) {
    fields.push({ name: 'Status', value: status, inline: true });
  }
  if (info.amount != null && info.currency) {
    const formatted = `${(info.amount / 100).toFixed(2)} ${info.currency.toUpperCase()}`;
    fields.push({ name: 'Amount', value: formatted, inline: true });
  }

  switch (eventType) {
    case 'checkout.session.completed':
      return {
        title: 'New Subscription',
        description: 'A user completed checkout and started a subscription.',
        color: COLOR_SUCCESS,
        fields,
        timestamp: new Date().toISOString(),
        footer: { text: 'Stripe' },
      };

    case 'customer.subscription.deleted':
      return {
        title: 'Subscription Cancelled',
        description: 'A subscription has been cancelled.',
        color: COLOR_ERROR,
        fields,
        timestamp: new Date().toISOString(),
        footer: { text: 'Stripe' },
      };

    case 'invoice.payment_failed':
      return {
        title: 'Payment Failed',
        description:
          'A subscription payment failed. The user is in a grace period.',
        color: COLOR_WARNING,
        fields,
        timestamp: new Date().toISOString(),
        footer: { text: 'Stripe' },
      };

    case 'invoice.payment_succeeded':
      return {
        title: 'Payment Succeeded',
        description: 'A subscription payment was successfully processed.',
        color: COLOR_SUCCESS,
        fields,
        timestamp: new Date().toISOString(),
        footer: { text: 'Stripe' },
      };

    case 'customer.subscription.updated':
      return {
        title: 'Subscription Updated',
        description: 'A subscription was updated.',
        color: COLOR_INFO,
        fields,
        timestamp: new Date().toISOString(),
        footer: { text: 'Stripe' },
      };

    default:
      return null;
  }
}

/**
 * Post a Stripe event notification to Discord.
 *
 * Fire-and-forget: failures are logged but never thrown,
 * so they cannot affect Stripe webhook processing.
 */
export async function notifyStripeEvent(info: StripeEventInfo): Promise<void> {
  if (
    !process.env['DISCORD_STRIPE_WEBHOOK_URL'] &&
    !process.env['DISCORD_STRIPE_WEBHOOK_URL_SECRET_NAME']
  ) {
    LOGGER.debug(
      'Discord Stripe webhook not configured — skipping notification',
    );
    return;
  }

  const embed = eventToEmbed(info);
  if (!embed) return;

  let webhookUrl: string;
  try {
    webhookUrl = await getWebhookUrl();
  } catch (err) {
    LOGGER.error('Failed to retrieve Discord Stripe webhook URL', {
      eventType: info.eventType,
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    return;
  }
  if (!webhookUrl) return;

  try {
    const body = JSON.stringify({ embeds: [embed] });

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      LOGGER.error(
        `Discord Stripe webhook failed: ${response.status} ${response.statusText}`,
        { body: text },
      );
      return;
    }

    LOGGER.debug('Discord Stripe notification sent', {
      eventType: info.eventType,
    });
  } catch (error) {
    LOGGER.error('Failed to send Discord Stripe notification', {
      eventType: info.eventType,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined,
    });
  }
}
