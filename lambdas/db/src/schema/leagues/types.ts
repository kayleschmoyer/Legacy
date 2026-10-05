/**
 * League domain — Shared type definitions and constants
 *
 * This module defines the core GraphQL types used across league,
 * team, and waiver resolvers.
 */
import type {
  KeeperSettings as DbKeeperSettings,
  Team as DbTeam,
} from '@legacy-sports/db-client';
import { builder } from '../builder';
import { loadLeagueScoringConfig, ScoringConfigRef } from '../scoring';
import { AuthenticationError } from '../graphql-errors';
import type { RosterLimitStatus } from '../../services/roster-service';

// Sport kind enum (LS-4628) — discriminator for multi-sport leagues. Mirrors
// the `sport_kind` Postgres enum. Lowercase values match the DB enum directly
// so resolvers can pass the value through without translation.
export const SportKindEnum = builder.enumType('Sport', {
  values: ['baseball', 'football'] as const,
  description: 'Sport for a league (baseball or football).',
});

// Defensive format enum (LS-255) — discriminator for football defensive scoring.
export const DefensiveFormatEnum = builder.enumType('DefensiveFormat', {
  values: ['dst', 'idp'] as const,
  description:
    'Defensive scoring format for football leagues: dst (team defense) or idp (individual defensive players).',
});

// Roster continuity enum (LS-8671) — how rosters carry across seasons.
// Mirrors the `roster_continuity` Postgres enum.
export const RosterContinuityEnum = builder.enumType('RosterContinuity', {
  values: ['redraft', 'keeper', 'dynasty'] as const,
  description:
    'How rosters carry across seasons: redraft (full reset, default), keeper (retain up to keeperCount players), or dynasty (full roster carries over).',
});

// Keeper settings (LS-8671) — commissioner-configured keeper rules stored on
// leagues.keeper_settings. Null unless rosterContinuity = 'keeper'.
export const KeeperSettings =
  builder.objectRef<DbKeeperSettings>('KeeperSettings');

KeeperSettings.implement({
  description:
    'Keeper-mode configuration for a league. Only present when rosterContinuity is keeper. (LS-8671)',
  fields: (t) => ({
    keeperCount: t.exposeInt('keeperCount', {
      description: 'Players each team may keep season-over-season (1-10).',
    }),
    // 'round-penalty' | 'auction-budget' — hyphenated values are not legal
    // GraphQL enum names, so this follows the selectionMethod string pattern.
    costModel: t.exposeString('costModel', {
      description:
        "Cost model applied to kept players: 'round-penalty' (forfeit the round the player was drafted in last season; standard drafts) or 'auction-budget' (deduct a configured amount from the team budget; auction drafts).",
    }),
    maxConsecutiveKeeps: t.exposeInt('maxConsecutiveKeeps', {
      nullable: true,
      description:
        'Seasons in a row the same player may be kept. Null means unlimited.',
    }),
    rookieExempt: t.exposeBoolean('rookieExempt', {
      description: 'When true, rookies do not count against keeper limits.',
    }),
  }),
});

export {
  DEFAULT_BASEBALL_ROSTER_POSITIONS as DEFAULT_ROSTER_POSITIONS,
  DEFAULT_FOOTBALL_ROSTER_POSITIONS,
  DEFAULT_ROSTER_POSITIONS_BY_SPORT,
  getDefaultRosterPositions,
} from '@legacy-sports/utils';

// League type - matches database schema with proper nullability
export const League = builder.objectRef<{
  id: number;
  name: string;
  owner: number;
  /** Sport for this league. Defaults to 'baseball' when the resolver's
   *  parent select did not include it — every league has a non-null value
   *  in the DB (LS-4628). */
  sport?: 'baseball' | 'football';
  /** Defensive scoring format for football leagues (LS-246/LS-257).
   *  'dst' = team D/ST, 'idp' = Individual Defensive Players.
   *  Null for baseball leagues. */
  defensiveFormat?: 'dst' | 'idp' | null;
  /** Draft selection method: 'standard' | 'auction' | 'random'. Sourced from
   *  the league's `drafts` row, not the `leagues` table. Null when the
   *  league has no draft yet. (LS-9617) */
  selectionMethod?: 'standard' | 'auction' | 'random' | null;
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
  inviteCode: string | null;
  playerPool: 'all' | 'nl' | 'al' | 'nfl' | 'afc' | 'nfc';
  weekAdvanceStatus?: 'idle' | 'queued' | 'processing' | 'success' | 'failed';
  waiverType?: 'standard' | 'faab';
  waiverEnabled?: boolean;
  faabBudgetDefault?: number;
  pitcherStartsPerMatchup?: number;
  gamesPerMatchup?: number;
  minCareerGames?: number;
  minCareerSeasons?: number;
  totalMatchups?: number;
  playoffEnabled?: boolean;
  playoffFormat?: string;
  playoffMultiWeek?: boolean;
  /** Premium scoring option (LS-6344): standings expose a median W-L record
   *  alongside head-to-head, computed against each week's league median. */
  medianGameEnabled?: boolean;
  lmNotes?: string | null;
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
  // ── Roster continuity (LS-8671) ─────────────────────────────────────
  /** How rosters carry across seasons. Defaults to 'redraft' when the
   *  resolver's parent select did not include it. */
  rosterContinuity?: 'redraft' | 'keeper' | 'dynasty';
  /** Keeper configuration — null unless rosterContinuity = 'keeper'. */
  keeperSettings?: DbKeeperSettings | null;
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
  /** Premium setting: managers may trade draft slots pre-draft (LS-8675) */
  allowDraftSlotTrading?: boolean;
  // Era filter settings
  baseballEraFilter?: string;
  baseballHofOnly?: boolean;
  customEraStartYear?: number | null;
  customEraEndYear?: number | null;
  // Scheduling settings (LS-6062: needed to duplicate a league's settings)
  numberOfDivisions?: number;
  schedulingStrategy?: string;
  schedulingDivisionalWeightPct?: number | null;
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
    sport: t.field({
      type: SportKindEnum,
      description: 'Sport for this league (baseball or football). (LS-4628)',
      resolve: (parent) => parent.sport ?? 'baseball',
    }),
    defensiveFormat: t.field({
      type: DefensiveFormatEnum,
      nullable: true,
      description:
        'Defensive scoring format for football leagues: dst (team defense) or idp (individual defensive players). Null for baseball leagues. (LS-246/LS-257)',
      resolve: (parent) =>
        parent.sport === 'football'
          ? parent.defensiveFormat === 'idp'
            ? 'idp'
            : 'dst'
          : null,
    }),
    selectionMethod: t.exposeString('selectionMethod', {
      nullable: true,
      description:
        "Draft selection method: 'standard', 'auction', or 'random'. " +
        'Null when the league has no draft yet. (LS-9617)',
    }),
    maxRosterSize: t.exposeInt('maxRosterSize'),
    currentMatchup: t.exposeInt('currentMatchup', { nullable: true }),
    currentWeek: t.exposeInt('currentWeek', { nullable: true }),
    draftStatus: t.exposeString('draftStatus'),
    leaguePhase: t.exposeString('leaguePhase', {
      description:
        'Lifecycle phase of the league: pre-draft (awaiting draft), ' +
        'active (season in play), offseason (post-renewal, before commissioner starts new season)',
    }),
    inviteCode: t.string({
      nullable: true,
      description:
        'League invite code. Null for non-members — only league members and the owner receive this value.',
      resolve: (parent, _args, context) => {
        if (!context.user) return null;
        // userMembership === null means getLeagueById explicitly found no membership for this user
        if (parent.userMembership === null) return null;
        return parent.inviteCode || null;
      },
    }),
    playerPool: t.exposeString('playerPool'),
    weekAdvanceStatus: t.exposeString('weekAdvanceStatus', { nullable: true }),
    waiverType: t.exposeString('waiverType', { nullable: true }),
    waiverEnabled: t.exposeBoolean('waiverEnabled', { nullable: true }),
    faabBudgetDefault: t.exposeInt('faabBudgetDefault', { nullable: true }),
    pitcherStartsPerMatchup: t.exposeInt('pitcherStartsPerMatchup', {
      nullable: true,
    }),
    gamesPerMatchup: t.exposeInt('gamesPerMatchup', { nullable: true }),
    minCareerGames: t.exposeInt('minCareerGames', { nullable: true }),
    minCareerSeasons: t.exposeInt('minCareerSeasons', { nullable: true }),
    totalMatchups: t.exposeInt('totalMatchups', { nullable: true }),
    playoffEnabled: t.exposeBoolean('playoffEnabled', { nullable: true }),
    playoffFormat: t.exposeString('playoffFormat', { nullable: true }),
    playoffMultiWeek: t.exposeBoolean('playoffMultiWeek', { nullable: true }),
    medianGameEnabled: t.exposeBoolean('medianGameEnabled', {
      nullable: true,
    }),
    lmNotes: t.exposeString('lmNotes', { nullable: true }),
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
    // ── Roster continuity (LS-8671) ──────────────────────────────────
    rosterContinuity: t.field({
      type: RosterContinuityEnum,
      description:
        'How rosters carry across seasons. Defaults to redraft. (LS-8671)',
      resolve: (parent) => parent.rosterContinuity ?? 'redraft',
    }),
    keeperSettings: t.field({
      type: KeeperSettings,
      nullable: true,
      description:
        'Keeper-mode configuration. Null unless rosterContinuity is keeper. (LS-8671)',
      resolve: (parent) => parent.keeperSettings ?? null,
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
    allowDraftSlotTrading: t.exposeBoolean('allowDraftSlotTrading', {
      nullable: true,
    }),
    // Era filter settings
    eraFilter: t.exposeString('baseballEraFilter', { nullable: true }),
    baseballHofOnly: t.exposeBoolean('baseballHofOnly', { nullable: true }),
    customEraStartYear: t.exposeInt('customEraStartYear', { nullable: true }),
    customEraEndYear: t.exposeInt('customEraEndYear', { nullable: true }),
    // Scheduling settings (LS-6062: needed to duplicate a league's settings)
    numberOfDivisions: t.exposeInt('numberOfDivisions', { nullable: true }),
    schedulingStrategy: t.exposeString('schedulingStrategy', {
      nullable: true,
    }),
    schedulingDivisionalWeightPct: t.exposeInt(
      'schedulingDivisionalWeightPct',
      { nullable: true },
    ),
    userMembership: t.field({
      type: LeagueMember,
      nullable: true,
      resolve: (parent) => parent.userMembership || null,
    }),
  }),
});

// Roster-limit lock state for a team (LS-10477). A team over the limit may
// only release players until it is back at or below `maxRosterSize`.
export const RosterLimitStatusType = builder
  .objectRef<RosterLimitStatus>('RosterLimitStatus')
  .implement({
    description:
      "A team's roster size relative to the league roster limit. When isOverLimit is true the team is locked from every roster move except releasing players.",
    fields: (t) => ({
      rosterSize: t.exposeInt('rosterSize', { nullable: false }),
      maxRosterSize: t.exposeInt('maxRosterSize', { nullable: false }),
      isOverLimit: t.exposeBoolean('isOverLimit', { nullable: false }),
      playersToRelease: t.exposeInt('playersToRelease', {
        nullable: false,
        description:
          'How many players the team must release to get back to the limit (0 when not over).',
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
        const config = await context.loaders.leaguePayrollConfig.load(
          parent.leagueId,
        );
        if (!config?.salaryCapEnabled) return null;
        return context.loaders.teamPayroll.load({
          teamId: parent.id,
          leagueId: parent.leagueId,
        });
      },
    }),
    capSpace: t.int({
      nullable: true,
      description:
        'Remaining salary cap space for this team ' +
        '(league.salaryCap - totalPayroll). Null if cap is not enabled or no cap limit is set.',
      resolve: async (parent, _args, context) => {
        const config = await context.loaders.leaguePayrollConfig.load(
          parent.leagueId,
        );
        if (!config?.salaryCapEnabled || config.salaryCap == null) return null;
        const payroll = await context.loaders.teamPayroll.load({
          teamId: parent.id,
          leagueId: parent.leagueId,
        });
        return config.salaryCap - payroll;
      },
    }),
    rosterLimitStatus: t.field({
      type: RosterLimitStatusType,
      nullable: true,
      description:
        'Roster size vs. the league roster limit (LS-10477). Null if the league no longer exists.',
      resolve: (parent, _args, context) =>
        context.loaders.teamRosterLimitStatus.load({
          teamId: parent.id,
          leagueId: parent.leagueId,
        }),
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
    isLocked: t.boolean({
      nullable: true,
      description:
        "True when this player's team is in a started matchup for the " +
        'active week (status other than `scheduled`) and cannot be moved ' +
        '(LS-5955, LS-9405).',
      resolve: async (parent, _args, context) => {
        const { leagueId, teamId, playerId } = parent;
        if (!teamId) return false;
        const lockedSet =
          await context.loaders.lockedTeamMembers.load(leagueId);
        return lockedSet.has(`${playerId}:${teamId}`);
      },
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
  /** Null once the audited league has since been deleted (LS-6308) — the
   *  FK is ON DELETE SET NULL so the entry survives, but no longer points
   *  at a live league. */
  leagueId: number | null;
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
    leagueId: t.exposeInt('leagueId', { nullable: true }),
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
