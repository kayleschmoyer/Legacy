/**
 * Discord lineup lock reminders — system mutation triggered by EventBridge.
 *
 * Runs hourly. For each active league with a Discord webhook configured,
 * checks if the current matchup's computed lock time falls within the league's
 * configured reminder window. If so, posts a reminder to the league's
 * Discord channel.
 *
 * Deduplicated via `discordLastReminderMatchupId` — each league only
 * gets one reminder per matchup, regardless of how many hourly runs overlap
 * the window.
 *
 * Commissioner settings for `discordWebhookUrl` / `discordReminderHours` are
 * wired through the `updateLeagueSettings` mutation (separate PR).
 *
 * (LS-1683: Discord lineup lock reminders)
 */

import { PublicSchema } from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
import { getNotificationCopy } from '@legacy-sports/utils';
import { and, asc, eq, gte, isNotNull, lte, sql } from 'drizzle-orm';

import { assertAuthorized } from './system-auth';
import { builder, type Context } from '../builder';

// ── Response Type ────────────────────────────────────────────────────────────

interface SendDiscordLineupRemindersResultShape {
  leaguesChecked: number;
  remindersSent: number;
  errors: string[];
}

const SendDiscordLineupRemindersResult =
  builder.objectRef<SendDiscordLineupRemindersResultShape>(
    'SendDiscordLineupRemindersResult',
  );

builder.objectType(SendDiscordLineupRemindersResult, {
  description:
    'Result of the Discord lineup lock reminder check across all active leagues',
  fields: (t) => ({
    leaguesChecked: t.exposeInt('leaguesChecked'),
    remindersSent: t.exposeInt('remindersSent'),
    errors: t.exposeStringList('errors'),
  }),
});

// ── Lock-time computation ─────────────────────────────────────────────────────

/**
 * Compute the effective lock time for a matchup, taking into account the
 * league's `rosterLockTiming` setting and any custom lock rules.
 *
 * This mirrors the logic in `isRosterLocked` (lib/db-client) so that
 * reminders fire relative to the *actual* lock — not just matchup start.
 */
async function computeLockTime(
  db: Context['db'],
  leagueId: number,
  rosterLockTiming: string,
  matchupStartTime: string,
): Promise<Date> {
  const matchupStart = new Date(matchupStartTime);

  // Check for custom lock rules first
  const [lockRules] = await db
    .select({
      customLockTime: PublicSchema.rosterLockRules.customLockTime,
      lockHoursBeforeMatchup:
        PublicSchema.rosterLockRules.lockHoursBeforeMatchup,
    })
    .from(PublicSchema.rosterLockRules)
    .where(eq(PublicSchema.rosterLockRules.leagueId, leagueId))
    .limit(1);

  if (lockRules?.customLockTime) {
    return new Date(lockRules.customLockTime);
  }

  switch (rosterLockTiming) {
    case 'day_before':
      return new Date(matchupStart.getTime() - 24 * 60 * 60 * 1000);
    case 'week_before':
      return new Date(matchupStart.getTime() - 7 * 24 * 60 * 60 * 1000);
    case 'custom':
      if (lockRules?.lockHoursBeforeMatchup) {
        return new Date(
          matchupStart.getTime() -
            lockRules.lockHoursBeforeMatchup * 60 * 60 * 1000,
        );
      }
      return matchupStart;
    case 'matchup_start':
    default:
      return matchupStart;
  }
}

// ── Time-label formatting ────────────────────────────────────────────────────

/**
 * Build a human-friendly "time until lock" label. Uses minutes when < 1 hour,
 * otherwise hours (always rounding up so the user is never surprised by an
 * under-estimate).
 */
export function formatTimeUntilLock(lockTime: Date, now: Date): string {
  const diffMs = lockTime.getTime() - now.getTime();
  const diffMinutes = diffMs / (1000 * 60);

  if (diffMinutes < 60) {
    const minutesUntilLock = Math.max(1, Math.ceil(diffMinutes));
    return minutesUntilLock === 1 ? '1 minute' : `${minutesUntilLock} minutes`;
  }

  const hoursUntilLock = Math.ceil(diffMinutes / 60);
  return hoursUntilLock === 1 ? '1 hour' : `${hoursUntilLock} hours`;
}

// ── Discord Webhook Helper ──────────────────────────────────────────────────

async function postToDiscord(
  webhookUrl: string,
  embed: {
    title: string;
    description: string;
    color: number;
    fields?: Array<{ name: string; value: string; inline?: boolean }>;
    timestamp?: string;
    footer?: { text: string };
  },
): Promise<boolean> {
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] }),
    });

    if (!response.ok) {
      let responseBody: string | undefined;
      try {
        responseBody = await response.text();
      } catch (readError) {
        LOGGER.error('Failed to read Discord webhook error response body', {
          webhookUrl,
          status: response.status,
          statusText: response.statusText,
          readError,
        });
      }

      LOGGER.error('Discord webhook request failed', {
        webhookUrl,
        status: response.status,
        statusText: response.statusText,
        responseBody,
      });

      return false;
    }

    return true;
  } catch (error: unknown) {
    LOGGER.error('Discord webhook request threw an exception', {
      webhookUrl,
      error,
    });
    return false;
  }
}

// ── Mutation ────────────────────────────────────────────────────────────────

builder.mutationField('sendDiscordLineupReminders', (t) =>
  t.field({
    type: SendDiscordLineupRemindersResult,
    description:
      'Check all active leagues for upcoming matchup locks and send Discord reminders. ' +
      'Triggered hourly by EventBridge.',
    args: {
      leagueId: t.arg.int({ required: false }),
    },
    resolve: async (_parent, args, context: Context) => {
      await assertAuthorized(context, args.leagueId);

      const now = new Date();
      const errors: string[] = [];
      let remindersSent = 0;

      // ── 1. Fetch candidate leagues ──────────────────────────────────────
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
          discordReminderHours: PublicSchema.leagues.discordReminderHours,
          discordLastReminderMatchupId:
            PublicSchema.leagues.discordLastReminderMatchupId,
          currentWeek: PublicSchema.leagues.currentWeek,
          rosterLockTiming: PublicSchema.leagues.rosterLockTiming,
          sport: PublicSchema.leagues.sport,
        })
        .from(PublicSchema.leagues)
        .where(and(...leagueConditions));

      // ── 2. Batch-fetch upcoming matchups for ALL candidate leagues ──────
      // Use the maximum possible reminder window across all leagues so
      // we can filter per-league in memory, avoiding N+1 queries.
      const maxReminderHours = Math.max(
        ...leagues.map((l) => l.discordReminderHours),
        0,
      );
      const maxWindowEnd = new Date(
        now.getTime() + maxReminderHours * 60 * 60 * 1000,
      );

      const leagueIds = leagues
        .filter((l) => l.discordWebhookUrl && l.currentWeek)
        .map((l) => l.id);

      if (leagueIds.length === 0) {
        return { leaguesChecked: leagues.length, remindersSent, errors };
      }

      // Fetch all scheduled matchups that start between now and the widest
      // window, ordered by soonest start first.
      // Use Drizzle typed comparisons (gte/lte) so the driver handles
      // parameter casting — avoids implicit timestamp / timestamptz mismatch.
      const allMatchups = await context.db
        .select({
          id: PublicSchema.matchups.id,
          leagueId: PublicSchema.matchups.leagueId,
          startTime: PublicSchema.matchups.startTime,
          weekNumber: PublicSchema.matchups.weekNumber,
        })
        .from(PublicSchema.matchups)
        .where(
          and(
            sql`${PublicSchema.matchups.leagueId} IN (${sql.join(
              leagueIds.map((id) => sql`${id}`),
              sql`, `,
            )})`,
            eq(PublicSchema.matchups.status, 'scheduled'),
            isNotNull(PublicSchema.matchups.startTime),
            gte(PublicSchema.matchups.startTime, now.toISOString()),
            lte(PublicSchema.matchups.startTime, maxWindowEnd.toISOString()),
          ),
        )
        .orderBy(asc(PublicSchema.matchups.startTime));

      // Group matchups by league ID for easy lookup
      const matchupsByLeague = new Map<
        number,
        (typeof allMatchups)[number][]
      >();
      for (const m of allMatchups) {
        const existing = matchupsByLeague.get(m.leagueId) ?? [];
        existing.push(m);
        matchupsByLeague.set(m.leagueId, existing);
      }

      // ── 3. Process each league ──────────────────────────────────────────
      for (const league of leagues) {
        if (!league.discordWebhookUrl || !league.currentWeek) continue;

        try {
          // Find the earliest matchup for this league's current week
          // that falls within its specific reminder window.
          const leagueMatchups = matchupsByLeague.get(league.id) ?? [];
          const leagueWindowEnd = new Date(
            now.getTime() + league.discordReminderHours * 60 * 60 * 1000,
          );

          const matchup = leagueMatchups.find(
            (m) =>
              m.weekNumber === league.currentWeek &&
              m.startTime !== null &&
              new Date(m.startTime) <= leagueWindowEnd,
          );

          if (!matchup?.startTime) continue;

          // Dedupe: skip if we already sent a reminder for this matchup
          if (league.discordLastReminderMatchupId === matchup.id) continue;

          // Compute effective lock time (respects rosterLockTiming)
          const lockTime = await computeLockTime(
            context.db,
            league.id,
            league.rosterLockTiming,
            matchup.startTime,
          );

          // Skip if lock time is already in the past
          if (lockTime <= now) continue;

          const timeLabel = formatTimeUntilLock(lockTime, now);

          const lockTimeFormatted = lockTime.toLocaleString('en-US', {
            timeZone: 'America/New_York',
            dateStyle: 'short',
            timeStyle: 'short',
          });

          const reminderCopy = getNotificationCopy(
            'lineup_reminder',
            league.sport,
          );
          const sent = await postToDiscord(league.discordWebhookUrl, {
            title: 'Lineup Lock Reminder',
            description: `Rosters lock in **${timeLabel}**! Make sure your ${reminderCopy.sportLabel} lineup is set for Week ${league.currentWeek}.`,
            color: 0xffa500, // Orange
            fields: [
              {
                name: 'League',
                value: league.name,
                inline: true,
              },
              {
                name: 'Lock Time',
                value: lockTimeFormatted,
                inline: true,
              },
            ],
            timestamp: new Date().toISOString(),
            footer: { text: reminderCopy.footerText },
          });

          if (sent) {
            // Mark this matchup as "reminded" to prevent duplicate sends
            await context.db
              .update(PublicSchema.leagues)
              .set({ discordLastReminderMatchupId: matchup.id })
              .where(eq(PublicSchema.leagues.id, league.id));

            remindersSent++;
            LOGGER.info('Discord lineup reminder sent', {
              leagueId: league.id,
              matchupId: matchup.id,
              timeLabel,
            });
          } else {
            errors.push(
              `Failed to send reminder for league ${league.id} (${league.name})`,
            );
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`League ${league.id}: ${msg}`);
          LOGGER.error('Discord lineup reminder failed', {
            leagueId: league.id,
            error: msg,
          });
        }
      }

      return {
        leaguesChecked: leagues.length,
        remindersSent,
        errors,
      };
    },
  }),
);
