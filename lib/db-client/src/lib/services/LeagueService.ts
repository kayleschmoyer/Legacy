import { eq } from 'drizzle-orm';
import { DbOptions } from '@legacy-sports/utils/node';
import { LOGGER } from '@legacy-sports/logging';
import { runWithPublicClient } from '../client/Helpers';
import { PublicSchema } from '../client/PublicDbClient';
import type { DraftMode, DraftOrder, SelectionMethod } from '../DraftUtils';

// Default roster positions for new leagues
// Standard fantasy baseball roster configuration
const DEFAULT_ROSTER_POSITIONS = [
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
] as const;

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

export type EraFilterValue =
  | 'all'
  | 'dead_ball'
  | 'golden_age'
  | 'expansion'
  | 'free_agency'
  | 'steroid_era'
  | 'modern'
  | 'custom';

export interface CreateLeagueOptions {
  name: string;
  ownerId: number;
  ownerUsername: string;
  maxRosterSize?: number;
  numberOfTeams?: number;
  numberOfDivisions?: number;
  schedulingStrategy?: 'round-robin' | 'divisional' | 'random';
  playerPool?: 'all' | 'nl' | 'al';
  /** Era-based player pool filter. Default 'all' (no restriction). */
  eraFilter?: EraFilterValue;
  /** When true, only Hall of Fame inductees appear in the draft pool. */
  hofOnly?: boolean;
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
  /** ISO datetime string for the scheduled draft start time. */
  startDate?: string;
}

export interface CreateLeagueResult {
  league: {
    id: number;
    name: string;
    owner: number;
    maxRosterSize: number;
    currentMatchup: number | null;
    currentWeek: number | null;
    draftStatus:
      | 'not-started'
      | 'queued'
      | 'in-progress'
      | 'paused'
      | 'completed';
    inviteCode: string;
    playerPool: 'all' | 'nl' | 'al';
    eraFilter?: EraFilterValue;
    hofOnly?: boolean;
    customEraStartYear?: number | null;
    customEraEndYear?: number | null;
    waiverType?: 'standard' | 'faab';
    waiverEnabled?: boolean;
    faabBudgetDefault?: number;
    isPublic: boolean;
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
      maxRosterSize = 25,
      numberOfTeams = 12,
      numberOfDivisions = 2,
      schedulingStrategy = 'divisional',
      playerPool = 'all',
      eraFilter = 'all',
      hofOnly = false,
      customEraStartYear = null,
      customEraEndYear = null,
      draftMode = 'live',
      selectionMethod = 'standard',
      draftOrder = 'snake',
      waiverType = 'standard',
      waiverEnabled = true,
      faabBudgetDefault = 100,
      isPublic = false,
      salaryCapEnabled = false,
      salaryCap = null,
      salaryFloor = null,
      luxuryTaxThreshold = null,
      minSalary = 1,
      salaryEscalationPct = 10,
      salaryDecayPct = 25,
      auctionBudget = 260,
      auctionMinBid = 1,
      startDate,
    } = input;

    return runWithPublicClient(this.options, async (db) => {
      // Generate unique invite code
      const inviteCode = await this.generateUniqueInviteCode(db);

      // 1. Insert league
      const [league] = await db
        .insert(PublicSchema.leagues)
        .values({
          name,
          owner: ownerId,
          maxRosterSize,
          currentMatchup: null,
          inviteCode,
          playerPool,
          eraFilter,
          hofOnly,
          customEraStartYear,
          customEraEndYear,
          waiverType,
          waiverEnabled,
          faabBudgetDefault,
          schedulingStrategy,
          numberOfDivisions,
          isPublic,
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
        })
        .returning({
          id: PublicSchema.leagues.id,
          name: PublicSchema.leagues.name,
          owner: PublicSchema.leagues.owner,
          maxRosterSize: PublicSchema.leagues.maxRosterSize,
          currentMatchup: PublicSchema.leagues.currentMatchup,
          currentWeek: PublicSchema.leagues.currentWeek,
          draftStatus: PublicSchema.leagues.draftStatus,
          inviteCode: PublicSchema.leagues.inviteCode,
          playerPool: PublicSchema.leagues.playerPool,
          eraFilter: PublicSchema.leagues.eraFilter,
          hofOnly: PublicSchema.leagues.hofOnly,
          customEraStartYear: PublicSchema.leagues.customEraStartYear,
          customEraEndYear: PublicSchema.leagues.customEraEndYear,
          waiverType: PublicSchema.leagues.waiverType,
          waiverEnabled: PublicSchema.leagues.waiverEnabled,
          faabBudgetDefault: PublicSchema.leagues.faabBudgetDefault,
          isPublic: PublicSchema.leagues.isPublic,
        });

      // 2. Create teams — assign each team to a division (block-assign evenly across divisions)
      // e.g. 12 teams / 2 divisions → teams 0-5 to division 1, teams 6-11 to division 2
      const teamNames = [`${ownerUsername}'s Team`, ...DEFAULT_TEAM_NAMES];
      const teamsToCreate = Math.min(numberOfTeams, teamNames.length);
      const teamsPerDivision = Math.ceil(teamsToCreate / numberOfDivisions);
      const teamData = teamNames
        .slice(0, teamsToCreate)
        .map((teamName, index) => ({
          name: teamName,
          leagueId: league.id,
          divisionId: Math.floor(index / teamsPerDivision) + 1,
          waiverOrder: index + 1,
          faabBudget: faabBudgetDefault,
        }));

      const teams = await db
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
      const ownerMember = {
        leagueId: league.id,
        userId: ownerId,
        teamId: teams[0].id,
        permissionLevel: 'commissioner' as const,
      };
      await db.insert(PublicSchema.leagueMembers).values(ownerMember);

      // 4. Create roster positions
      const positionData = DEFAULT_ROSTER_POSITIONS.map((positionType) => ({
        leagueId: league.id,
        positionType,
      }));
      await db.insert(PublicSchema.leaguePosition).values(positionData);

      // 5. Create draft record — always, so draft settings are never missing
      await db.insert(PublicSchema.drafts).values({
        leagueId: league.id,
        draftMode,
        selectionMethod,
        draftOrder,
        ...(startDate
          ? {
              scheduledAt: new Date(startDate),
              date: startDate.split('T')[0],
            }
          : {}),
      });

      LOGGER.info('League created with all related records', {
        leagueId: league.id,
        name,
        numberOfTeams: teamsToCreate,
        draftMode,
        selectionMethod,
        draftOrder,
      });

      return {
        league,
        teams,
        leagueMembers: [ownerMember],
      };
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
