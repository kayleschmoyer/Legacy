/**
 * League domain — Shared type definitions and constants
 *
 * This module defines the core GraphQL types used across league,
 * team, and waiver resolvers.
 */
import type { Team as DbTeam } from '@legacy-sports/db-client';
import { PublicSchema } from '@legacy-sports/db-client';
import { and, eq, sql, sum } from 'drizzle-orm';
import { builder } from '../builder';
import { loadLeagueScoringConfig, ScoringConfigRef } from '../scoring';
import { AuthenticationError } from '../graphql-errors';

// Default roster positions for new leagues
// These represent a standard fantasy baseball roster configuration
export const DEFAULT_ROSTER_POSITIONS = [
  // Batting positions
  'C', // Catcher
  '1B', // First Base
  '2B', // Second Base
  '3B', // Third Base
  'SS', // Shortstop
  'OF', // Outfield (3 slots)
  'OF',
  'OF',
  'DH', // Designated Hitter
  // Pitching positions
  'SP', // Starting Pitcher (5 slots)
  'SP',
  'SP',
  'SP',
  'SP',
  'RP', // Relief Pitcher (3 slots)
  'RP',
  'RP',
  // Utility positions
  'IF', // Infield utility
  'XDH', // Extra DH/utility
] as const;

// League type - matches database schema with proper nullability
export const League = builder.objectRef<{
  id: number;
  name: string;
  owner: number;
  maxRosterSize: number;
  currentMatchup: number | null;
  /** Authoritative current week number — replaces the currentMatchup FK pointer. */
  currentWeek: number | null;
  draftStatus:
    | 'not-started'
    | 'queued'
    | 'in-progress'
    | 'paused'
    | 'completed';
  /** Lifecycle phase: pre-draft, active, or offseason */
  leaguePhase: 'pre-draft' | 'active' | 'offseason';
  inviteCode: string;
  playerPool: 'all' | 'nl' | 'al';
  weekAdvanceStatus?: 'idle' | 'queued' | 'processing' | 'success' | 'failed';
  waiverType?: 'standard' | 'faab';
  waiverEnabled?: boolean;
  faabBudgetDefault?: number;
  spStartsPerMatchup?: number;
  gamesPerMatchup?: number;
  minCareerGames?: number;
  minCareerSeasons?: number;
  totalMatchups?: number;
  playoffEnabled?: boolean;
  playoffFormat?: string;
  playoffMultiWeek?: boolean;
  lmNotes?: string | null;
  /** True for ephemeral mock-draft leagues (LS-470) */
  isMockDraft?: boolean;
  isPublic?: boolean;
  logoUrl?: string | null;
  bannerUrl?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  /** FK to the previous season's league — null for founding seasons */
  previousLeagueId?: number | null;
  /** ISO timestamp set when the league is retired (frozen) at season end */
  frozenAt?: string | null;
  /** ISO timestamp set when the league is frozen due to a subscription
   *  tier downgrade (distinct from frozenAt which marks season retirement). */
  tierFrozenAt?: string | null;
  /** Week number after which trades are locked (inclusive). Null means no deadline. */
  tradeDeadlineWeek?: number | null;
  /** Monotonic season counter (1 = founding, incremented on renewal) */
  seasonNumber?: number;
  // ── Salary cap settings (LS-634/LS-646) ─────────────────────────────
  salaryCapEnabled?: boolean;
  salaryCap?: number | null;
  salaryFloor?: number | null;
  luxuryTaxThreshold?: number | null;
  minSalary?: number;
  salaryEscalationPct?: number;
  salaryDecayPct?: number;
  auctionBudget?: number;
  auctionMinBid?: number;
  // Era filter settings
  eraFilter?: string;
  hofOnly?: boolean;
  customEraStartYear?: number | null;
  customEraEndYear?: number | null;
  userMembership?: {
    leagueId: number;
    userId: number;
    teamId: number | null;
    permissionLevel: 'general_manager' | 'assistant_manager' | 'commissioner';
  } | null;
}>('League');

League.implement({
  description: 'A fantasy sports league',
  fields: (t) => ({
    id: t.exposeInt('id'),
    name: t.exposeString('name'),
    owner: t.exposeInt('owner'),
    maxRosterSize: t.exposeInt('maxRosterSize'),
    currentMatchup: t.exposeInt('currentMatchup', { nullable: true }),
    currentWeek: t.exposeInt('currentWeek', { nullable: true }),
    draftStatus: t.exposeString('draftStatus'),
    leaguePhase: t.exposeString('leaguePhase', {
      description:
        'Lifecycle phase of the league: pre-draft (awaiting draft), ' +
        'active (season in play), offseason (post-renewal, before commissioner starts new season)',
    }),
    inviteCode: t.exposeString('inviteCode'),
    playerPool: t.exposeString('playerPool'),
    weekAdvanceStatus: t.exposeString('weekAdvanceStatus', { nullable: true }),
    waiverType: t.exposeString('waiverType', { nullable: true }),
    waiverEnabled: t.exposeBoolean('waiverEnabled', { nullable: true }),
    faabBudgetDefault: t.exposeInt('faabBudgetDefault', { nullable: true }),
    spStartsPerMatchup: t.exposeInt('spStartsPerMatchup', { nullable: true }),
    gamesPerMatchup: t.exposeInt('gamesPerMatchup', { nullable: true }),
    minCareerGames: t.exposeInt('minCareerGames', { nullable: true }),
    minCareerSeasons: t.exposeInt('minCareerSeasons', { nullable: true }),
    totalMatchups: t.exposeInt('totalMatchups', { nullable: true }),
    playoffEnabled: t.exposeBoolean('playoffEnabled', { nullable: true }),
    playoffFormat: t.exposeString('playoffFormat', { nullable: true }),
    playoffMultiWeek: t.exposeBoolean('playoffMultiWeek', { nullable: true }),
    lmNotes: t.exposeString('lmNotes', { nullable: true }),
    isMockDraft: t.exposeBoolean('isMockDraft', { nullable: true }),
    isPublic: t.exposeBoolean('isPublic', { nullable: true }),
    logoUrl: t.exposeString('logoUrl', { nullable: true }),
    bannerUrl: t.exposeString('bannerUrl', { nullable: true }),
    primaryColor: t.exposeString('primaryColor', { nullable: true }),
    secondaryColor: t.exposeString('secondaryColor', { nullable: true }),
    previousLeagueId: t.exposeInt('previousLeagueId', { nullable: true }),
    frozenAt: t.exposeString('frozenAt', { nullable: true }),
    tierFrozenAt: t.exposeString('tierFrozenAt', {
      nullable: true,
      description:
        'ISO timestamp set when this league was frozen due to a subscription ' +
        'tier downgrade. Null when the league is active or frozen for a ' +
        'different reason (season retirement). Cleared on re-upgrade or when ' +
        'the owner re-selects this league as one of their active free-tier leagues.',
    }),
    seasonNumber: t.exposeInt('seasonNumber', { nullable: true }),
    tradeDeadlineWeek: t.exposeInt('tradeDeadlineWeek', { nullable: true }),
    currentWeekNumber: t.int({
      nullable: true,
      description: 'The current active week number for the league',
      resolve: async (parent, _args, context) => {
        // currentWeek is the authoritative source; fall back to resolving via
        // the legacy currentMatchup FK for any league not yet migrated.
        if (parent.currentWeek != null) return parent.currentWeek;
        if (!parent.currentMatchup) return null;
        const matchup = await context.loaders.matchupsById.load(
          parent.currentMatchup,
        );
        return matchup?.weekNumber ?? null;
      },
    }),
    scoringProfile: t.field({
      type: ScoringConfigRef,
      resolve: async (parent, args, context) => {
        if (!context.user) {
          throw AuthenticationError(
            'Authentication required to fetch scoring settings',
          );
        }

        return loadLeagueScoringConfig(parent.id);
      },
    }),
    // ── Salary cap settings ──────────────────────────────────────────
    salaryCapEnabled: t.exposeBoolean('salaryCapEnabled', { nullable: true }),
    salaryCap: t.exposeInt('salaryCap', { nullable: true }),
    salaryFloor: t.exposeInt('salaryFloor', { nullable: true }),
    luxuryTaxThreshold: t.exposeInt('luxuryTaxThreshold', { nullable: true }),
    minSalary: t.exposeInt('minSalary', { nullable: true }),
    salaryEscalationPct: t.exposeInt('salaryEscalationPct', { nullable: true }),
    salaryDecayPct: t.exposeInt('salaryDecayPct', { nullable: true }),
    auctionBudget: t.exposeInt('auctionBudget', { nullable: true }),
    auctionMinBid: t.exposeInt('auctionMinBid', { nullable: true }),
    // Era filter settings
    eraFilter: t.exposeString('eraFilter', { nullable: true }),
    hofOnly: t.exposeBoolean('hofOnly', { nullable: true }),
    customEraStartYear: t.exposeInt('customEraStartYear', { nullable: true }),
    customEraEndYear: t.exposeInt('customEraEndYear', { nullable: true }),
    userMembership: t.field({
      type: LeagueMember,
      nullable: true,
      resolve: (parent) => parent.userMembership || null,
    }),
  }),
});

// Team type — several branding fields are optional in the parent since legacy
// resolvers use explicit column selections that may omit them; field resolvers
// default to null/false.
export const Team = builder.objectRef<
  Omit<
    DbTeam,
    | 'isLocked'
    | 'logoUrl'
    | 'primaryColor'
    | 'secondaryColor'
    | 'avatarUrl'
    | 'bannerUrl'
  > & {
    isLocked?: boolean | null;
    logoUrl?: string | null;
    primaryColor?: string | null;
    secondaryColor?: string | null;
    avatarUrl?: string | null;
    bannerUrl?: string | null;
    /** userId of the primary manager for this team (from leagueMembers). */
    managerId?: number | null;
    /** Computed: sum of team_members.salary. Null in non-salary-cap leagues. (LS-644) */
    totalPayroll?: number | null;
    /** Computed: league.salaryCap - totalPayroll. Null if cap is not enabled. (LS-644) */
    capSpace?: number | null;
  }
>('Team');

Team.implement({
  description: 'A team in a league',
  fields: (t) => ({
    id: t.exposeInt('id'),
    name: t.exposeString('name'),
    leagueId: t.exposeInt('leagueId'),
    divisionId: t.exposeInt('divisionId', { nullable: true }),
    waiverOrder: t.exposeInt('waiverOrder', { nullable: true }),
    faabBudget: t.exposeInt('faabBudget', { nullable: true }),
    isLocked: t.boolean({
      resolve: (parent) =>
        (parent as { isLocked?: boolean | null }).isLocked ?? false,
    }),
    logoUrl: t.string({
      nullable: true,
      resolve: (parent) => parent.logoUrl ?? null,
    }),
    primaryColor: t.string({
      nullable: true,
      resolve: (parent) => parent.primaryColor ?? null,
    }),
    secondaryColor: t.string({
      nullable: true,
      resolve: (parent) => parent.secondaryColor ?? null,
    }),
    avatarUrl: t.string({
      nullable: true,
      resolve: (parent) => parent.avatarUrl ?? null,
    }),
    bannerUrl: t.string({
      nullable: true,
      resolve: (parent) => parent.bannerUrl ?? null,
    }),
    createdAt: t.string({
      resolve: (team) => team.createdAt.toISOString(),
    }),
    updatedAt: t.string({
      resolve: (team) => team.updatedAt.toISOString(),
    }),
    managerId: t.int({
      nullable: true,
      description:
        'The userId of the primary manager for this team (from leagueMembers).',
      resolve: (parent) =>
        (parent as { managerId?: number | null }).managerId ?? null,
    }),
    totalPayroll: t.int({
      nullable: true,
      description:
        'Total salary cap payroll for this team (sum of team_members.salary). ' +
        'Null if the league does not have salary cap enabled.',
      resolve: async (parent, _args, context) => {
        const [capRow] = await context.db
          .select({ salaryCapEnabled: PublicSchema.leagues.salaryCapEnabled })
          .from(PublicSchema.leagues)
          .where(eq(PublicSchema.leagues.id, parent.leagueId))
          .limit(1);
        if (!capRow?.salaryCapEnabled) return null;
        const [row] = await context.db
          .select({
            total: sql<number>`COALESCE(${sum(PublicSchema.teamMembers.salary)}, 0)`,
          })
          .from(PublicSchema.teamMembers)
          .where(
            and(
              eq(PublicSchema.teamMembers.teamId, parent.id),
              eq(PublicSchema.teamMembers.leagueId, parent.leagueId),
            ),
          );
        return Number(row?.total ?? 0);
      },
    }),
    capSpace: t.int({
      nullable: true,
      description:
        'Remaining salary cap space for this team ' +
        '(league.salaryCap - totalPayroll). Null if cap is not enabled or no cap limit is set.',
      resolve: async (parent, _args, context) => {
        const [capRow] = await context.db
          .select({
            salaryCapEnabled: PublicSchema.leagues.salaryCapEnabled,
            salaryCap: PublicSchema.leagues.salaryCap,
          })
          .from(PublicSchema.leagues)
          .where(eq(PublicSchema.leagues.id, parent.leagueId))
          .limit(1);
        if (!capRow?.salaryCapEnabled || capRow.salaryCap == null) return null;
        const [row] = await context.db
          .select({
            total: sql<number>`COALESCE(${sum(PublicSchema.teamMembers.salary)}, 0)`,
          })
          .from(PublicSchema.teamMembers)
          .where(
            and(
              eq(PublicSchema.teamMembers.teamId, parent.id),
              eq(PublicSchema.teamMembers.leagueId, parent.leagueId),
            ),
          );
        const payroll = Number(row?.total ?? 0);
        return capRow.salaryCap - payroll;
      },
    }),
  }),
});

// LeagueMember type - no id field, teamId is nullable, enum for permissionLevel
export const LeagueMember = builder.objectRef<{
  leagueId: number;
  userId: number;
  teamId: number | null;
  permissionLevel: 'general_manager' | 'assistant_manager' | 'commissioner';
}>('LeagueMember');

LeagueMember.implement({
  description: 'A member of a league',
  fields: (t) => ({
    leagueId: t.exposeInt('leagueId'),
    userId: t.exposeInt('userId'),
    teamId: t.exposeInt('teamId', { nullable: true }),
    permissionLevel: t.exposeString('permissionLevel'),
    team: t.field({
      type: Team,
      nullable: true,
      resolve: async (parent, _args, context) => {
        if (!parent.teamId) return null;
        return context.loaders.teams.load(parent.teamId);
      },
    }),
    username: t.field({
      type: 'String',
      nullable: true,
      resolve: async (parent, _args, context) => {
        const user = await context.loaders.users.load(parent.userId);
        return user?.username ?? null;
      },
    }),
  }),
});

// LeaguePosition type
export const LeaguePosition = builder.objectRef<{
  id: number;
  leagueId: number;
  positionType: string;
}>('LeaguePosition');

LeaguePosition.implement({
  description: 'A position configuration in a league',
  fields: (t) => ({
    id: t.exposeInt('id'),
    leagueId: t.exposeInt('leagueId'),
    positionType: t.exposeString('positionType'),
  }),
});

// TeamMember type
export const TeamMember = builder.objectRef<{
  id: number;
  teamId: number | null;
  leagueId: number;
  playerId: number;
  positionId: number | null;
  onTradeBlock: boolean;
  /** Current salary cap hit. Null in non-salary-cap leagues. (LS-634) */
  salary?: number | null;
  /** Free-text asking price shown on the trade block. (LS-1814) */
  askingPrice?: string | null;
  /** Optional custom nickname for this player on this roster. (LS-1813) */
  nickname?: string | null;
}>('TeamMember');

TeamMember.implement({
  description: 'A member of a team',
  fields: (t) => ({
    id: t.exposeInt('id'),
    teamId: t.exposeInt('teamId', { nullable: true }),
    leagueId: t.exposeInt('leagueId'),
    playerId: t.exposeInt('playerId'),
    positionId: t.exposeInt('positionId', { nullable: true }),
    onTradeBlock: t.exposeBoolean('onTradeBlock'),
    salary: t.int({
      nullable: true,
      description:
        'Current salary cap hit for this roster slot. Null in non-salary-cap leagues.',
      resolve: (parent) =>
        (parent as { salary?: number | null }).salary ?? null,
    }),
    askingPrice: t.string({
      nullable: true,
      description:
        'Free-text asking price displayed on the trade block listing. Null when not set.',
      resolve: (parent) =>
        (parent as { askingPrice?: string | null }).askingPrice ?? null,
    }),
    nickname: t.string({
      nullable: true,
      description:
        'Optional custom nickname for this player on this roster. (LS-1813)',
      resolve: (parent) =>
        (parent as { nickname?: string | null }).nickname ?? null,
    }),
    player: t.field({
      type: 'Player',
      nullable: true,
      resolve: async (parent, _args, context) => {
        return context.loaders.players.load(parent.playerId);
      },
    }),
  }),
});
export const CommissionerAuditLog = builder.objectRef<{
  id: number;
  leagueId: number;
  userId: number;
  action: string;
  targetType: string | null;
  targetId: number | null;
  details: Record<string, unknown> | null;
  reason: string | null;
  createdAt: Date;
}>('CommissionerAuditLog');

CommissionerAuditLog.implement({
  description: 'An audit-trail entry for a commissioner action',
  fields: (t) => ({
    id: t.exposeInt('id'),
    leagueId: t.exposeInt('leagueId'),
    userId: t.exposeInt('userId'),
    action: t.exposeString('action'),
    targetType: t.exposeString('targetType', { nullable: true }),
    targetId: t.exposeInt('targetId', { nullable: true }),
    reason: t.exposeString('reason', { nullable: true }),
    createdAt: t.string({
      resolve: (log) => log.createdAt.toISOString(),
    }),
  }),
});
