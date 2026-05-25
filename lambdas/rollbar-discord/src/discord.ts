import { LOGGER } from '@legacy-sports/logging';
import type {
  BudgetNotification,
  CloudWatchAlarm,
  DiscordEmbed,
  RollbarEvent,
} from './types';

// Discord embed color constants
const COLOR_ERROR = 0xed4245; // Red
const COLOR_WARNING = 0xfee75c; // Yellow
const COLOR_OK = 0x57f287; // Green
const COLOR_INFO = 0x5865f2; // Blurple

/**
 * Normalise a Rollbar level value (string or integer) to a lowercase name.
 * Rollbar's integer levels follow a well-known scale:
 *   debug=10, info=20, warning=30, error=40, critical=50
 * Integer levels are bucketed by range so that values outside the exact set
 * (e.g. 45 or 60) still resolve to the nearest named level rather than
 * being stringified. String levels are lowercased and trimmed so that
 * capitalised variants (e.g. "ERROR", " warning ") are handled correctly.
 */
function normalizeLevel(level: string | number | undefined): string {
  if (typeof level === 'number') {
    if (level >= 50) return 'critical';
    if (level >= 40) return 'error';
    if (level >= 30) return 'warning';
    if (level >= 20) return 'info';
    if (level >= 10) return 'debug';
    return String(level);
  }
  return level?.toLowerCase().trim() ?? 'error';
}

function levelToColor(level: string | undefined): number {
  switch (level) {
    case 'critical':
    case 'error':
      return COLOR_ERROR;
    case 'warning':
      return COLOR_WARNING;
    case 'info':
    case 'debug':
      return COLOR_INFO;
    default:
      return COLOR_ERROR;
  }
}

/**
 * Format a Rollbar webhook event into a Discord embed.
 * Returns `null` for either intentionally ignored event types (deploy
 * events) or events with insufficient payload (no item/occurrence).
 *
 * Deploy events are always skipped by policy — CI workflows already send
 * deploy notifications to the correct Discord channel via discord-notify.
 */
export function formatRollbarEmbed(event: RollbarEvent): DiscordEmbed | null {
  const { item, occurrence } = event.data;

  // Skip deploy events entirely — deploy notifications are handled by
  // CI workflow discord-notify steps routed to the deploy channel.
  if (event.event_name === 'deploy') return null;

  // Drop events without any usable payload — they produce generic embeds.
  if (!item && !occurrence) return null;

  const level = normalizeLevel(item?.level ?? occurrence?.level);
  const environment = item?.environment ?? occurrence?.environment ?? 'unknown';

  const title =
    item?.title ??
    occurrence?.body?.trace?.exception?.message ??
    'Rollbar Event';
  const truncatedTitle =
    title.length > 256 ? title.slice(0, 253) + '...' : title;

  const fields: DiscordEmbed['fields'] = [
    { name: 'Event', value: event.event_name, inline: true },
    { name: 'Level', value: level.toUpperCase(), inline: true },
    { name: 'Environment', value: environment, inline: true },
  ];

  if (item?.total_occurrences !== undefined) {
    fields.push({
      name: 'Occurrences',
      value: String(item.total_occurrences),
      inline: true,
    });
  }

  if (item?.framework) {
    fields.push({ name: 'Framework', value: item.framework, inline: true });
  }

  if (occurrence?.request?.url) {
    fields.push({
      name: 'Request',
      value: `${occurrence.request.method ?? 'GET'} ${occurrence.request.url}`,
      inline: false,
    });
  }

  // Build description from exception or message
  let description = '';
  const exception = occurrence?.body?.trace?.exception;
  if (exception) {
    description = `**${exception.class ?? 'Error'}**: ${exception.message ?? ''}`;
  } else if (occurrence?.body?.message?.body) {
    description = occurrence.body.message.body;
  }

  if (description.length > 2048) {
    description = description.slice(0, 2045) + '...';
  }

  const embed: DiscordEmbed = {
    title: truncatedTitle,
    description: description || 'No additional details',
    color: levelToColor(level),
    fields,
    footer: { text: 'Rollbar' },
  };

  if (item?.public_item_url) {
    embed.url = item.public_item_url;
  }

  if (item?.last_occurrence_timestamp) {
    embed.timestamp = new Date(
      item.last_occurrence_timestamp * 1000,
    ).toISOString();
  } else if (occurrence?.timestamp) {
    embed.timestamp = new Date(occurrence.timestamp * 1000).toISOString();
  }

  return embed;
}

/**
 * Format a CloudWatch Alarm (from SNS) into a Discord embed.
 */
export function formatAlarmEmbed(alarm: CloudWatchAlarm): DiscordEmbed {
  const isAlarm = alarm.NewStateValue === 'ALARM';
  const isOk = alarm.NewStateValue === 'OK';

  const stateEmoji = isAlarm ? '\u{1F6A8}' : isOk ? '\u2705' : '\u2753';
  const color = isAlarm ? COLOR_ERROR : isOk ? COLOR_OK : COLOR_WARNING;

  const fields: DiscordEmbed['fields'] = [
    {
      name: 'State',
      value: `${stateEmoji} ${alarm.NewStateValue}`,
      inline: true,
    },
    { name: 'Region', value: alarm.Region, inline: true },
    { name: 'Metric', value: alarm.Trigger.MetricName, inline: true },
    { name: 'Namespace', value: alarm.Trigger.Namespace, inline: true },
  ];

  if (alarm.Trigger.Dimensions?.length) {
    const dims = alarm.Trigger.Dimensions.map(
      (d) => `${d.name}: ${d.value}`,
    ).join(', ');
    fields.push({ name: 'Dimensions', value: dims, inline: false });
  }

  let reason = alarm.NewStateReason;
  if (reason.length > 2048) {
    reason = reason.slice(0, 2045) + '...';
  }

  return {
    title: alarm.AlarmName,
    description: alarm.AlarmDescription ?? reason,
    color,
    fields,
    timestamp: alarm.StateChangeTime,
    footer: { text: 'CloudWatch Alarm' },
  };
}

/**
 * Format an AWS Budget notification (from SNS) into a Discord embed.
 */
export function formatBudgetEmbed(
  notification: BudgetNotification,
): DiscordEmbed {
  const threshold = parseFloat(notification.thresholdPercentage);
  const color = threshold >= 100 ? COLOR_ERROR : COLOR_WARNING;
  const emoji = threshold >= 100 ? '\u{1F6A8}' : '\u26A0\uFE0F';

  const fields: DiscordEmbed['fields'] = [
    {
      name: 'Threshold',
      value: `${emoji} ${notification.thresholdPercentage}%`,
      inline: true,
    },
    { name: 'Budget Limit', value: notification.budgetLimit, inline: true },
    { name: 'Actual Spend', value: notification.actualSpend, inline: true },
  ];

  if (notification.forecastedSpend) {
    fields.push({
      name: 'Forecasted Spend',
      value: notification.forecastedSpend,
      inline: true,
    });
  }

  if (notification.startDate && notification.endDate) {
    fields.push({
      name: 'Period',
      value: `${notification.startDate} — ${notification.endDate}`,
      inline: false,
    });
  }

  fields.push({
    name: 'Account',
    value: notification.accountId,
    inline: true,
  });

  return {
    title: `Budget Alert: ${notification.budgetName}`,
    description: `${notification.budgetType} budget **${notification.budgetName}** has exceeded **${notification.thresholdPercentage}%** of the budgeted amount.`,
    color,
    fields,
    timestamp: new Date().toISOString(),
    footer: { text: 'AWS Budgets' },
  };
}

/**
 * Post an embed to a Discord webhook URL.
 */
export async function postToDiscord(
  webhookUrl: string,
  embed: DiscordEmbed,
): Promise<void> {
  const body = JSON.stringify({ embeds: [embed] });

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    if (response.status === 429) {
      LOGGER.warn(
        'Discord webhook rate limited (429) — skipping notification',
        {
          body: text,
        },
      );
      return;
    }
    LOGGER.error(
      `Discord webhook failed: ${response.status} ${response.statusText}`,
      { body: text },
    );
    throw new Error(`Discord webhook returned ${response.status}`);
  }
}
