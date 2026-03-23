/**
 * Discord matchup score alerts — system mutation triggered by EventBridge.
 *
 * Runs every 4 hours during active seasons. For each active league with a
 * Discord webhook, posts current matchup scores and flags close matchups
 * (within a configurable point threshold).
 *
 * (LS-1678: Discord score update and close matchup alerts)
 */

import { PublicSchema } from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';

import { assertAuthorized } from './scheduled-mutations';
import { builder, type Context } from '../builder';

// ── Response Type ────────────────────────────────────────────────────────────

interface SendDiscordScoreAlertsResultShape {
  leaguesChecked: number;
  alertsSent: number;
  closeMatchupsFound: number;
  errors: string[];
}

const SendDiscordScoreAlertsResult =
  builder.objectRef<SendDiscordScoreAlertsResultShape>(
    'SendDiscordScoreAlertsResult',
  );

builder.objectType(SendDiscordScoreAlertsResult, {
  description:
    'Result of the Discord matchup score alert check across all active leagues',
  fields: (t) => ({
    leaguesChecked: t.exposeInt('leaguesChecked'),
    alertsSent: t.exposeInt('alertsSent'),
    closeMatchupsFound: t.exposeInt('closeMatchupsFound'),
    errors: t.exposeStringList('errors'),
  }),
});

// ── Discord Helper ──────────────────────────────────────────────────────────

interface DiscordEmbed {
  title: string;
  description: string;
  color: number;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  timestamp?: string;
  footer?: { text: string };
}

async function postToDiscord(
  webhookUrl: string,
  embeds: DiscordEmbed[],
): Promise<boolean> {
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds }),
    });

    if (!response.ok) {
      let responseBody: string | undefined;
      try {
        responseBody = await response.text();
      } catch (readError) {
        LOGGER.warn('Failed to read Discord webhook error response body', {
          webhookUrl,
          status: response.status,
          statusText: response.statusText,
          readError,
        });
      }

      LOGGER.error('Failed to post Discord webhook', {
        webhookUrl,
        status: response.status,
        statusText: response.statusText,
        responseBody,
      });

      return false;
    }

    return true;
  } catch (error) {
    LOGGER.error('Error posting Discord webhook', {
      webhookUrl,
      error,
    });
    return false;
  }
}

const COLOR_SCORE_UPDATE = 0x3498db; // Blue
const COLOR_CLOSE_MATCHUP = 0xff6b35; // Orange-red
const COLOR_FINAL_SCORE = 0x57f287; // Green

/** Point threshold for "close matchup" alerts */
const CLOSE_MATCHUP_THRESHOLD = 10;

// ── Mutation ────────────────────────────────────────────────────────────────

builder.mutationField('sendDiscordScoreAlerts', (t) =>
  t.field({
    type: SendDiscordScoreAlertsResult,
    description:
      'Check all active leagues for in-progress matchups and post score updates to Discord. ' +
      'Highlights close matchups within a point threshold. Triggered periodically by EventBridge.',
    args: {
      leagueId: t.arg.int({ required: false }),
    },
    resolve: async (_parent, args, context: Context) => {
      await assertAuthorized(context, args.leagueId);

      const errors: string[] = [];
      let alertsSent = 0;
      let totalCloseMatchupsFound = 0;

      // Find active leagues with Discord webhooks
      const leagueConditions = [
        isNotNull(PublicSchema.leagues.discordWebhookUrl),
        eq(PublicSchema.leagues.leaguePhase, 'active'),
        eq(PublicSchema.leagues.isMockDraft, false),
      ];

      if (args.leagueId) {
        leagueConditions.push(eq(PublicSchema.leagues.id, args.leagueId));
      }

      const leagues = await context.db
        .select({
          id: PublicSchema.leagues.id,
          name: PublicSchema.leagues.name,
          discordWebhookUrl: PublicSchema.leagues.discordWebhookUrl,
          currentWeek: PublicSchema.leagues.currentWeek,
        })
        .from(PublicSchema.leagues)
        .where(and(...leagueConditions));

      for (const league of leagues) {
        if (!league.discordWebhookUrl || !league.currentWeek) continue;

        try {
          // Get current week's matchups that have scores
          const matchups = await context.db
            .select({
              id: PublicSchema.matchups.id,
              team1Id: PublicSchema.matchups.team1Id,
              team2Id: PublicSchema.matchups.team2Id,
              team1Score: PublicSchema.matchups.team1Score,
              team2Score: PublicSchema.matchups.team2Score,
              status: PublicSchema.matchups.status,
            })
            .from(PublicSchema.matchups)
            .where(
              and(
                eq(PublicSchema.matchups.leagueId, league.id),
                eq(PublicSchema.matchups.weekNumber, league.currentWeek),
                inArray(PublicSchema.matchups.status, [
                  'in_progress',
                  'completed',
                ]),
              ),
            );

          if (matchups.length === 0) continue;

          // Get all team names in batch
          const teamIds = [
            ...new Set(
              matchups.flatMap((m) =>
                [m.team1Id, m.team2Id].filter((id): id is number => id != null),
              ),
            ),
          ];

          if (teamIds.length === 0) continue;

          const teams = await context.db
            .select({
              id: PublicSchema.teams.id,
              name: PublicSchema.teams.name,
            })
            .from(PublicSchema.teams)
            .where(inArray(PublicSchema.teams.id, teamIds));

          const teamNameMap = new Map(teams.map((t) => [t.id, t.name]));

          // Build embeds for this league
          const embeds: DiscordEmbed[] = [];
          let leagueCloseMatchups = 0;

          // Score summary embed
          const scoreLines: string[] = [];
          for (const m of matchups) {
            const t1Name =
              teamNameMap.get(m.team1Id ?? 0) ?? `Team ${m.team1Id}`;
            const t2Name =
              teamNameMap.get(m.team2Id ?? 0) ?? `Team ${m.team2Id}`;
            const t1Score = m.team1Score ? parseFloat(m.team1Score) : 0;
            const t2Score = m.team2Score ? parseFloat(m.team2Score) : 0;
            const statusIcon = m.status === 'completed' ? 'FINAL' : 'LIVE';

            const leader =
              t1Score > t2Score
                ? `**${t1Name}** ${t1Score.toFixed(1)} - ${t2Score.toFixed(1)} ${t2Name}`
                : t1Score < t2Score
                  ? `${t1Name} ${t1Score.toFixed(1)} - ${t2Score.toFixed(1)} **${t2Name}**`
                  : `${t1Name} ${t1Score.toFixed(1)} - ${t2Score.toFixed(1)} ${t2Name}`;

            scoreLines.push(`\`${statusIcon}\` ${leader}`);

            // Close matchup detection
            const scoreDiff = Math.abs(t1Score - t2Score);
            if (
              m.status === 'in_progress' &&
              scoreDiff <= CLOSE_MATCHUP_THRESHOLD &&
              (t1Score > 0 || t2Score > 0)
            ) {
              leagueCloseMatchups++;
            }
          }

          totalCloseMatchupsFound += leagueCloseMatchups;

          const hasCompleted = matchups.some((m) => m.status === 'completed');
          const hasInProgress = matchups.some(
            (m) => m.status === 'in_progress',
          );

          const title =
            hasCompleted && !hasInProgress
              ? `Week ${league.currentWeek} Final Scores`
              : `Week ${league.currentWeek} Score Update`;

          const color =
            hasCompleted && !hasInProgress
              ? COLOR_FINAL_SCORE
              : leagueCloseMatchups > 0
                ? COLOR_CLOSE_MATCHUP
                : COLOR_SCORE_UPDATE;

          embeds.push({
            title,
            description: scoreLines.join('\n'),
            color,
            timestamp: new Date().toISOString(),
            footer: { text: 'Legacy Sports Scores' },
          });

          // Post to Discord
          const sent = await postToDiscord(league.discordWebhookUrl, embeds);

          if (sent) {
            alertsSent++;
            LOGGER.info('Discord score alert sent', {
              leagueId: league.id,
              matchups: matchups.length,
              closeMatchups: leagueCloseMatchups,
            });
          } else {
            errors.push(
              `Failed to send score alert for league ${league.id} (${league.name})`,
            );
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`League ${league.id}: ${msg}`);
          LOGGER.error('Discord score alert failed', {
            leagueId: league.id,
            error: msg,
          });
        }
      }

      return {
        leaguesChecked: leagues.length,
        alertsSent,
        closeMatchupsFound: totalCloseMatchupsFound,
        errors,
      };
    },
  }),
);
