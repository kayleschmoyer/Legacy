import { and, desc, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import { DbOptions } from '@legacy-sports/utils';
import { LOGGER } from '@legacy-sports/logging';
import { runWithPublicClient } from '../client/Helpers';
import { PublicSchema } from '../client/PublicDbClient';

// ─── Badge Catalog ────────────────────────────────────────────────────────────

export type BadgeRarity = 'common' | 'rare' | 'legendary';
export type BadgeCategory = 'draft' | 'matchup' | 'roster' | 'league';
export type BadgeScope = 'global' | 'per_league';

export interface BadgeDefinition {
  key: string;
  title: string;
  description: string;
  rarity: BadgeRarity;
  category: BadgeCategory;
  scope: BadgeScope;
  /** Whether this badge can be earned multiple times (e.g., for different leagues) */
  repeatable: boolean;
  progressTarget?: number;
}

export const BADGE_DEFINITIONS: readonly BadgeDefinition[] = [
  // ── Common / Global ───────────────────────────────────────────────────
  {
    key: 'first_draft',
    title: 'First Draft',
    description: 'Completed your first draft.',
    rarity: 'common',
    category: 'draft',
    scope: 'global',
    repeatable: false,
  },
  {
    key: 'first_matchup',
    title: 'In the Game',
    description: 'Completed your first matchup.',
    rarity: 'common',
    category: 'matchup',
    scope: 'global',
    repeatable: false,
  },
  {
    key: 'first_win',
    title: 'First Victory',
    description: 'Won your first matchup.',
    rarity: 'common',
    category: 'matchup',
    scope: 'global',
    repeatable: false,
  },
  // ── Common / Per-league ───────────────────────────────────────────────
  {
    key: 'playoff_appearance',
    title: 'Playoff Bound',
    description: 'Made the playoffs in a league.',
    rarity: 'common',
    category: 'league',
    scope: 'per_league',
    repeatable: false,
  },
  // ── Rare / Per-league ─────────────────────────────────────────────────
  {
    key: 'triple_crown_drafter',
    title: 'Triple Crown Talent Scout',
    description:
      'Drafted a player who posted a Triple Crown-calibre season (40+ HR, 130+ RBI, .350+ BA in one season).',
    rarity: 'rare',
    category: 'draft',
    scope: 'per_league',
    repeatable: false,
  },
  {
    key: 'golden_era',
    title: 'Golden Era',
    description:
      'Win a matchup with a roster composed entirely of players whose careers overlapped the 1920s.',
    rarity: 'rare',
    category: 'matchup',
    scope: 'per_league',
    repeatable: false,
  },
  {
    key: 'dominant_victory',
    title: 'Dominant Victory',
    description: 'Won a matchup by 50 or more points.',
    rarity: 'rare',
    category: 'matchup',
    scope: 'per_league',
    repeatable: false,
  },
  {
    key: 'full_hof_roster',
    title: 'Hall of Fame Roster',
    description: 'Rostered 5 or more Hall of Famers simultaneously.',
    rarity: 'rare',
    category: 'roster',
    scope: 'per_league',
    repeatable: false,
  },
  {
    key: 'dynasty_builder',
    title: 'Dynasty Builder',
    description: 'Won 3 matchups in a row.',
    rarity: 'rare',
    category: 'matchup',
    scope: 'per_league',
    repeatable: false,
    progressTarget: 3,
  },
  // ── Legendary / Per-league ────────────────────────────────────────────
  {
    key: 'league_champion',
    title: 'League Champion',
    description: 'Won the league championship.',
    rarity: 'legendary',
    category: 'league',
    scope: 'per_league',
    repeatable: false,
  },
  {
    key: 'undefeated_run',
    title: 'Undefeated Run',
    description: 'Won 5 or more matchups in a row.',
    rarity: 'legendary',
    category: 'matchup',
    scope: 'per_league',
    repeatable: false,
    progressTarget: 5,
  },
  {
    key: 'greatest_margin',
    title: 'Greatest Margin',
    description: 'Won a matchup by 100 or more points.',
    rarity: 'legendary',
    category: 'matchup',
    scope: 'per_league',
    repeatable: false,
  },
  {
    key: 'all_hof_team',
    title: 'All Hall of Fame',
    description: 'Win a matchup with an all-Hall-of-Fame roster.',
    rarity: 'legendary',
    category: 'matchup',
    scope: 'per_league',
    repeatable: false,
  },
] as const;

export const BADGE_DEFINITION_MAP = new Map<string, BadgeDefinition>(
  BADGE_DEFINITIONS.map((b) => [b.key, b]),
);

// ─── Shape types ──────────────────────────────────────────────────────────────

export interface UserBadge {
  id: number;
  userId: number;
  badgeKey: string;
  leagueId: number | null;
  teamId: number | null;
  rarity: string;
  metadata: Record<string, unknown>;
  earnedAt: Date;
  definition: BadgeDefinition | null;
}

export interface BadgeProgressRecord {
  id: number;
  userId: number;
  badgeKey: string;
  leagueId: number | null;
  progressValue: number;
  progressTarget: number;
}

export interface AwardedBadgeResult {
  badgeKey: string;
  alreadyHeld: boolean;
  badge: UserBadge | null;
}

// ─── Service class ────────────────────────────────────────────────────────────

export class BadgeService {
  constructor(private options: DbOptions) {}

  // ── Queries ────────────────────────────────────────────────────────────

  async getUserBadges(
    userId: number,
    leagueId?: number | null,
  ): Promise<UserBadge[]> {
    return runWithPublicClient(this.options, async (db) => {
      const where =
        leagueId != null
          ? and(
              eq(PublicSchema.userBadges.userId, userId),
              eq(PublicSchema.userBadges.leagueId, leagueId),
            )
          : eq(PublicSchema.userBadges.userId, userId);

      const rows = await db
        .select()
        .from(PublicSchema.userBadges)
        .where(where)
        .orderBy(desc(PublicSchema.userBadges.earnedAt));

      return rows.map(toUserBadge);
    });
  }

  async getTeamBadges(teamId: number, leagueId: number): Promise<UserBadge[]> {
    return runWithPublicClient(this.options, async (db) => {
      const rows = await db
        .select()
        .from(PublicSchema.userBadges)
        .where(
          and(
            eq(PublicSchema.userBadges.teamId, teamId),
            eq(PublicSchema.userBadges.leagueId, leagueId),
          ),
        )
        .orderBy(desc(PublicSchema.userBadges.earnedAt));

      return rows.map(toUserBadge);
    });
  }

  async getUserBadgeProgress(
    userId: number,
    leagueId?: number | null,
  ): Promise<BadgeProgressRecord[]> {
    return runWithPublicClient(this.options, async (db) => {
      const where =
        leagueId != null
          ? and(
              eq(PublicSchema.badgeProgress.userId, userId),
              eq(PublicSchema.badgeProgress.leagueId, leagueId),
            )
          : eq(PublicSchema.badgeProgress.userId, userId);

      const rows = await db
        .select()
        .from(PublicSchema.badgeProgress)
        .where(where);

      return rows.map((r) => ({
        id: Number(r.id),
        userId: Number(r.userId),
        badgeKey: r.badgeKey,
        leagueId: r.leagueId != null ? Number(r.leagueId) : null,
        progressValue: r.progressValue,
        progressTarget: r.progressTarget,
      }));
    });
  }

  // ── Award ──────────────────────────────────────────────────────────────

  /**
   * Award a badge to a user. Returns { alreadyHeld: true } if the user
   * already holds a non-repeatable badge for this (user, key, leagueId) tuple.
   */
  async awardBadge(
    userId: number,
    badgeKey: string,
    opts: {
      leagueId?: number | null;
      teamId?: number | null;
      metadata?: Record<string, unknown>;
    } = {},
  ): Promise<AwardedBadgeResult> {
    const def = BADGE_DEFINITION_MAP.get(badgeKey);
    if (!def) {
      throw new Error(`Unknown badge key: "${badgeKey}"`);
    }

    return runWithPublicClient(this.options, async (db) => {
      const { leagueId = null, teamId = null, metadata = {} } = opts;

      // Deduplication check for non-repeatable badges
      const existing = await db
        .select({ id: PublicSchema.userBadges.id })
        .from(PublicSchema.userBadges)
        .where(
          leagueId != null
            ? and(
                eq(PublicSchema.userBadges.userId, userId),
                eq(PublicSchema.userBadges.badgeKey, badgeKey),
                eq(PublicSchema.userBadges.leagueId, leagueId),
              )
            : and(
                eq(PublicSchema.userBadges.userId, userId),
                eq(PublicSchema.userBadges.badgeKey, badgeKey),
                isNull(PublicSchema.userBadges.leagueId),
              ),
        )
        .limit(1);

      if (existing.length > 0) {
        return { badgeKey, alreadyHeld: true, badge: null };
      }

      const [row] = await db
        .insert(PublicSchema.userBadges)
        .values({
          userId,
          badgeKey,
          leagueId: leagueId ?? null,
          teamId: teamId ?? null,
          rarity: def.rarity,
          metadata,
          earnedAt: new Date(),
        })
        .returning();

      LOGGER.info('Badge awarded', {
        userId,
        badgeKey,
        leagueId,
        rarity: def.rarity,
      });

      return { badgeKey, alreadyHeld: false, badge: toUserBadge(row) };
    });
  }

  // ── Progress ───────────────────────────────────────────────────────────

  /**
   * Increment progress for a counted badge. If progress reaches the target,
   * automatically awards the badge and optionally deletes the progress row.
   */
  async incrementProgress(
    userId: number,
    badgeKey: string,
    opts: {
      leagueId?: number | null;
      teamId?: number | null;
      metadata?: Record<string, unknown>;
      amount?: number;
    } = {},
  ): Promise<{ awarded: boolean; progressValue: number }> {
    const def = BADGE_DEFINITION_MAP.get(badgeKey);
    if (!def) {
      throw new Error(`Unknown badge key: "${badgeKey}"`);
    }

    const target = def.progressTarget ?? 1;
    const { leagueId = null, teamId = null, metadata = {}, amount = 1 } = opts;

    return runWithPublicClient(this.options, async (db) => {
      // Manual upsert since Drizzle doesn't support partial-index conflict targets
      const progressWhere =
        leagueId != null
          ? and(
              eq(PublicSchema.badgeProgress.userId, userId),
              eq(PublicSchema.badgeProgress.badgeKey, badgeKey),
              eq(PublicSchema.badgeProgress.leagueId, leagueId),
            )
          : and(
              eq(PublicSchema.badgeProgress.userId, userId),
              eq(PublicSchema.badgeProgress.badgeKey, badgeKey),
              isNull(PublicSchema.badgeProgress.leagueId),
            );

      const [existing] = await db
        .select()
        .from(PublicSchema.badgeProgress)
        .where(progressWhere)
        .limit(1);

      let newValue: number;
      let rowId: number;

      if (existing) {
        newValue = existing.progressValue + amount;
        const [updated] = await db
          .update(PublicSchema.badgeProgress)
          .set({
            progressValue: newValue,
            progressTarget: target,
            updatedAt: new Date(),
          })
          .where(eq(PublicSchema.badgeProgress.id, existing.id))
          .returning();
        rowId = Number(updated.id);
      } else {
        const [inserted] = await db
          .insert(PublicSchema.badgeProgress)
          .values({
            userId,
            badgeKey,
            leagueId: leagueId ?? null,
            progressValue: amount,
            progressTarget: target,
          })
          .returning();
        newValue = inserted.progressValue;
        rowId = Number(inserted.id);
      }

      if (newValue >= target) {
        const result = await this.awardBadge(userId, badgeKey, {
          leagueId,
          teamId,
          metadata,
        });
        if (!result.alreadyHeld) {
          // Clean up the progress row now that the badge is earned
          await db
            .delete(PublicSchema.badgeProgress)
            .where(eq(PublicSchema.badgeProgress.id, rowId));
        }
        return { awarded: !result.alreadyHeld, progressValue: newValue };
      }

      return { awarded: false, progressValue: newValue };
    });
  }

  /**
   * Reset progress for a badge (e.g., win streak broken — reset consecutive wins).
   */
  async resetProgress(
    userId: number,
    badgeKey: string,
    leagueId?: number | null,
  ): Promise<void> {
    return runWithPublicClient(this.options, async (db) => {
      const where =
        leagueId != null
          ? and(
              eq(PublicSchema.badgeProgress.userId, userId),
              eq(PublicSchema.badgeProgress.badgeKey, badgeKey),
              eq(PublicSchema.badgeProgress.leagueId, leagueId),
            )
          : and(
              eq(PublicSchema.badgeProgress.userId, userId),
              eq(PublicSchema.badgeProgress.badgeKey, badgeKey),
              isNull(PublicSchema.badgeProgress.leagueId),
            );

      await db
        .update(PublicSchema.badgeProgress)
        .set({ progressValue: 0, updatedAt: new Date() })
        .where(where);
    });
  }

  // ── Evaluation triggers ───────────────────────────────────────────────

  /**
   * Evaluate and award all eligible badges after a draft completes.
   * Call this when a league's draft_status transitions to 'completed'.
   *
   * @returns list of newly awarded badge keys per user
   */
  async evaluateDraftBadges(
    leagueId: number,
  ): Promise<{ userId: number; badgeKey: string }[]> {
    const awarded: { userId: number; badgeKey: string }[] = [];

    await runWithPublicClient(this.options, async (db) => {
      // Fetch all teams + their owners from this league
      const members = await db
        .select({
          userId: PublicSchema.leagueMembers.userId,
          teamId: PublicSchema.leagueMembers.teamId,
        })
        .from(PublicSchema.leagueMembers)
        .where(eq(PublicSchema.leagueMembers.leagueId, leagueId));

      for (const member of members) {
        if (member.teamId == null) continue;
        const userId = Number(member.userId);
        const teamId = Number(member.teamId);

        // ── first_draft (global one-time) ────────────────────────────────
        const r1 = await this.awardBadge(userId, 'first_draft', {});
        if (!r1.alreadyHeld) awarded.push({ userId, badgeKey: 'first_draft' });

        // ── triple_crown_drafter (per-league) ────────────────────────────
        // Check if the team has a drafted player with a Triple Crown-calibre season
        // (40+ HR, 130+ RBI, .350+ batting avg in the same season, AL/NL only)
        const tripleCrownCheck = await db
          .select({ cnt: sql<number>`COUNT(*)::int` })
          .from(PublicSchema.teamMembers)
          .innerJoin(
            PublicSchema.seasonBatting,
            eq(
              PublicSchema.seasonBatting.playerId,
              PublicSchema.teamMembers.playerId,
            ),
          )
          .where(
            and(
              eq(PublicSchema.teamMembers.teamId, teamId),
              eq(PublicSchema.teamMembers.leagueId, leagueId),
              gte(PublicSchema.seasonBatting.hr, 40),
              gte(PublicSchema.seasonBatting.rbi, 130),
              gte(PublicSchema.seasonBatting.battingAvg, 0.35),
              inArray(PublicSchema.seasonBatting.lgId, ['AL', 'NL']),
            ),
          )
          .limit(1);

        const tcCount = tripleCrownCheck[0]?.cnt ?? 0;
        if (tcCount > 0) {
          const r2 = await this.awardBadge(userId, 'triple_crown_drafter', {
            leagueId,
            teamId,
          });
          if (!r2.alreadyHeld)
            awarded.push({ userId, badgeKey: 'triple_crown_drafter' });
        }

        // ── full_hof_roster (per-league) ─────────────────────────────────
        const hofCount = await db
          .select({ cnt: sql<number>`COUNT(*)::int` })
          .from(PublicSchema.teamMembers)
          .innerJoin(
            PublicSchema.players,
            eq(PublicSchema.players.id, PublicSchema.teamMembers.playerId),
          )
          .where(
            and(
              eq(PublicSchema.teamMembers.teamId, teamId),
              eq(PublicSchema.teamMembers.leagueId, leagueId),
              eq(PublicSchema.players.hallOfFame, true),
            ),
          );

        if ((hofCount[0]?.cnt ?? 0) >= 5) {
          const r3 = await this.awardBadge(userId, 'full_hof_roster', {
            leagueId,
            teamId,
          });
          if (!r3.alreadyHeld)
            awarded.push({ userId, badgeKey: 'full_hof_roster' });
        }
      }
    });

    return awarded;
  }

  /**
   * Evaluate and award all eligible badges after a matchup completes.
   * Call this when a matchup's status transitions to 'completed'.
   *
   * @returns list of newly awarded badge keys per user
   */
  async evaluateMatchupBadges(
    matchupId: number,
  ): Promise<{ userId: number; badgeKey: string }[]> {
    const awarded: { userId: number; badgeKey: string }[] = [];

    await runWithPublicClient(this.options, async (db) => {
      // Load matchup
      const [matchup] = await db
        .select()
        .from(PublicSchema.matchups)
        .where(
          and(
            eq(PublicSchema.matchups.id, matchupId),
            eq(PublicSchema.matchups.status, 'completed'),
          ),
        )
        .limit(1);

      if (!matchup) return;

      const leagueId = Number(matchup.leagueId);
      const team1Id = Number(matchup.team1Id);
      const team2Id = Number(matchup.team2Id);
      const score1 = Number(matchup.team1Score ?? 0);
      const score2 = Number(matchup.team2Score ?? 0);

      // Identify winner and loser
      const winnerId =
        score1 > score2 ? team1Id : score1 < score2 ? team2Id : null;
      const loserId =
        score1 > score2 ? team2Id : score1 < score2 ? team1Id : null;
      const margin = Math.abs(score1 - score2);

      // Fetch owner userIds for both teams
      const owners = await db
        .select({
          userId: PublicSchema.leagueMembers.userId,
          teamId: PublicSchema.leagueMembers.teamId,
        })
        .from(PublicSchema.leagueMembers)
        .where(and(eq(PublicSchema.leagueMembers.leagueId, leagueId)));

      const ownerMap = new Map<number, number>(); // teamId → userId
      for (const o of owners) {
        if (o.teamId != null) ownerMap.set(Number(o.teamId), Number(o.userId));
      }

      const winnerUserId = winnerId ? ownerMap.get(winnerId) : null;
      const loserUserId = loserId ? ownerMap.get(loserId) : null;

      // ── first_matchup (global, both participants) ──────────────────────
      for (const teamId of [team1Id, team2Id]) {
        const userId = ownerMap.get(teamId);
        if (!userId) continue;
        const r = await this.awardBadge(userId, 'first_matchup', {});
        if (!r.alreadyHeld) awarded.push({ userId, badgeKey: 'first_matchup' });
      }

      if (winnerId == null || winnerUserId == null) return; // Tie — skip win-based badges

      // ── first_win (global) ────────────────────────────────────────────
      const rFw = await this.awardBadge(winnerUserId, 'first_win', {});
      if (!rFw.alreadyHeld)
        awarded.push({ userId: winnerUserId, badgeKey: 'first_win' });

      // ── dominant_victory (per-league, 50+ points) ─────────────────────
      if (margin >= 50) {
        const rDv = await this.awardBadge(winnerUserId, 'dominant_victory', {
          leagueId,
          teamId: winnerId,
          metadata: { matchupId, margin },
        });
        if (!rDv.alreadyHeld)
          awarded.push({ userId: winnerUserId, badgeKey: 'dominant_victory' });
      }

      // ── greatest_margin (per-league, 100+ points) ─────────────────────
      if (margin >= 100) {
        const rGm = await this.awardBadge(winnerUserId, 'greatest_margin', {
          leagueId,
          teamId: winnerId,
          metadata: { matchupId, margin },
        });
        if (!rGm.alreadyHeld)
          awarded.push({ userId: winnerUserId, badgeKey: 'greatest_margin' });
      }

      // ── dynasty_builder / undefeated_run (consecutive wins) ───────────
      // Winner: increment win streak
      const winStreak = await this.incrementProgress(
        winnerUserId,
        'dynasty_builder',
        {
          leagueId,
          teamId: winnerId,
          metadata: { matchupId },
        },
      );
      if (winStreak.awarded)
        awarded.push({ userId: winnerUserId, badgeKey: 'dynasty_builder' });

      const winStreak5 = await this.incrementProgress(
        winnerUserId,
        'undefeated_run',
        {
          leagueId,
          teamId: winnerId,
          metadata: { matchupId },
        },
      );
      if (winStreak5.awarded)
        awarded.push({ userId: winnerUserId, badgeKey: 'undefeated_run' });

      // Loser: reset win streaks
      if (loserUserId != null) {
        await this.resetProgress(loserUserId, 'dynasty_builder', leagueId);
        await this.resetProgress(loserUserId, 'undefeated_run', leagueId);
      }

      // ── golden_era (all 1920s players, per-league) ────────────────────
      // Players qualify if they have at least one season_batting or season_pitching
      // row with season between 1920 and 1929.
      const rosterWithEraCheck = await db
        .select({
          playerId: PublicSchema.teamMembers.playerId,
          has1920sBatting: sql<boolean>`
            EXISTS (
              SELECT 1 FROM public.season_batting sb
              WHERE sb.player_id = ${PublicSchema.teamMembers.playerId}
                AND sb.season BETWEEN 1920 AND 1929
            )`,
          has1920sPitching: sql<boolean>`
            EXISTS (
              SELECT 1 FROM public.season_pitching sp
              WHERE sp.player_id = ${PublicSchema.teamMembers.playerId}
                AND sp.season BETWEEN 1920 AND 1929
            )`,
        })
        .from(PublicSchema.teamMembers)
        .where(
          and(
            eq(PublicSchema.teamMembers.teamId, winnerId),
            eq(PublicSchema.teamMembers.leagueId, leagueId),
          ),
        );

      const hasRoster = rosterWithEraCheck.length > 0;
      const allIn1920s =
        hasRoster &&
        rosterWithEraCheck.every(
          (r) => r.has1920sBatting || r.has1920sPitching,
        );

      if (allIn1920s) {
        const rGe = await this.awardBadge(winnerUserId, 'golden_era', {
          leagueId,
          teamId: winnerId,
          metadata: { matchupId },
        });
        if (!rGe.alreadyHeld)
          awarded.push({ userId: winnerUserId, badgeKey: 'golden_era' });
      }

      // ── all_hof_team (all HOF roster, per-league) ─────────────────────
      const allHofResult = await db
        .select({
          total: sql<number>`COUNT(*)::int`,
          hofCount: sql<number>`COUNT(*) FILTER (WHERE ${PublicSchema.players.hallOfFame})::int`,
        })
        .from(PublicSchema.teamMembers)
        .innerJoin(
          PublicSchema.players,
          eq(PublicSchema.players.id, PublicSchema.teamMembers.playerId),
        )
        .where(
          and(
            eq(PublicSchema.teamMembers.teamId, winnerId),
            eq(PublicSchema.teamMembers.leagueId, leagueId),
          ),
        );

      const allHof = allHofResult[0];
      if (allHof && allHof.total > 0 && allHof.total === allHof.hofCount) {
        const rAh = await this.awardBadge(winnerUserId, 'all_hof_team', {
          leagueId,
          teamId: winnerId,
          metadata: { matchupId },
        });
        if (!rAh.alreadyHeld)
          awarded.push({ userId: winnerUserId, badgeKey: 'all_hof_team' });
      }
    });

    return awarded;
  }

  /**
   * Award the league_champion badge to the winning team's owner.
   * Call this when a playoff champion is determined.
   */
  async awardLeagueChampion(
    userId: number,
    teamId: number,
    leagueId: number,
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    await this.awardBadge(userId, 'league_champion', {
      leagueId,
      teamId,
      metadata,
    });

    // Also check playoff_appearance badge
    await this.awardBadge(userId, 'playoff_appearance', {
      leagueId,
      teamId,
    });
  }

  /**
   * Award the playoff_appearance badge to all teams that qualified for playoffs.
   */
  async awardPlayoffAppearances(
    leagueId: number,
    teamIds: number[],
  ): Promise<void> {
    await runWithPublicClient(this.options, async (db) => {
      // Get owner userIds for these teams
      const owners = await db
        .select({
          userId: PublicSchema.leagueMembers.userId,
          teamId: PublicSchema.leagueMembers.teamId,
        })
        .from(PublicSchema.leagueMembers)
        .where(eq(PublicSchema.leagueMembers.leagueId, leagueId));

      for (const { userId, teamId } of owners) {
        if (teamId == null) continue;
        if (!teamIds.includes(Number(teamId))) continue;
        await this.awardBadge(Number(userId), 'playoff_appearance', {
          leagueId,
          teamId: Number(teamId),
        });
      }
    });
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createBadgeService(options: DbOptions): BadgeService {
  return new BadgeService(options);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toUserBadge(
  row: typeof PublicSchema.userBadges.$inferSelect,
): UserBadge {
  const def = BADGE_DEFINITION_MAP.get(row.badgeKey) ?? null;
  return {
    id: Number(row.id),
    userId: Number(row.userId),
    badgeKey: row.badgeKey,
    leagueId: row.leagueId != null ? Number(row.leagueId) : null,
    teamId: row.teamId != null ? Number(row.teamId) : null,
    rarity: row.rarity,
    metadata: row.metadata ?? {},
    earnedAt: row.earnedAt,
    definition: def,
  };
}
