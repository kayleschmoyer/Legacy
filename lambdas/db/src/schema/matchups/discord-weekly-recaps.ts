/**
 * Discord weekly recaps — system mutation triggered by EventBridge.
 *
 * Runs weekly on Sunday at 10am Eastern (15:00 UTC) after matchup advancement.
 * For each active league with a Discord webhook, posts a recap of the previous
 * week's results, current standings (sorted by win %), and the top scorer.
 *
 * (LS-1682: Weekly Discord recaps — power rankings, top scorers, standings)
 */

import { PublicSchema } from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';

import { assertAuthorized } from './scheduled-mutations';
import { builder, type Context } from '../builder';

// ── Response Type ────────────────────────────────────────────────────────────

interface SendDiscordWeeklyRecapsResultShape {
  leaguesChecked: number;
  recapsSent: number;
  errors: string[];
}

const SendDiscordWeeklyRecapsResult =
  builder.objectRef<SendDiscordWeeklyRecapsResultShape>(
    'SendDiscordWeeklyRecapsResult',
  );

builder.objectType(SendDiscordWeeklyRecapsResult, {
  description:
    'Result of the weekly Discord recap post across all active leagues',
  fields: (t) => ({
    leaguesChecked: t.exposeInt('leaguesChecked'),
    recapsSent: t.exposeInt('recapsSent'),
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

/**
 * Validate that a URL is a legitimate Discord webhook endpoint.
 * Only allows HTTPS to `discord.com` or its subdomains (e.g. `canary.discord.com`).
 */
export function isValidDiscordUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'https:' &&
      (parsed.hostname === 'discord.com' ||
        parsed.hostname.endsWith('.discord.com'))
    );
  } catch {
    return false;
  }
}

async function postToDiscord(
  webhookUrl: string,
  embeds: DiscordEmbed[],
): Promise<boolean> {
  // SSRF validation: only allow HTTPS requests to Discord webhook hosts
  if (!isValidDiscordUrl(webhookUrl)) {
    LOGGER.warn('Blocked non-Discord webhook URL', { webhookUrl });
    return false;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '(unreadable)');
      LOGGER.error('Discord webhook request failed', {
        status: response.status,
        body,
      });
    }

    return response.ok;
  } catch (err) {
    LOGGER.error('Discord webhook request error', {
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

const COLOR_RECAP = 0x9b59b6; // Purple

// ── Mutation ────────────────────────────────────────────────────────────────

builder.mutationField('sendDiscordWeeklyRecaps', (t) =>
  t.field({
    type: SendDiscordWeeklyRecapsResult,
    description:
      'Post weekly recaps (results, standings, top scorer) to Discord for all active leagues. ' +
      'Triggered weekly by EventBridge after matchup advancement.',
    args: {
      leagueId: t.arg.int({ required: false }),
    },
    resolve: async (_parent, args, context: Context) => {
      await assertAuthorized(context, args.leagueId);

      const errors: string[] = [];
      let recapsSent = 0;

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

        // Recap the previous week (currentWeek was already advanced)
        const recapWeek = league.currentWeek - 1;
        if (recapWeek < 1) continue;

        try {
          // Get previous week's completed matchups
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
                eq(PublicSchema.matchups.weekNumber, recapWeek),
                eq(PublicSchema.matchups.status, 'completed'),
              ),
            );

          if (matchups.length === 0) continue;

          // Batch-resolve team names
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

          // ── Build Results Section ──
          const resultLines: string[] = [];
          let topScorerTeam = '';
          let topScore = 0;

          for (const m of matchups) {
            const t1Name =
              teamNameMap.get(m.team1Id ?? 0) ?? `Team ${m.team1Id}`;
            const t2Name =
              teamNameMap.get(m.team2Id ?? 0) ?? `Team ${m.team2Id}`;
            const t1Score = m.team1Score ? parseFloat(m.team1Score) : 0;
            const t2Score = m.team2Score ? parseFloat(m.team2Score) : 0;

            if (t1Score === t2Score) {
              resultLines.push(
                `**${t1Name}** ${t1Score.toFixed(1)} - ${t2Score.toFixed(1)} **${t2Name}** (Tie)`,
              );
            } else {
              const winner = t1Score > t2Score ? t1Name : t2Name;
              const loser = t1Score > t2Score ? t2Name : t1Name;
              const winScore = Math.max(t1Score, t2Score);
              const loseScore = Math.min(t1Score, t2Score);

              resultLines.push(
                `**${winner}** ${winScore.toFixed(1)} - ${loseScore.toFixed(1)} ${loser}`,
              );
            }

            // Track top scorer
            if (t1Score > topScore) {
              topScore = t1Score;
              topScorerTeam = t1Name;
            }
            if (t2Score > topScore) {
              topScore = t2Score;
              topScorerTeam = t2Name;
            }
          }

          // ── Build Standings Section ──
          // Load all teams in the league so 0-0 teams still appear in standings.
          // NOTE: This is an N+1 query per league. Acceptable for the expected
          // league count (<100); if volume grows, batch across leagues.
          const allLeagueTeams = await context.db
            .select({
              id: PublicSchema.teams.id,
              name: PublicSchema.teams.name,
            })
            .from(PublicSchema.teams)
            .where(eq(PublicSchema.teams.leagueId, league.id));

          const allTeamNameMap = new Map(
            allLeagueTeams.map((t) => [t.id, t.name]),
          );

          // Calculate W-L-T records from all completed matchups
          const allMatchups = await context.db
            .select({
              team1Id: PublicSchema.matchups.team1Id,
              team2Id: PublicSchema.matchups.team2Id,
              team1Score: PublicSchema.matchups.team1Score,
              team2Score: PublicSchema.matchups.team2Score,
            })
            .from(PublicSchema.matchups)
            .where(
              and(
                eq(PublicSchema.matchups.leagueId, league.id),
                eq(PublicSchema.matchups.status, 'completed'),
              ),
            );

          const records = new Map<
            number,
            { wins: number; losses: number; ties: number; pf: number }
          >();

          // Seed every league team so 0-0-0 teams appear in standings
          for (const t of allLeagueTeams) {
            records.set(t.id, { wins: 0, losses: 0, ties: 0, pf: 0 });
          }

          for (const m of allMatchups) {
            if (m.team1Id == null || m.team2Id == null) continue;
            const t1Score = m.team1Score ? parseFloat(m.team1Score) : 0;
            const t2Score = m.team2Score ? parseFloat(m.team2Score) : 0;

            if (!records.has(m.team1Id))
              records.set(m.team1Id, { wins: 0, losses: 0, ties: 0, pf: 0 });
            if (!records.has(m.team2Id))
              records.set(m.team2Id, { wins: 0, losses: 0, ties: 0, pf: 0 });

            const r1 = records.get(m.team1Id);
            const r2 = records.get(m.team2Id);
            if (!r1 || !r2) continue;

            r1.pf += t1Score;
            r2.pf += t2Score;

            if (t1Score > t2Score) {
              r1.wins++;
              r2.losses++;
            } else if (t2Score > t1Score) {
              r2.wins++;
              r1.losses++;
            } else {
              r1.ties++;
              r2.ties++;
            }
          }

          // Sort by win % (ties count as 0.5) then points for
          const standings = [...records.entries()]
            .map(([teamId, r]) => {
              const totalGames = r.wins + r.losses + r.ties;
              return {
                teamId,
                name: allTeamNameMap.get(teamId) ?? `Team ${teamId}`,
                wins: r.wins,
                losses: r.losses,
                ties: r.ties,
                pf: r.pf,
                winPct:
                  totalGames > 0 ? (r.wins + r.ties * 0.5) / totalGames : 0,
              };
            })
            .sort((a, b) => b.winPct - a.winPct || b.pf - a.pf);

          const standingsLines = standings.map((s, i) => {
            const record =
              s.ties > 0
                ? `${s.wins}-${s.losses}-${s.ties}`
                : `${s.wins}-${s.losses}`;
            return `${i + 1}. **${s.name}** (${record}) — ${s.pf.toFixed(1)} PF`;
          });

          // ── Build Embeds ──
          const embeds: DiscordEmbed[] = [
            {
              title: `Week ${recapWeek} Recap — ${league.name}`,
              description: resultLines.join('\n'),
              color: COLOR_RECAP,
              fields: [
                {
                  name: 'Top Scorer',
                  value: topScorerTeam
                    ? `${topScorerTeam} (${topScore.toFixed(1)} pts)`
                    : 'N/A',
                  inline: true,
                },
                {
                  name: 'Matchups',
                  value: `${matchups.length} completed`,
                  inline: true,
                },
              ],
              timestamp: new Date().toISOString(),
              footer: { text: 'Legacy Sports Weekly Recap' },
            },
            {
              title: `Standings after Week ${recapWeek}`,
              description: standingsLines.join('\n'),
              color: COLOR_RECAP,
            },
          ];

          const sent = await postToDiscord(league.discordWebhookUrl, embeds);

          if (sent) {
            recapsSent++;
            LOGGER.info('Discord weekly recap sent', {
              leagueId: league.id,
              recapWeek,
            });
          } else {
            errors.push(
              `Failed to send recap for league ${league.id} (${league.name})`,
            );
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`League ${league.id}: ${msg}`);
          LOGGER.error('Discord weekly recap failed', {
            leagueId: league.id,
            error: msg,
          });
        }
      }

      return {
        leaguesChecked: leagues.length,
        recapsSent,
        errors,
      };
    },
  }),
);
