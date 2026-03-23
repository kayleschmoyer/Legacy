import { LOGGER } from '@legacy-sports/logging';
import { eq, inArray } from 'drizzle-orm';
import { type GenericDatabase, PublicSchema } from '@legacy-sports/db-client';

/** Discord embed object. */
interface DiscordEmbed {
  title: string;
  description: string;
  color: number;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  timestamp?: string;
  footer?: { text: string };
}

const COLOR_WAIVER = 0x3498db; // Blue

/** Timeout for Discord webhook requests (ms). */
const WEBHOOK_TIMEOUT_MS = 5000;

/** Allowed hostnames for Discord webhook URLs. */
const ALLOWED_WEBHOOK_HOSTS = new Set([
  'discord.com',
  'discordapp.com',
  'canary.discord.com',
  'ptb.discord.com',
]);

/**
 * Validate that a webhook URL is a legitimate Discord webhook endpoint.
 * Returns true only for https URLs on known Discord hosts with /api/webhooks/ path.
 */
export function isValidDiscordWebhookUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'https:' &&
      ALLOWED_WEBHOOK_HOSTS.has(parsed.hostname) &&
      parsed.pathname.startsWith('/api/webhooks/')
    );
  } catch {
    return false;
  }
}

/**
 * Fetch the Discord webhook URL for a league. Returns null if not configured.
 */
async function getLeagueDiscordWebhookUrl(
  db: GenericDatabase<typeof PublicSchema>,
  leagueId: number,
): Promise<string | null> {
  const rows = await db
    .select({ discordWebhookUrl: PublicSchema.leagues.discordWebhookUrl })
    .from(PublicSchema.leagues)
    .where(eq(PublicSchema.leagues.id, leagueId))
    .limit(1);

  return rows[0]?.discordWebhookUrl ?? null;
}

/**
 * Batch-fetch Discord webhook URLs for multiple leagues.
 * Returns a Map of leagueId -> webhookUrl (only leagues with configured URLs).
 */
export async function getDiscordWebhookUrls(
  db: GenericDatabase<typeof PublicSchema>,
  leagueIds: number[],
): Promise<Map<number, string>> {
  if (leagueIds.length === 0) return new Map();

  const rows = await db
    .select({
      id: PublicSchema.leagues.id,
      discordWebhookUrl: PublicSchema.leagues.discordWebhookUrl,
    })
    .from(PublicSchema.leagues)
    .where(inArray(PublicSchema.leagues.id, leagueIds));

  const result = new Map<number, string>();
  for (const row of rows) {
    if (row.discordWebhookUrl) {
      result.set(row.id, row.discordWebhookUrl);
    }
  }
  return result;
}

/**
 * Send a Discord notification for a waiver claim.
 * Fire-and-forget: errors are logged but never thrown.
 *
 * When `webhookUrl` is provided it is used directly (skipping the DB lookup),
 * which avoids N+1 queries when processing multiple claims.
 */
export async function notifyDiscordWaiverClaim(
  db: GenericDatabase<typeof PublicSchema>,
  opts: {
    leagueId: number;
    teamName: string;
    playerName: string;
    dropName: string | null;
    waiverType: string;
    faabBid: number | null;
    webhookUrl?: string;
  },
): Promise<void> {
  try {
    const webhookUrl =
      opts.webhookUrl ?? (await getLeagueDiscordWebhookUrl(db, opts.leagueId));
    if (!webhookUrl) return;

    if (!isValidDiscordWebhookUrl(webhookUrl)) {
      LOGGER.error('Discord webhook URL failed validation', {
        leagueId: opts.leagueId,
      });
      return;
    }

    let description = `**${opts.teamName}** claimed **${opts.playerName}**`;
    if (opts.dropName) {
      description += `, dropped **${opts.dropName}**`;
    }

    const fields: DiscordEmbed['fields'] = [
      { name: 'Team', value: opts.teamName, inline: true },
      { name: 'Added', value: opts.playerName, inline: true },
    ];

    if (opts.dropName) {
      fields.push({ name: 'Dropped', value: opts.dropName, inline: true });
    }

    if (opts.waiverType === 'faab' && opts.faabBid != null) {
      fields.push({
        name: 'FAAB Bid',
        value: `$${opts.faabBid}`,
        inline: true,
      });
    }

    const embed: DiscordEmbed = {
      title: 'Waiver Claim Processed',
      description,
      color: COLOR_WAIVER,
      fields,
      timestamp: new Date().toISOString(),
      footer: { text: 'Legacy Sports Waivers' },
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, WEBHOOK_TIMEOUT_MS);

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          embeds: [embed],
          allowed_mentions: { parse: [] },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        LOGGER.error(
          `Discord waiver webhook failed: ${response.status} ${response.statusText}`,
          { body: text, leagueId: opts.leagueId },
        );
      }
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      LOGGER.error('Discord waiver webhook timed out before completion', {
        leagueId: opts.leagueId,
      });
      return;
    }
    LOGGER.error('Failed to send Discord waiver notification', {
      error: error instanceof Error ? error.message : String(error),
      leagueId: opts.leagueId,
    });
  }
}
