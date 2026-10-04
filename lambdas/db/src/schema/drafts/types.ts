/**
 * Draft domain — GraphQL type definitions
 */

import {
  DRAFT_RECOMMENDATION_SIGNALS,
  type DraftRecommendationSignal,
} from './draft-recommendation-signals';
import { builder } from '../builder';
import { SportKindEnum, Team } from '../leagues/types';
import { CareerBattingRef } from '../statistics';

/** `drafts.kind` (LS-10073). */
export const DraftKindEnum = builder.enumType('DraftKind', {
  values: {
    LEAGUE: { value: 'league' },
    MOCK: { value: 'mock' },
  } as const,
});

/** `drafts.mock_mode` (LS-10073). */
export const MockDraftModeEnum = builder.enumType('MockDraftMode', {
  values: {
    OFFLINE: {
      value: 'offline',
      description: 'Solo practice against AI seats.',
    },
    ONLINE: { value: 'online', description: 'A lobby other users can join.' },
  } as const,
});

/**
 * DraftPick - Represents a single draft pick
 */
export const DraftPick = builder.objectRef<{
  id: number;
  draftId: number;
  teamId: number | null;
  participantId: number;
  playerId: number;
  round: number;
  pickNumber: number;
  overallPick: number;
  pickedAt: Date;
}>('DraftPick');

DraftPick.implement({
  description: 'A single pick made during a draft',
  fields: (t) => ({
    id: t.exposeInt('id'),
    draftId: t.exposeInt('draftId'),
    teamId: t.exposeInt('teamId', {
      nullable: true,
      description:
        "The picking seat's league team. Null for a mock draft, whose seats " +
        'have no team — key on participantId instead (LS-10076).',
    }),
    participantId: t.exposeInt('participantId', {
      description:
        'The seat that made (or is on the clock for) this pick — ' +
        '`draft_participants.id`. Present for every draft kind (LS-10076).',
    }),
    playerId: t.exposeInt('playerId'),
    round: t.exposeInt('round'),
    pickNumber: t.exposeInt('pickNumber'),
    overallPick: t.exposeInt('overallPick'),
    pickedAt: t.string({
      resolve: (pick) => pick.pickedAt.toISOString(),
    }),
    team: t.field({
      type: Team,
      nullable: true,
      description: "The seat's league team. Null for a mock draft (LS-10076).",
      resolve: (parent, _args, context) => {
        if (parent.teamId === null) return null;
        const teamId = parent.teamId;
        return context.loaders.teams.load(teamId).then((team) => {
          if (!team) throw new Error(`Team ${teamId} not found`);
          return team;
        });
      },
    }),
    player: t.field({
      type: 'Player',
      nullable: true,
      description:
        'The drafted player. Enables the draft board to render pick names without a secondary lookup.',
      resolve: (parent, _args, context) => {
        return context.loaders.players.load(parent.playerId);
      },
    }),
    adp: t.int({
      nullable: true,
      description:
        "The drafted player's consensus rank — the same stack-rank ADP " +
        'DraftPlayer.adp reports for undrafted players, computed over the ' +
        'identical pool so the two cannot disagree. Exposed here because a ' +
        'player disappears from the available-player list the moment they are ' +
        'drafted, which left the board unable to say anything about a ' +
        'completed pick (LS-10096). Subtracting it from `overallPick` gives ' +
        "the pick's value: positive means the player fell to this pick, " +
        'negative means they went early.\n\n' +
        'Null when no rank is on file for the player. Real historical ADP ' +
        'data is not collected yet, so this is a routine state rather than an ' +
        'edge case, and it stays null rather than defaulting to 0 — a ' +
        'fabricated rank would become a fabricated pick value.',
      resolve: (parent, _args, context) => {
        return context.loaders.draftedPlayerAdp.load(
          `${parent.draftId}:${parent.playerId}`,
        );
      },
    }),
  }),
});

/**
 * Draft - Extended draft type with current pick tracking
 */
export const Draft = builder.objectRef<{
  id: number;
  leagueId: number | null;
  kind: 'league' | 'mock';
  status: string;
  sport: 'baseball' | 'football';
  mockMode: 'offline' | 'online' | null;
  controlAllTeams: boolean;
  isPublic: boolean;
  inviteCode: string | null;
  lobbyExpiresAt: Date | null;
  createdBy: number;
  draftMode: string;
  selectionMethod: string;
  draftOrder: string;
  currentPick: number;
  pickTimeLimitSeconds: number;
  currentPickDeadline: Date | null;
  draftStartedAt: Date | null;
  draftCompletedAt: Date | null;
  scheduledAt: Date | null;
  date: string | null;
  createdAt: Date;
  updatedAt: Date;
  autoPickDisabled: boolean;
}>('Draft');

Draft.implement({
  description: 'A draft: a league draft, or a league-less mock draft',
  fields: (t) => ({
    id: t.exposeInt('id'),
    leagueId: t.exposeInt('leagueId', {
      nullable: true,
      description: 'The owning league. Null for a mock draft (LS-10076).',
    }),
    kind: t.field({
      type: DraftKindEnum,
      resolve: (draft) => draft.kind,
    }),
    status: t.exposeString('status', {
      description:
        "Lifecycle status: 'not-started' | 'in-progress' | 'paused' | 'completed'.",
    }),
    sport: t.field({ type: SportKindEnum, resolve: (draft) => draft.sport }),
    mockMode: t.field({
      type: MockDraftModeEnum,
      nullable: true,
      description:
        'OFFLINE (solo vs AI) or ONLINE (lobby). Null for a league draft.',
      resolve: (draft) => draft.mockMode,
    }),
    controlAllTeams: t.exposeBoolean('controlAllTeams', {
      description:
        'Mock drafts only: the host makes every pick for every seat (LS-9253).',
    }),
    isPublic: t.exposeBoolean('isPublic', {
      description: 'Online mock drafts only: the lobby is joinable by id.',
    }),
    inviteCode: t.string({
      nullable: true,
      description:
        'Mock drafts only: the code others redeem via joinMockDraft. Only ' +
        'the host and seat holders can load a mock draft, so this is not ' +
        'exposed to anyone who could not already share it.',
      resolve: (draft) => draft.inviteCode,
    }),
    lobbyExpiresAt: t.string({
      nullable: true,
      description:
        'Online mock drafts only: when an unstarted lobby expires (24h after creation).',
      resolve: (draft) => draft.lobbyExpiresAt?.toISOString() ?? null,
    }),
    createdBy: t.exposeInt('createdBy', {
      description: 'The creator — for a mock draft, its host.',
    }),
    draftMode: t.exposeString('draftMode'),
    selectionMethod: t.exposeString('selectionMethod'),
    draftOrder: t.exposeString('draftOrder'),
    currentPick: t.exposeInt('currentPick'),
    pickTimeLimitSeconds: t.exposeInt('pickTimeLimitSeconds'),
    currentPickDeadline: t.string({
      nullable: true,
      resolve: (draft) => draft.currentPickDeadline?.toISOString() || null,
    }),
    draftStartedAt: t.string({
      nullable: true,
      resolve: (draft) => draft.draftStartedAt?.toISOString() || null,
    }),
    draftCompletedAt: t.string({
      nullable: true,
      resolve: (draft) => draft.draftCompletedAt?.toISOString() || null,
    }),
    scheduledAt: t.string({
      nullable: true,
      description:
        'ISO-8601 timestamp when the draft is scheduled to auto-start (LS-423). Null means no scheduled start.',
      resolve: (draft) => draft.scheduledAt?.toISOString() || null,
    }),
    date: t.exposeString('date', { nullable: true }),
    createdAt: t.string({
      resolve: (draft) => draft.createdAt.toISOString(),
    }),
    updatedAt: t.string({
      resolve: (draft) => draft.updatedAt.toISOString(),
    }),
    autoPickDisabled: t.exposeBoolean('autoPickDisabled', {
      description:
        'When true, the commissioner has disabled auto-pick for the entire draft. autoProcessDraftPicks will not fire and individual teams cannot enable auto-pick (LS-481).',
    }),
  }),
});

/**
 * CurrentDraftPick - Information about whose turn it is
 */
export const CurrentDraftPick = builder.objectRef<{
  draftId: number;
  teamId: number | null;
  participantId: number;
  round: number;
  pickNumber: number;
  overallPick: number;
  isComplete: boolean;
}>('CurrentDraftPick');

CurrentDraftPick.implement({
  description: 'Information about the current draft pick',
  fields: (t) => ({
    draftId: t.exposeInt('draftId'),
    teamId: t.exposeInt('teamId', {
      nullable: true,
      description:
        "The picking seat's league team. Null for a mock draft, whose seats " +
        'have no team — key on participantId instead (LS-10076).',
    }),
    participantId: t.exposeInt('participantId', {
      description:
        'The seat that made (or is on the clock for) this pick — ' +
        '`draft_participants.id`. Present for every draft kind (LS-10076).',
    }),
    round: t.exposeInt('round'),
    pickNumber: t.exposeInt('pickNumber'),
    overallPick: t.exposeInt('overallPick'),
    isComplete: t.exposeBoolean('isComplete'),
    team: t.field({
      type: Team,
      nullable: true,
      description: "The seat's league team. Null for a mock draft (LS-10076).",
      resolve: (parent, _args, context) => {
        if (parent.teamId === null) return null;
        const teamId = parent.teamId;
        return context.loaders.teams.load(teamId).then((team) => {
          if (!team) throw new Error(`Team ${teamId} not found`);
          return team;
        });
      },
    }),
  }),
});

/**
 * DraftPlayer - A player available (or drafted) in a draft context
 */
export const DraftPlayer = builder.objectRef<{
  id: number;
  firstName: string;
  lastName: string;
  brefId: string;
  hitterAvgPointsPerGame?: number | null;
  pitchingAvgPointsPerGame?: number | null;
  projectedMatchupPoints?: number | null;
  adp?: number | null;
}>('DraftPlayer');

DraftPlayer.implement({
  description: 'A player in the context of a draft',
  fields: (t) => ({
    id: t.exposeInt('id'),
    firstName: t.exposeString('firstName'),
    lastName: t.exposeString('lastName'),
    brefId: t.exposeString('brefId'),
    hitterAvgPointsPerGame: t.exposeFloat('hitterAvgPointsPerGame', {
      nullable: true,
      description:
        'Career hitter average points per game (batting + fielding score / career games)',
    }),
    pitchingAvgPointsPerGame: t.exposeFloat('pitchingAvgPointsPerGame', {
      nullable: true,
      description:
        'Career pitching average points per game (pitching score / career games)',
    }),
    projectedMatchupPoints: t.exposeFloat('projectedMatchupPoints', {
      nullable: true,
      description:
        'Projected fantasy points per matchup, accounting for the league schedule (hitter_avg_ppg * gamesPerMatchup + pitching_avg_ppg * pitcherStartsPerMatchup)',
    }),
    adp: t.exposeInt('adp', {
      nullable: true,
      description:
        "Stack-rank fallback for Average Draft Position: the player's 1-based " +
        "rank across the league's entire draftable pool by projected value, " +
        "using the league's customized scoring settings when it has ever " +
        'edited them (falling back to default scoring otherwise). Stable for ' +
        'the life of the draft — it does not renumber as other players are ' +
        'drafted, searched for, or filtered out of the current page. Real ' +
        'historical ADP data is not collected yet.',
    }),
    eligiblePositions: t.stringList({
      description:
        'List of positions this player is eligible to play (e.g. SP, RP, 1B, SS)',
      resolve: async (parent, _args, context) => {
        return context.loaders.eligiblePositions.load(parent.id);
      },
    }),
    club: t.string({
      nullable: true,
      description:
        "The franchise the player is most associated with (e.g. 'NYY', " +
        "'BRO'), derived from season rows as the club they played the most " +
        'games for, tie-broken by most recent season. This is the career ' +
        'franchise, not the present-day one: unlike `players.mlb_team` it is ' +
        'not restricted to the 30 current teams, so defunct and relocated ' +
        'clubs are represented. Null when no season rows are on file.',
      resolve: async (parent, _args, context) => {
        return context.loaders.playerClub.load(parent.id);
      },
    }),
    careerBatting: t.field({
      description: 'Career batting statistics for the player',
      type: CareerBattingRef,
      nullable: true,
      resolve: async (parent, _args, context) => {
        return context.loaders.careerBatting.load(parent.id);
      },
    }),
  }),
});

/**
 * DraftFootballPlayerStats — career football stat totals for the draft
 * board's table/card views (LS-9478). Football analogue of the baseball
 * GetDraftPlayerStats/GetDraftPitchingStats queries: unlike baseball,
 * football's box-score categories (passing/rushing/receiving/kicking) are
 * combined into a single row per player rather than split by batter/pitcher.
 *
 * Each field is null — never 0 — when the player has no row in that career
 * table, so the client can distinguish "measured zero" from "never
 * measured" and render an em-dash for the latter (LS-9473 fabricated-zero
 * postmortem).
 */
export const DraftFootballPlayerStats = builder.objectRef<{
  playerId: number;
  passYds: number | null;
  passTd: number | null;
  rushYds: number | null;
  rushTd: number | null;
  rec: number | null;
  recTd: number | null;
  fg: number | null;
}>('DraftFootballPlayerStats');

DraftFootballPlayerStats.implement({
  description:
    'Career football stat totals for a player, sourced from the career_football_* tables. Football analogue of GetDraftPlayerStats (LS-9478).',
  fields: (t) => ({
    playerId: t.exposeInt('playerId'),
    passYds: t.exposeInt('passYds', {
      nullable: true,
      description: 'career_football_passing.yds',
    }),
    passTd: t.exposeInt('passTd', {
      nullable: true,
      description: 'career_football_passing.td',
    }),
    rushYds: t.exposeInt('rushYds', {
      nullable: true,
      description: 'career_football_rushing.yds',
    }),
    rushTd: t.exposeInt('rushTd', {
      nullable: true,
      description: 'career_football_rushing.td',
    }),
    rec: t.exposeInt('rec', {
      nullable: true,
      description: 'career_football_receiving.rec',
    }),
    recTd: t.exposeInt('recTd', {
      nullable: true,
      description: 'career_football_receiving.td',
    }),
    fg: t.exposeInt('fg', {
      nullable: true,
      description: 'career_football_kicking.fgm',
    }),
  }),
});

/**
 * DraftTeamOrder - Represents a single team's draft slot position
 */
export const DraftTeamOrderEntry = builder.objectRef<{
  teamId: number;
  teamName: string;
  draftOrder: number;
}>('DraftTeamOrderEntry');

DraftTeamOrderEntry.implement({
  description: 'A team and its assigned slot in the draft order',
  fields: (t) => ({
    teamId: t.exposeInt('teamId'),
    teamName: t.exposeString('teamName'),
    draftOrder: t.exposeInt('draftOrder'),
  }),
});

/**
 * DraftTeamAutoPickStatus - Reports whether a team has auto-pick enabled (LS-439)
 */
export const DraftTeamAutoPickStatus = builder.objectRef<{
  teamId: number;
  autoPick: boolean;
}>('DraftTeamAutoPickStatus');

DraftTeamAutoPickStatus.implement({
  description: 'Auto-pick status for a team in a draft',
  fields: (t) => ({
    teamId: t.exposeInt('teamId'),
    autoPick: t.exposeBoolean('autoPick'),
  }),
});

// ── Update Draft Settings Types ──────────────────────────────────────────────

// Input type for updating draft settings before a draft starts
export const UpdateDraftSettingsInput = builder.inputType(
  'UpdateDraftSettingsInput',
  {
    fields: (t) => ({
      leagueId: t.int({ required: true }),
      draftMode: t.string({ required: false }), // 'live' | 'automated'
      selectionMethod: t.string({ required: false }), // 'standard' | 'auction' | 'random'
      draftOrder: t.string({ required: false }), // 'snake' | 'linear'
      playerPool: t.string({ required: false }), // 'all' | 'nl' | 'al'
      pickTimeLimitSeconds: t.int({ required: false }), // seconds per pick (default 120)
      // Era-based league settings (LS-295)
      eraFilter: t.string({ required: false }), // 'all' | 'dead_ball' | 'golden_age' | 'expansion' | 'free_agency' | 'steroid_era' | 'modern' | 'custom'
      baseballHofOnly: t.boolean({ required: false }), // restrict draft board to Hall of Famers only
      customEraStartYear: t.int({ required: false }), // commissioner-defined era start year
      customEraEndYear: t.int({ required: false }), // commissioner-defined era end year
      /** ISO-8601 datetime for when the draft should auto-start (LS-423). Null clears the schedule. */
      scheduledAt: t.string({ required: false }),
    }),
  },
);

/**
 * DraftRecommendationStat — a single stat pill label/value pair inside a recommendation
 */
export const DraftRecommendationStat = builder.objectRef<{
  label: string;
  value: string;
}>('DraftRecommendationStat');

DraftRecommendationStat.implement({
  description: 'A stat label/value pair displayed on a draft recommendation',
  fields: (t) => ({
    label: t.exposeString('label'),
    value: t.exposeString('value'),
  }),
});

/**
 * DraftRecommendationSignal — the labelled chip classifying why a
 * recommendation was surfaced (LS-9855). Derivation and precedence live in
 * draft-recommendation-signals.ts; keep the vocabulary there and here in step.
 */
export const DraftRecommendationSignalEnum = builder.enumType(
  'DraftRecommendationSignal',
  {
    description:
      'Why the Draft Intelligence algorithm surfaced a recommendation, as a short labelled chip: ROSTER_FIT (fills an empty or under-quota slot on your roster), POS_RUN (the pool at this position is nearly exhausted), TIER_BREAK (last player before a cliff in production at this position), or VALUE (no roster need, but top-of-pool production). Nullable — absent when none applies. (LS-9855)',
    values: DRAFT_RECOMMENDATION_SIGNALS,
  },
);

/**
 * DraftRecommendation — one player recommendation from the Draft Intelligence algorithm
 * (stat value 50% + positional need 30% + scarcity 20%)
 */
export const DraftRecommendation = builder.objectRef<{
  playerId: number;
  playerName: string;
  position: string;
  score: number;
  reason: string;
  signal?: DraftRecommendationSignal | null;
  topStats: Array<{ label: string; value: string }>;
}>('DraftRecommendation');

DraftRecommendation.implement({
  description:
    'A draft pick recommendation produced by the Draft Intelligence algorithm',
  fields: (t) => ({
    playerId: t.exposeInt('playerId'),
    playerName: t.exposeString('playerName'),
    position: t.exposeString('position'),
    score: t.exposeFloat('score'),
    reason: t.exposeString('reason'),
    // Nullable by design: the panel omits the chip entirely rather than
    // rendering a fabricated catch-all label (LS-9473 precedent).
    signal: t.field({
      type: DraftRecommendationSignalEnum,
      nullable: true,
      description:
        'Signal chip classifying why this player is recommended. Null when no signal applies; `reason` remains the human-readable rationale.',
      resolve: (rec) => rec.signal ?? null,
    }),
    topStats: t.field({
      type: [DraftRecommendationStat],
      resolve: (rec) => rec.topStats,
    }),
  }),
});

// Payload for draft settings update — returns the updated draft record
export const UpdateDraftSettingsPayload = builder.objectRef<{
  id: number;
  leagueId: number | null;
  draftMode: string;
  selectionMethod: string;
  draftOrder: string;
  currentPick: number;
  pickTimeLimitSeconds: number;
  draftStartedAt: Date | null;
  draftCompletedAt: Date | null;
  scheduledAt: Date | null;
  date: string | null;
  createdAt: Date;
  updatedAt: Date;
  playerPool: string;
}>('UpdateDraftSettingsPayload');

UpdateDraftSettingsPayload.implement({
  description: 'Result of updating draft settings',
  fields: (t) => ({
    id: t.exposeInt('id'),
    leagueId: t.exposeInt('leagueId', { nullable: true }),
    draftMode: t.exposeString('draftMode'),
    selectionMethod: t.exposeString('selectionMethod'),
    draftOrder: t.exposeString('draftOrder'),
    currentPick: t.exposeInt('currentPick'),
    playerPool: t.exposeString('playerPool'),
    pickTimeLimitSeconds: t.exposeInt('pickTimeLimitSeconds'),
    draftStartedAt: t.string({
      nullable: true,
      resolve: (payload) => payload.draftStartedAt?.toISOString() || null,
    }),
    draftCompletedAt: t.string({
      nullable: true,
      resolve: (payload) => payload.draftCompletedAt?.toISOString() || null,
    }),
    scheduledAt: t.string({
      nullable: true,
      resolve: (payload) => payload.scheduledAt?.toISOString() || null,
    }),
  }),
});

/**
 * DraftQueueEntry — one entry in a team's draft queue (LS-473).
 * Entries are ordered by `priority` ASC.
 */
export const DraftQueueEntry = builder.objectRef<{
  id: number;
  draftId: number;
  teamId: number | null;
  participantId: number | null;
  playerId: number;
  priority: number;
}>('DraftQueueEntry');

DraftQueueEntry.implement({
  description:
    "A prioritised entry in a team's draft queue. Auto-pick picks the first available entry before falling back to the FPG algorithm.",
  fields: (t) => ({
    id: t.exposeInt('id'),
    draftId: t.exposeInt('draftId'),
    teamId: t.exposeInt('teamId', {
      nullable: true,
      description:
        'Null for a mock draft, whose queue belongs to a seat (LS-10076).',
    }),
    participantId: t.exposeInt('participantId', {
      nullable: true,
      description:
        "The queue owner's seat. Null only for a league queue row written before LS-10073.",
    }),
    playerId: t.exposeInt('playerId'),
    priority: t.exposeInt('priority'),
    player: t.field({
      type: 'Player',
      nullable: true,
      resolve: (entry, _args, context) =>
        context.loaders.players.load(entry.playerId),
    }),
  }),
});

/**
 * MockDraftUsage — the current user's mock-draft usage against the free-tier
 * weekly cap (LS-5178). Lets the web UI reflect the limit *before* submit
 * instead of only surfacing it via the `PREMIUM_REQUIRED` mutation error.
 */
export const MockDraftUsage = builder.objectRef<{
  used: number;
  limit: number;
  remaining: number | null;
  isUnlimited: boolean;
  resetsAt: string | null;
}>('MockDraftUsage');

MockDraftUsage.implement({
  description:
    "The current user's mock-draft usage within the trailing 7-day window, relative to the free-tier weekly limit.",
  fields: (t) => ({
    used: t.exposeInt('used', {
      description:
        'Mock drafts the user has created within the trailing 7-day window.',
    }),
    limit: t.exposeInt('limit', {
      description: 'Free-tier mock drafts allowed per 7-day window.',
    }),
    remaining: t.exposeInt('remaining', {
      nullable: true,
      description:
        'Mock drafts still allowed this window (max(0, limit - used)); null for unlimited users, who are not capped.',
    }),
    isUnlimited: t.exposeBoolean('isUnlimited', {
      description:
        'True when the user has the unlimited_mock_drafts entitlement (cap does not apply).',
    }),
    resetsAt: t.exposeString('resetsAt', {
      nullable: true,
      description:
        'ISO-8601 UTC instant when the next free mock draft frees up (a counted draft ages out of the 7-day window). Null when unlimited or no drafts are counted.',
    }),
  }),
});
