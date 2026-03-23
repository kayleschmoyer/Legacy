import { LOGGER } from '@legacy-sports/logging';
import { eq, inArray } from 'drizzle-orm';
import { type GenericDatabase, PublicSchema } from '@legacy-sports/db-client';
import type { Context } from '../schema/builder';

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

const COLOR_TRADE_PROPOSED = 0x5865f2; // Blurple
const COLOR_TRADE_ACCEPTED = 0x57f287; // Green
const COLOR_TRADE_REJECTED = 0xed4245; // Red
const COLOR_TRADE_CANCELLED = 0xfee75c; // Yellow
const COLOR_TRADE_VETOED = 0xed4245; // Red

const TRADE_COLORS: Record<string, number> = {
  proposed: COLOR_TRADE_PROPOSED,
  accepted: COLOR_TRADE_ACCEPTED,
  rejected: COLOR_TRADE_REJECTED,
  cancelled: COLOR_TRADE_CANCELLED,
  vetoed: COLOR_TRADE_VETOED,
};

const TRADE_TITLES: Record<string, string> = {
  proposed: 'Trade Proposed',
  accepted: 'Trade Accepted',
  rejected: 'Trade Rejected',
  cancelled: 'Trade Cancelled',
  vetoed: 'Trade Vetoed by Commissioner',
};

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

/**
 * Fetch player names for a trade offer's players.
 */
async function getTradePlayerNames(
  context: Context,
  tradeId: number,
): Promise<{
  proposingPlayers: string[];
  receivingPlayers: string[];
  proposingTeamId: number | null;
}> {
  const tradePlayerRows = await context.db
    .select({
      playerId: PublicSchema.tradeOfferPlayers.playerId,
      fromTeamId: PublicSchema.tradeOfferPlayers.fromTeamId,
    })
    .from(PublicSchema.tradeOfferPlayers)
    .where(eq(PublicSchema.tradeOfferPlayers.tradeOfferId, tradeId));

  if (tradePlayerRows.length === 0) {
    return {
      proposingPlayers: [],
      receivingPlayers: [],
      proposingTeamId: null,
    };
  }

  const playerIds = tradePlayerRows.map((r) => r.playerId);
  const players = await context.db
    .select({
      id: PublicSchema.players.id,
      firstName: PublicSchema.players.firstName,
      lastName: PublicSchema.players.lastName,
    })
    .from(PublicSchema.players)
    .where(inArray(PublicSchema.players.id, playerIds));

  const playerMap = new Map(
    players.map((p) => [p.id, `${p.firstName} ${p.lastName}`]),
  );

  // Get the trade offer to determine proposing team
  const [tradeOffer] = await context.db
    .select({ proposingTeamId: PublicSchema.tradeOffers.proposingTeamId })
    .from(PublicSchema.tradeOffers)
    .where(eq(PublicSchema.tradeOffers.id, tradeId))
    .limit(1);

  const proposingTeamId = tradeOffer?.proposingTeamId ?? null;

  const proposingPlayers: string[] = [];
  const receivingPlayers: string[] = [];

  for (const row of tradePlayerRows) {
    const name = playerMap.get(row.playerId) ?? `Player #${row.playerId}`;
    if (row.fromTeamId === proposingTeamId) {
      proposingPlayers.push(name);
    } else {
      receivingPlayers.push(name);
    }
  }

  return { proposingPlayers, receivingPlayers, proposingTeamId };
}

/**
 * Send a Discord notification for a trade event.
 * Fire-and-forget: errors are logged but never thrown.
 */
export async function notifyDiscordTradeEvent(
  action: 'proposed' | 'accepted' | 'rejected' | 'cancelled' | 'vetoed',
  opts: {
    leagueId: number;
    tradeId: number;
    proposingTeamName: string;
    receivingTeamName: string;
  },
  context: Context,
): Promise<void> {
  try {
    const webhookUrl = await getLeagueDiscordWebhookUrl(
      context.db,
      opts.leagueId,
    );
    if (!webhookUrl) return;

    if (!isValidDiscordWebhookUrl(webhookUrl)) {
      LOGGER.warn('Ignoring invalid Discord webhook URL', {
        leagueId: opts.leagueId,
      });
      return;
    }

    const { proposingPlayers, receivingPlayers } = await getTradePlayerNames(
      context,
      opts.tradeId,
    );

    const fields: DiscordEmbed['fields'] = [
      {
        name: opts.proposingTeamName,
        value:
          proposingPlayers.length > 0
            ? proposingPlayers.join(', ')
            : '(no players)',
        inline: true,
      },
      {
        name: opts.receivingTeamName,
        value:
          receivingPlayers.length > 0
            ? receivingPlayers.join(', ')
            : '(no players)',
        inline: true,
      },
    ];

    const descriptions: Record<string, string> = {
      proposed: `**${opts.proposingTeamName}** proposed a trade to **${opts.receivingTeamName}**`,
      accepted: `**${opts.receivingTeamName}** accepted the trade from **${opts.proposingTeamName}**`,
      rejected: `**${opts.receivingTeamName}** rejected the trade from **${opts.proposingTeamName}**`,
      cancelled: `**${opts.proposingTeamName}** cancelled their trade offer to **${opts.receivingTeamName}**`,
      vetoed: `Commissioner vetoed the trade between **${opts.proposingTeamName}** and **${opts.receivingTeamName}**`,
    };

    const embed: DiscordEmbed = {
      title: TRADE_TITLES[action] ?? 'Trade Update',
      description: descriptions[action] ?? 'A trade event occurred.',
      color: TRADE_COLORS[action] ?? COLOR_TRADE_PROPOSED,
      fields,
      timestamp: new Date().toISOString(),
      footer: { text: 'Legacy Sports Trades' },
    };

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] }),
      redirect: 'error',
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      LOGGER.error(
        `Discord trade webhook failed: ${response.status} ${response.statusText}`,
        { body: text },
      );
    }
  } catch (error) {
    LOGGER.error(
      'Failed to send Discord trade notification',
      error instanceof Error ? error.message : String(error),
    );
  }
}
