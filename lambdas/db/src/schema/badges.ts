/**
 * Badge / Achievement System — GraphQL types, queries, and mutations (LS-298)
 *
 * Implements the gamification layer: users earn badges for historical
 * milestones (draft a Triple Crown winner, win with 1920s players, etc.).
 * Separate from the commissioner achievement *restrictions* defined in
 * achievements.ts.
 */
import {
  BADGE_DEFINITIONS,
  type BadgeDefinition,
  type BadgeProgressRecord,
  createBadgeService,
  type UserBadge,
} from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils/node';
import { LOGGER } from '@legacy-sports/logging';
import { builder } from './builder';
import { AuthenticationError } from './graphql-errors';

// Module-level singleton (mirrors pattern in notifications.ts)
const badgeService = createBadgeService(getDbOptions());

// ─── GraphQL Object Types ─────────────────────────────────────────────────────

const BadgeDefinitionRef =
  builder.objectRef<BadgeDefinition>('BadgeDefinition');
BadgeDefinitionRef.implement({
  description: 'Metadata for a badge that can be earned in the system',
  fields: (t) => ({
    key: t.exposeString('key', {
      description: 'Unique identifier for the badge type',
    }),
    title: t.exposeString('title'),
    description: t.exposeString('description'),
    rarity: t.exposeString('rarity', {
      description: 'Rarity of the badge: common | rare | legendary',
    }),
    category: t.exposeString('category', {
      description: 'Category of the badge: draft | matchup | roster | league',
    }),
    scope: t.exposeString('scope', {
      description: 'Whether the badge is global (cross-league) or per_league',
    }),
    repeatable: t.exposeBoolean('repeatable', {
      description: 'Whether this badge can be earned multiple times',
    }),
    progressTarget: t.int({
      nullable: true,
      resolve: (b) => b.progressTarget ?? null,
      description: 'Required progress count; null for instant badges',
    }),
  }),
});

const UserBadgeRef = builder.objectRef<UserBadge>('UserBadge');
UserBadgeRef.implement({
  description: 'A badge earned by a user',
  fields: (t) => ({
    id: t.exposeInt('id'),
    userId: t.exposeInt('userId'),
    badgeKey: t.exposeString('badgeKey', {
      description: 'Badge definition key',
    }),
    leagueId: t.exposeInt('leagueId', {
      nullable: true,
      description: 'League scope; null for global badges',
    }),
    teamId: t.exposeInt('teamId', {
      nullable: true,
      description: 'Team associated with the earn event',
    }),
    rarity: t.exposeString('rarity'),
    earnedAt: t.string({
      resolve: (b) => b.earnedAt.toISOString(),
      description: 'ISO 8601 timestamp when the badge was earned',
    }),
    definition: t.field({
      type: BadgeDefinitionRef,
      nullable: true,
      resolve: (b) => b.definition,
      description: 'Full badge definition metadata',
    }),
  }),
});

const BadgeProgressRef =
  builder.objectRef<BadgeProgressRecord>('BadgeProgress');
BadgeProgressRef.implement({
  description: 'Progress toward a not-yet-earned multi-step badge',
  fields: (t) => ({
    id: t.exposeInt('id'),
    userId: t.exposeInt('userId'),
    badgeKey: t.exposeString('badgeKey'),
    leagueId: t.exposeInt('leagueId', { nullable: true }),
    progressValue: t.exposeInt('progressValue', {
      description: 'Current progress count',
    }),
    progressTarget: t.exposeInt('progressTarget', {
      description: 'Target required to earn the badge',
    }),
    definition: t.field({
      type: BadgeDefinitionRef,
      nullable: true,
      resolve: (rec) =>
        BADGE_DEFINITIONS.find((b) => b.key === rec.badgeKey) ?? null,
      description: 'Badge definition for this progress record',
    }),
  }),
});

const EvaluateBadgesResultRef = builder.objectRef<{
  awarded: { userId: number; badgeKey: string }[];
}>('EvaluateBadgesResult');
EvaluateBadgesResultRef.implement({
  description: 'Result of a badge evaluation run',
  fields: (t) => ({
    awardedCount: t.int({
      resolve: (r) => r.awarded.length,
      description: 'Number of new badges awarded',
    }),
    awardedBadgeKeys: t.stringList({
      resolve: (r) => [...new Set(r.awarded.map((a) => a.badgeKey))],
      description: 'De-duplicated list of badge keys that were newly awarded',
    }),
  }),
});

// ─── Queries ──────────────────────────────────────────────────────────────────

/** All available badge definitions */
builder.queryField('allBadgeDefinitions', (t) =>
  t.field({
    type: [BadgeDefinitionRef],
    description: 'List all badge definitions available in the system',
    resolve: () => [...BADGE_DEFINITIONS],
  }),
);

/** Badges earned by a user, optionally filtered to a league */
builder.queryField('userBadges', (t) =>
  t.field({
    type: [UserBadgeRef],
    description:
      'Return earned badges for a user, optionally filtered to a specific league',
    args: {
      userId: t.arg.int({ required: true }),
      leagueId: t.arg.int({ required: false }),
    },
    resolve: async (_root, { userId, leagueId }) => {
      return badgeService.getUserBadges(userId, leagueId ?? null);
    },
  }),
);

/** Badges associated with a team in a league */
builder.queryField('teamBadges', (t) =>
  t.field({
    type: [UserBadgeRef],
    description: 'Return earned badges for a team in a league',
    args: {
      teamId: t.arg.int({ required: true }),
      leagueId: t.arg.int({ required: true }),
    },
    resolve: async (_root, { teamId, leagueId }) => {
      return badgeService.getTeamBadges(teamId, leagueId);
    },
  }),
);

/** Badge progress records for a user */
builder.queryField('userBadgeProgress', (t) =>
  t.field({
    type: [BadgeProgressRef],
    description:
      'Return progress records for in-progress multi-step badges for a user',
    args: {
      userId: t.arg.int({ required: true }),
      leagueId: t.arg.int({ required: false }),
    },
    resolve: async (_root, { userId, leagueId }) => {
      return badgeService.getUserBadgeProgress(userId, leagueId ?? null);
    },
  }),
);

// ─── Mutations ────────────────────────────────────────────────────────────────

/**
 * Evaluate and award draft-based badges after a draft completes.
 * Intended to be called by the system / commissioner after draft_status → 'completed'.
 */
builder.mutationField('evaluateDraftBadges', (t) =>
  t.field({
    type: EvaluateBadgesResultRef,
    description:
      'Evaluate and award all eligible draft-based badges for a league. ' +
      'Call when a draft completes. Requires authentication.',
    args: {
      leagueId: t.arg.int({ required: true }),
    },
    resolve: async (_root, { leagueId }, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }

      LOGGER.info('Evaluating draft badges', {
        leagueId,
        userId: context.user.id,
      });
      const awarded = await badgeService.evaluateDraftBadges(leagueId);

      LOGGER.info('Draft badge evaluation complete', {
        leagueId,
        awardedCount: awarded.length,
      });

      return { awarded };
    },
  }),
);

/**
 * Evaluate and award matchup-based badges after a matchup completes.
 * Intended to be called by the stats lambda / game-selection lambda.
 */
builder.mutationField('evaluateMatchupBadges', (t) =>
  t.field({
    type: EvaluateBadgesResultRef,
    description:
      'Evaluate and award all eligible matchup-based badges for a completed matchup. ' +
      'Call when a matchup status transitions to completed. Requires authentication.',
    args: {
      matchupId: t.arg.int({ required: true }),
    },
    resolve: async (_root, { matchupId }, context) => {
      if (!context.user && !context.isSystemRequest) {
        throw AuthenticationError();
      }

      LOGGER.info('Evaluating matchup badges', { matchupId });
      const awarded = await badgeService.evaluateMatchupBadges(matchupId);

      LOGGER.info('Matchup badge evaluation complete', {
        matchupId,
        awardedCount: awarded.length,
      });

      return { awarded };
    },
  }),
);

/**
 * Award the league champion badge to a team's owner.
 * Called when the playoff champion is determined.
 */
builder.mutationField('awardLeagueChampionBadge', (t) =>
  t.field({
    type: 'Boolean',
    description:
      'Award the League Champion badge to the winning team owner. ' +
      'Requires commissioner / system access.',
    args: {
      leagueId: t.arg.int({ required: true }),
      teamId: t.arg.int({ required: true }),
      userId: t.arg.int({ required: true }),
    },
    resolve: async (_root, { leagueId, teamId, userId }, context) => {
      if (!context.user && !context.isSystemRequest) {
        throw AuthenticationError();
      }

      await badgeService.awardLeagueChampion(userId, teamId, leagueId);

      LOGGER.info('League champion badge awarded', {
        leagueId,
        teamId,
        userId,
      });

      return true;
    },
  }),
);

/**
 * Award playoff appearance badges to all qualifying teams in a league.
 */
builder.mutationField('awardPlayoffAppearanceBadges', (t) =>
  t.field({
    type: 'Boolean',
    description:
      'Award Playoff Appearance badges to all teams that qualified for the playoffs.',
    args: {
      leagueId: t.arg.int({ required: true }),
      teamIds: t.arg.intList({ required: true }),
    },
    resolve: async (_root, { leagueId, teamIds }, context) => {
      if (!context.user && !context.isSystemRequest) {
        throw AuthenticationError();
      }

      await badgeService.awardPlayoffAppearances(leagueId, teamIds);

      LOGGER.info('Playoff appearance badges awarded', {
        leagueId,
        teamCount: teamIds.length,
      });

      return true;
    },
  }),
);
