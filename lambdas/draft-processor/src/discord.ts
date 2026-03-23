import { LOGGER } from '@legacy-sports/logging';
import { eq } from 'drizzle-orm';
import { PublicSchema, runWithPublicClient } from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils/node';

/** Discord embed object. */
interface DiscordEmbed {
  title: string;
  description: string;
  color: number;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  timestamp?: string;
  footer?: { text: string };
}

const COLOR_SUCCESS = 0x57f287; // Green
const COLOR_INFO = 0x5865f2; // Blurple
const COLOR_GOLD = 0xf1c40f; // Gold

/**
 * Fetch the Discord webhook URL for a league. Returns null if not configured.
 * Errors are logged and result in null so callers can safely fire-and-forget.
 */
export async function getLeagueDiscordWebhookUrl(
  leagueId: number,
): Promise<string | null> {
  try {
    return await runWithPublicClient(getDbOptions(), async (db) => {
      const rows = await db
        .select({ discordWebhookUrl: PublicSchema.leagues.discordWebhookUrl })
        .from(PublicSchema.leagues)
        .where(eq(PublicSchema.leagues.id, leagueId))
        .limit(1);

      return rows[0]?.discordWebhookUrl ?? null;
    });
  } catch (error) {
    LOGGER.error('Failed to fetch Discord league webhook URL', {
      leagueId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Post a Discord embed to a webhook URL. Fire-and-forget — errors are logged, never thrown.
 */
async function postToDiscord(
  webhookUrl: string,
  embed: DiscordEmbed,
): Promise<void> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      LOGGER.error(
        `Discord league webhook failed: ${response.status} ${response.statusText}`,
        { body: text },
      );
    }
  } catch (error) {
    LOGGER.error(
      'Failed to send Discord league notification',
      error instanceof Error ? error.message : String(error),
    );
  }
}

interface DraftPickInfo {
  teamName: string;
  playerName: string;
  round: number;
  pickNumber: number;
  overallPick: number;
  bidAmount?: number | null;
}

/**
 * Notify a league's Discord channel that a draft pick was made.
 */
export async function notifyDiscordDraftPick(
  leagueId: number,
  pick: DraftPickInfo,
): Promise<void> {
  const webhookUrl = await getLeagueDiscordWebhookUrl(leagueId);
  if (!webhookUrl) return;

  const fields: DiscordEmbed['fields'] = [
    { name: 'Team', value: pick.teamName, inline: true },
    { name: 'Player', value: pick.playerName, inline: true },
    {
      name: 'Pick',
      value: `Round ${pick.round}, Pick ${pick.pickNumber} (#${pick.overallPick} overall)`,
      inline: false,
    },
  ];

  if (pick.bidAmount != null) {
    fields.push({
      name: 'Bid Amount',
      value: `$${pick.bidAmount}`,
      inline: true,
    });
  }

  await postToDiscord(webhookUrl, {
    title: `Pick #${pick.overallPick}: ${pick.playerName}`,
    description: `**${pick.teamName}** selects **${pick.playerName}**`,
    color: COLOR_GOLD,
    fields,
    timestamp: new Date().toISOString(),
    footer: { text: 'Legacy Sports Draft' },
  });
}

/**
 * Notify a league's Discord channel that the draft has started.
 */
export async function notifyDiscordDraftStarted(
  leagueId: number,
  leagueName: string,
  selectionMethod: string,
): Promise<void> {
  const webhookUrl = await getLeagueDiscordWebhookUrl(leagueId);
  if (!webhookUrl) return;

  await postToDiscord(webhookUrl, {
    title: 'Draft Started!',
    description: `The **${leagueName}** draft is now underway!`,
    color: COLOR_INFO,
    fields: [{ name: 'Draft Type', value: selectionMethod, inline: true }],
    timestamp: new Date().toISOString(),
    footer: { text: 'Legacy Sports Draft' },
  });
}

/**
 * Notify a league's Discord channel that the draft has completed.
 */
export async function notifyDiscordDraftCompleted(
  leagueId: number,
  leagueName: string,
  selectionMethod: string,
  totalPicks: number,
): Promise<void> {
  const webhookUrl = await getLeagueDiscordWebhookUrl(leagueId);
  if (!webhookUrl) return;

  await postToDiscord(webhookUrl, {
    title: 'Draft Complete!',
    description: `The **${leagueName}** draft has finished. The season is about to begin!`,
    color: COLOR_SUCCESS,
    fields: [
      { name: 'Draft Type', value: selectionMethod, inline: true },
      { name: 'Total Picks', value: String(totalPicks), inline: true },
    ],
    timestamp: new Date().toISOString(),
    footer: { text: 'Legacy Sports Draft' },
  });
}
