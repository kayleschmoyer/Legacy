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
  const webhookUrl = process.env['DISCORD_STRIPE_WEBHOOK_URL'];

  if (!webhookUrl) {
    LOGGER.debug(
      'DISCORD_STRIPE_WEBHOOK_URL not set — skipping Stripe Discord notification',
    );
    return;
  }

  const embed = eventToEmbed(info);
  if (!embed) return;

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
