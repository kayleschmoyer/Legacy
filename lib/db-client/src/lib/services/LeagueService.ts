import { and, countDistinct, eq, sql } from 'drizzle-orm';
import { DbOptions } from '@legacy-sports/utils/node';
import {
  DEFAULT_ROSTER_SIZE_BY_SPORT,
  FOOTBALL_DST_DATA_AVAILABLE,
  getDefaultRosterPositions,
} from '@legacy-sports/utils';
import { LOGGER } from '@legacy-sports/logging';
import { runWithPublicClient } from '../client/Helpers';
import { PublicSchema } from '../client/PublicDbClient';
import type { KeeperSettings } from '../../types/DatabaseTypes';
import type { DraftMode, DraftOrder, SelectionMethod } from '../DraftUtils';

// Default team names (owner's team name is generated dynamically)
const DEFAULT_TEAM_NAMES = [
  'Team Alpha',
  'Team Beta',
  'Team Gamma',
  'Team Delta',
  'Team Epsilon',
  'Team Zeta',
  'Team Eta',
  'Team Theta',
  'Team Iota',
  'Team Kappa',
  'Team Lambda',
  'Team Mu',
  'Team Nu',
  'Team Xi',
  'Team Omicron',
];

export type SportKind = 'baseball' | 'football';

export type EraFilterValue =
  // Baseball
  | 'all'
  | 'dead_ball'
  | 'golden_age'
  | 'expansion'
  | 'free_agency'
  | 'steroid_era'
  | 'modern'
  | 'custom'
  // Football (LS-4633)
  | 'pioneer'
  | 'single_platoon'
  | 'super_bowl_era'
  | 'west_coast'
  | 'salary_cap_era'
  | 'spread_offense';

/** Player pool keys persisted to `leagues.player_pool`. Mirrors the
 *  `player_pool` Postgres enum. Baseball uses all/nl/al, football uses
 *  nfl/afc/nfc (LS-4633). */
export type PlayerPoolValue = 'all' | 'nl' | 'al' | 'nfl' | 'afc' | 'nfc';

export interface CreateLeagueOptions {
  name: string;
  ownerId: number;
  ownerUsername: string;
  /** Sport for this league (LS-4628). Defaults to baseball. */
  sport?: SportKind;
  /** Defensive scoring format for football leagues (LS-246).
   *  'dst' = team defense; 'idp' = individual defensive players.
   *  Ignored for baseball leagues. Defaults to 'idp' while no team-defense
   *  players exist (FOOTBALL_DST_DATA_AVAILABLE, LS-10727), else 'dst'. */
  defensiveFormat?: 'dst' | 'idp';
  maxRosterSize?: number;
  /**
   * Per-slot starting roster configuration (LS-6145). When provided
   * (non-empty), overrides the sport/defensiveFormat default (see
   * `getDefaultRosterPositions`) for seeding `league_positions` — each
   * entry expands to `count` rows of `positionType`. Callers must have
   * already validated `positionType`
   * against the `position_slot` enum — this service does not gate.
   */
  rosterSlots?: { positionType: string; count: number }[];
  numberOfTeams?: number;
  numberOfDivisions?: number;
  schedulingStrategy?: 'round-robin' | 'divisional' | 'random';
  /** Premium-only: custom in-division game percentage (0-100) for the
   *  Divisional strategy. Null/undefined preserves the existing default
   *  (100% in-division games). Callers must have already enforced the
   *  `advanced_scheduling` entitlement — this service does not gate. */
  schedulingDivisionalWeightPct?: number | null;
  playerPool?: PlayerPoolValue;
  /** Era-based player pool filter. Default 'all' (no restriction). */
  eraFilter?: EraFilterValue;
  /** When true, only Hall of Fame inductees appear in the draft pool. */
  baseballHofOnly?: boolean;
  /** Start year for a custom era (only used when eraFilter = 'custom'). */
  customEraStartYear?: number | null;
  /** End year for a custom era (only used when eraFilter = 'custom'). */
  customEraEndYear?: number | null;
  draftMode?: DraftMode;
  selectionMethod?: SelectionMethod;
  draftOrder?: DraftOrder;
  waiverType?: 'standard' | 'faab';
  waiverEnabled?: boolean;
  faabBudgetDefault?: number;
  isPublic?: boolean;
  /** Roster continuity across seasons (LS-8671). Defaults to 'redraft'
   *  (full roster reset — historical behaviour). */
  rosterContinuity?: 'redraft' | 'keeper' | 'dynasty';
  /** Keeper configuration jsonb (LS-8671). Callers must have already
   *  validated that this is only present when rosterContinuity = 'keeper' —
   *  this service does not gate. */
  keeperSettings?: KeeperSettings | null;
  // ── Salary cap settings (LS-634/LS-646) ────────────────────────────
  salaryCapEnabled?: boolean;
  salaryCap?: number | null;
  salaryFloor?: number | null;
  luxuryTaxThreshold?: number | null;
  minSalary?: number;
  salaryEscalationPct?: number;
  salaryDecayPct?: number;
  auctionBudget?: number;
  auctionMinBid?: number;
  /** Premium setting: managers may trade draft slots before the draft starts
   *  (LS-8675). Callers must have already rejected auction leagues and
   *  enforced the `draft_slot_trading` entitlement — this service does not
   *  gate. */
  allowDraftSlotTrading?: boolean;
  /** ISO datetime string for the scheduled draft start time. */
  startDate?: string;
  /** PPR scoring format for football leagues (LS-4158).
   *  'standard' = 0 pts/rec, 'half_ppr' = 0.5 pts/rec, 'ppr' = 1 pt/rec (default).
   *  Used to seed the default scoring profile's reception multiplier. */
  scoringFormat?: 'standard' | 'half_ppr' | 'ppr';
  /** Number of games per matchup week. Defaults to 5. Per-sport max: baseball 162, football 17. */
  gamesPerMatchup?: number;
  /** Seconds allocated per pick in a live draft (30–172800). Defaults to 120 (2 minutes). */
  pickTimeLimitSeconds?: number;
  /**
   * If set, the insert is guarded by a per-user advisory lock that atomically
   * checks this limit before proceeding. Throws 'LEAGUE_LIMIT_EXCEEDED' if the
   * user already has >= leagueLimit non-mock leagues.
   */
  leagueLimit?: number;
  /**
   * Client-generated idempotency key for this create attempt (LS-6063). Only
   * consulted when `leagueLimit` is set (the free-tier path this dedup exists
   * for). If a league already exists for (ownerId, idempotencyKey), that
   * league is returned instead of creating a new one — protects against a
   * duplicate request (double-click, retry, parallel tab) that reaches the
   * server despite the client's in-flight guard.
   */
  idempotencyKey?: string;
}

export interface CreateLeagueResult {
  league: {
    id: number;
    name: string;
    owner: number;
    sport: SportKind;
    maxRosterSize: number;
    currentMatchup: number | null;
    currentWeek: number | null;
    draftStatus:
      | 'not-started'
      | 'queued'
      | 'in-progress'
      | 'paused'
      | 'completed';
    leaguePhase: 'pre-draft' | 'active' | 'offseason';
    inviteCode: string;
    playerPool: PlayerPoolValue;
    eraFilter?: EraFilterValue;
    baseballHofOnly?: boolean;
    customEraStartYear?: number | null;
    customEraEndYear?: number | null;
    waiverType?: 'standard' | 'faab';
    waiverEnabled?: boolean;
    faabBudgetDefault?: number;
    isPublic: boolean;
    playoffEnabled: boolean;
    allowDraftSlotTrading?: boolean;
    rosterContinuity?: 'redraft' | 'keeper' | 'dynasty';
    keeperSettings?: KeeperSettings | null;
    gamesPerMatchup?: number;
  };
  teams: {
    id: number;
    name: string;
    leagueId: number;
    divisionId: number | null;
    createdAt: Date;
    updatedAt: Date;
    waiverOrder: number | null;
    faabBudget: number | null;
  }[];
  leagueMembers: {
    leagueId: number;
    userId: number;
    teamId: number;
    permissionLevel: 'general_manager' | 'assistant_manager' | 'commissioner';
  }[];
}

/**
 * Service for league lifecycle operations.
 * Ensures all related records (teams, positions, draft) are always created together.
 */
export class LeagueService {
  constructor(private options: DbOptions) {}

  /**
   * Create a league with teams, roster positions, General Manager membership, and draft record.
   * This is the single entry point for league creation — it guarantees that a draft
   * record is always created alongside the league.
   */
  async createLeague(input: CreateLeagueOptions): Promise<CreateLeagueResult> {
    const {
      name,
      ownerId,
      ownerUsername,
      sport = 'baseball',
      maxRosterSize: maxRosterSizeInput,
      rosterSlots,
      numberOfTeams = 12,
      numberOfDivisions = 2,
      schedulingStrategy = 'divisional',
      schedulingDivisionalWeightPct = null,
      playerPool = 'all',
      eraFilter = 'all',
      baseballHofOnly = false,
      customEraStartYear = null,
      customEraEndYear = null,
      draftMode = 'live',
      selectionMethod = 'standard',
      draftOrder = 'snake',
      waiverType = 'standard',
      waiverEnabled = true,
      faabBudgetDefault = 100,
      isPublic = false,
      rosterContinuity = 'redraft',
      keeperSettings = null,
      defensiveFormat = FOOTBALL_DST_DATA_AVAILABLE ? 'dst' : 'idp',
      salaryCapEnabled = false,
      salaryCap = null,
      salaryFloor = null,
      luxuryTaxThreshold = null,
      minSalary = 1,
      salaryEscalationPct = 10,
      salaryDecayPct = 25,
      auctionBudget = 260,
      auctionMinBid = 1,
      allowDraftSlotTrading = false,
      startDate,
      scoringFormat = 'ppr',
      gamesPerMatchup,
      pickTimeLimitSeconds = 120,
      leagueLimit,
      idempotencyKey,
    } = input;

    const maxRosterSize =
      maxRosterSizeInput ?? DEFAULT_ROSTER_SIZE_BY_SPORT[sport];

    if (numberOfTeams < 1) {
      throw new Error(`numberOfTeams must be at least 1, got ${numberOfTeams}`);
    }
    if (numberOfDivisions < 1) {
      throw new Error(
        `numberOfDivisions must be at least 1, got ${numberOfDivisions}`,
      );
    }
    if (numberOfDivisions > numberOfTeams) {
      throw new Error(
        `numberOfDivisions (${numberOfDivisions}) cannot exceed numberOfTeams (${numberOfTeams})`,
      );
    }

    return runWithPublicClient(this.options, async (db) => {
      // Generate unique invite code outside the transaction (read-only check)
      const inviteCode = await this.generateUniqueInviteCode(db);

      const result = await db.transaction(async (tx) => {
        // 0. Enforce free-tier league limit atomically.
        //    The advisory lock serializes concurrent create requests for the
        //    same user so the count check and INSERT form a single critical
        //    section, eliminating the TOCTOU race (LS-5122).
        //
        //    The cap counts every active league the user *participates in*,
        //    not only the ones they own. Joining leagues via leagueMembers
        //    must count against the free-tier limit just like ownership does
        //    (LS-5181) — otherwise a free user at the owned-league cap could
        //    join unlimited additional leagues with no server-side awareness.
        //    The owner is always inserted as a leagueMember, so a membership
        //    join captures owned + joined leagues; the (leagueId, userId)
        //    primary key on leagueMembers guarantees one row per league, but
        //    countDistinct keeps the count correct regardless.
        if (leagueLimit !== undefined) {
          await tx.execute(
            sql`SELECT pg_advisory_xact_lock(CAST(${ownerId} AS bigint))`,
          );

          // Idempotent replay (LS-6063): a resubmission of the same create
          // attempt (double-click past the client guard, retry, parallel
          // tab) carries the same idempotencyKey. Since we hold the same
          // per-owner advisory lock the count check below uses, this lookup
          // and any concurrent insert of the same key can't race each other.
          if (idempotencyKey) {
            const [existingLeague] = await tx
              .select({
                id: PublicSchema.leagues.id,
                name: PublicSchema.leagues.name,
                owner: PublicSchema.leagues.owner,
                sport: PublicSchema.leagues.sport,
                maxRosterSize: PublicSchema.leagues.maxRosterSize,
                currentMatchup: PublicSchema.leagues.currentMatchup,
                currentWeek: PublicSchema.leagues.currentWeek,
                draftStatus: PublicSchema.leagues.draftStatus,
                leaguePhase: PublicSchema.leagues.leaguePhase,
                inviteCode: PublicSchema.leagues.inviteCode,
                playerPool: PublicSchema.leagues.playerPool,
                eraFilter: PublicSchema.leagues.baseballEraFilter,
                baseballHofOnly: PublicSchema.leagues.baseballHofOnly,
                customEraStartYear: PublicSchema.leagues.customEraStartYear,
                customEraEndYear: PublicSchema.leagues.customEraEndYear,
                waiverType: PublicSchema.leagues.waiverType,
                waiverEnabled: PublicSchema.leagues.waiverEnabled,
                faabBudgetDefault: PublicSchema.leagues.faabBudgetDefault,
                isPublic: PublicSchema.leagues.isPublic,
                playoffEnabled: PublicSchema.leagues.playoffEnabled,
                allowDraftSlotTrading:
                  PublicSchema.leagues.allowDraftSlotTrading,
                rosterContinuity: PublicSchema.leagues.rosterContinuity,
                keeperSettings: PublicSchema.leagues.keeperSettings,
                gamesPerMatchup: PublicSchema.leagues.gamesPerMatchup,
              })
              .from(PublicSchema.leagues)
              .where(
                and(
                  eq(PublicSchema.leagues.owner, ownerId),
                  eq(
                    PublicSchema.leagues.creationIdempotencyKey,
                    idempotencyKey,
                  ),
                ),
              )
              .limit(1);

            if (existingLeague) {
              const existingTeams = await tx
                .select({
                  id: PublicSchema.teams.id,
                  name: PublicSchema.teams.name,
                  leagueId: PublicSchema.teams.leagueId,
                  divisionId: PublicSchema.teams.divisionId,
                  createdAt: PublicSchema.teams.createdAt,
                  updatedAt: PublicSchema.teams.updatedAt,
                  waiverOrder: PublicSchema.teams.waiverOrder,
                  faabBudget: PublicSchema.teams.faabBudget,
                })
                .from(PublicSchema.teams)
                .where(eq(PublicSchema.teams.leagueId, existingLeague.id));

              const [existingOwnerMember] = await tx
                .select({
                  leagueId: PublicSchema.leagueMembers.leagueId,
                  userId: PublicSchema.leagueMembers.userId,
                  teamId: PublicSchema.leagueMembers.teamId,
                  permissionLevel: PublicSchema.leagueMembers.permissionLevel,
                })
                .from(PublicSchema.leagueMembers)
                .where(
                  and(
                    eq(PublicSchema.leagueMembers.leagueId, existingLeague.id),
                    eq(PublicSchema.leagueMembers.userId, ownerId),
                  ),
                )
                .limit(1);

              if (!existingOwnerMember?.teamId) {
                throw new Error(
                  `Idempotent league ${existingLeague.id} is missing its owner membership/team`,
                );
              }

              LOGGER.info(
                'Idempotent createLeague resubmission detected, returning existing league',
                { leagueId: existingLeague.id, ownerId },
              );

              return {
                league: {
                  ...existingLeague,
                  gamesPerMatchup: existingLeague.gamesPerMatchup ?? undefined,
                },
                teams: existingTeams,
                leagueMembers: [
                  {
                    leagueId: existingOwnerMember.leagueId,
                    userId: existingOwnerMember.userId,
                    teamId: existingOwnerMember.teamId,
                    permissionLevel: existingOwnerMember.permissionLevel,
                  },
                ],
              };
            }
          }

          const [{ existingCount }] = await tx
            .select({
              existingCount: countDistinct(PublicSchema.leagues.id),
            })
            .from(PublicSchema.leagues)
            .innerJoin(
              PublicSchema.leagueMembers,
              eq(PublicSchema.leagueMembers.leagueId, PublicSchema.leagues.id),
            )
            .where(eq(PublicSchema.leagueMembers.userId, ownerId));
          if (existingCount >= leagueLimit) {
            throw new Error('LEAGUE_LIMIT_EXCEEDED');
          }
        }

        // 1. Insert league
        const [league] = await tx
          .insert(PublicSchema.leagues)
          .values({
            name,
            owner: ownerId,
            sport,
            defensiveFormat,
            maxRosterSize,
            currentMatchup: null,
            inviteCode,
            playerPool,
            baseballEraFilter: eraFilter,
            baseballHofOnly,
            customEraStartYear,
            customEraEndYear,
            waiverType,
            waiverEnabled,
            faabBudgetDefault,
            schedulingStrategy,
            schedulingDivisionalWeightPct,
            numberOfDivisions,
            isPublic,
            rosterContinuity,
            keeperSettings,
            // Idempotency key for this create attempt (LS-6063). Only ever
            // set when leagueLimit is defined (the free-tier path this
            // dedup exists for) — see the lookup above.
            creationIdempotencyKey:
              leagueLimit !== undefined ? (idempotencyKey ?? null) : null,
            // Salary cap settings
            salaryCapEnabled,
            salaryCap,
            salaryFloor,
            luxuryTaxThreshold,
            minSalary,
            salaryEscalationPct,
            salaryDecayPct,
            auctionBudget,
            auctionMinBid,
            allowDraftSlotTrading,
            ...(gamesPerMatchup !== undefined ? { gamesPerMatchup } : {}),
          })
          .returning({
            id: PublicSchema.leagues.id,
            name: PublicSchema.leagues.name,
            owner: PublicSchema.leagues.owner,
            sport: PublicSchema.leagues.sport,
            maxRosterSize: PublicSchema.leagues.maxRosterSize,
            currentMatchup: PublicSchema.leagues.currentMatchup,
            currentWeek: PublicSchema.leagues.currentWeek,
            draftStatus: PublicSchema.leagues.draftStatus,
            leaguePhase: PublicSchema.leagues.leaguePhase,
            inviteCode: PublicSchema.leagues.inviteCode,
            playerPool: PublicSchema.leagues.playerPool,
            eraFilter: PublicSchema.leagues.baseballEraFilter,
            baseballHofOnly: PublicSchema.leagues.baseballHofOnly,
            customEraStartYear: PublicSchema.leagues.customEraStartYear,
            customEraEndYear: PublicSchema.leagues.customEraEndYear,
            waiverType: PublicSchema.leagues.waiverType,
            waiverEnabled: PublicSchema.leagues.waiverEnabled,
            faabBudgetDefault: PublicSchema.leagues.faabBudgetDefault,
            isPublic: PublicSchema.leagues.isPublic,
            playoffEnabled: PublicSchema.leagues.playoffEnabled,
            allowDraftSlotTrading: PublicSchema.leagues.allowDraftSlotTrading,
            rosterContinuity: PublicSchema.leagues.rosterContinuity,
            keeperSettings: PublicSchema.leagues.keeperSettings,
            gamesPerMatchup: PublicSchema.leagues.gamesPerMatchup,
          });

        // 2. Create teams — assign each team to a division (round-robin across divisions)
        // e.g. 4 teams / 3 divisions → div 1 gets 2, div 2 gets 1, div 3 gets 1
        // Strip email domain if the username looks like an email address
        const displayName = /^[^@]+@[^@]+\.[^@]+$/.test(ownerUsername)
          ? ownerUsername.split('@')[0]
          : ownerUsername;
        const teamNames = [`${displayName}'s Team`, ...DEFAULT_TEAM_NAMES];
        // Clamp to available team names. Callers should not pass numberOfTeams
        // greater than teamNames.length (currently 16), but we cap silently for
        // backwards compatibility rather than throwing a hard error here.
        const teamsToCreate = Math.min(numberOfTeams, teamNames.length);
        const teamData = teamNames
          .slice(0, teamsToCreate)
          .map((teamName, index) => ({
            name: teamName,
            leagueId: league.id,
            divisionId: (index % numberOfDivisions) + 1,
            waiverOrder: index + 1,
            faabBudget: faabBudgetDefault,
          }));

        const teams = await tx
          .insert(PublicSchema.teams)
          .values(teamData)
          .returning({
            id: PublicSchema.teams.id,
            name: PublicSchema.teams.name,
            leagueId: PublicSchema.teams.leagueId,
            divisionId: PublicSchema.teams.divisionId,
            createdAt: PublicSchema.teams.createdAt,
            updatedAt: PublicSchema.teams.updatedAt,
            waiverOrder: PublicSchema.teams.waiverOrder,
            faabBudget: PublicSchema.teams.faabBudget,
          });

        // 3. Create league member for owner (assign to first team)
        if (!teams[0]?.id) {
          throw new Error('Failed to create league teams');
        }
        const ownerMember = {
          leagueId: league.id,
          userId: ownerId,
          teamId: teams[0].id,
          permissionLevel: 'commissioner' as const,
        };
        await tx.insert(PublicSchema.leagueMembers).values(ownerMember);

        // 4. Create roster positions — from the caller's per-slot config
        //    when provided (LS-6145), otherwise sport-appropriate defaults,
        //    branching on defensiveFormat for IDP football leagues
        //    (LS-4761, LS-6134).
        const positionData =
          rosterSlots && rosterSlots.length > 0
            ? rosterSlots.flatMap(({ positionType, count }) =>
                Array.from({ length: count }, () => ({
                  leagueId: league.id,
                  positionType:
                    positionType as (typeof PublicSchema.positionSlot.enumValues)[number],
                })),
              )
            : getDefaultRosterPositions(sport, defensiveFormat).map(
                (positionType) => ({
                  leagueId: league.id,
                  positionType,
                }),
              );
        await tx.insert(PublicSchema.leaguePosition).values(positionData);

        // 5. Create draft record — always, so draft settings are never missing
        await tx.insert(PublicSchema.drafts).values({
          leagueId: league.id,
          draftMode,
          selectionMethod,
          draftOrder,
          pickTimeLimitSeconds,
          ...(startDate
            ? {
                scheduledAt: new Date(startDate),
                date: startDate.split('T')[0],
              }
            : {}),
        });

        // 6. Create default scoring profile — always, so the scoring editor
        //    never throws "Active scoring profile not found" for new leagues.
        //    getActiveScoringProfileForLeague queries isDefault=true; entries
        //    are populated on the first ScoringService.updateActiveProfile call
        //    via updateLeagueScoringProfileEntries (upsert).
        const [scoringProfile] = await tx
          .insert(PublicSchema.leagueScoringProfiles)
          .values({
            leagueId: league.id,
            isDefault: true,
          })
          .returning({ id: PublicSchema.leagueScoringProfiles.id });

        // 7. Seed reception multiplier from scoringFormat for football leagues (LS-4158).
        //    'receiving_rec' default_multiplier is 1.0 (PPR); override for standard/half_ppr.
        //    Only insert an entry when the chosen format differs from the DB default.
        if (sport === 'football' && scoringFormat !== 'ppr' && scoringProfile) {
          const recMultiplier =
            scoringFormat === 'half_ppr' ? '0.500' : '0.000';
          const [recStatDef] = await tx
            .select({ id: PublicSchema.scoringStatDefinitions.id })
            .from(PublicSchema.scoringStatDefinitions)
            .where(
              eq(PublicSchema.scoringStatDefinitions.statKey, 'receiving_rec'),
            )
            .limit(1);
          if (recStatDef) {
            await tx.insert(PublicSchema.leagueScoringProfileEntries).values({
              profileId: scoringProfile.id,
              statDefinitionId: recStatDef.id,
              multiplier: recMultiplier,
            });
          }
        }

        return {
          league: {
            ...league,
            gamesPerMatchup: league.gamesPerMatchup ?? undefined,
          },
          teams,
          leagueMembers: [ownerMember],
        };
      });

      LOGGER.info('League created with all related records', {
        leagueId: result.league.id,
        name,
        numberOfTeams: result.teams.length,
        draftMode,
        selectionMethod,
        draftOrder,
      });

      return result;
    });
  }

  // --- Invite code helpers ---

  private generateInviteCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  private async generateUniqueInviteCode(
    db: Parameters<Parameters<typeof runWithPublicClient>[1]>[0],
  ): Promise<string> {
    const maxAttempts = 10;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const code = this.generateInviteCode();
      const existing = await db
        .select({ id: PublicSchema.leagues.id })
        .from(PublicSchema.leagues)
        .where(eq(PublicSchema.leagues.inviteCode, code))
        .limit(1);
      if (existing.length === 0) return code;
    }
    throw new Error(
      'Failed to generate unique invite code after maximum attempts',
    );
  }
}

/**
 * Factory function to create a LeagueService
 */
export function createLeagueService(options: DbOptions): LeagueService {
  return new LeagueService(options);
}
