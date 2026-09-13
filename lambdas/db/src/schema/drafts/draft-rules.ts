/**
 * Draft domain — draft rules loader (LS-10074, epic LS-9252 "Draft-First Mock Drafts").
 *
 * Every rule the draft engine needs — the player pool it draws from, the
 * roster it is filling, the sport it is playing — used to be read straight off
 * the `leagues` row at each call site. Draft-first mock drafts (LS-10076,
 * slice 4) have no league to read, so those reads have to move behind one
 * loader that both draft kinds can answer.
 *
 * {@link loadDraftRules} is that loader. For `kind = 'league'` it projects the
 * league's settings onto {@link DraftRules}; the `kind = 'mock'` branch lands
 * in slice 4 and throws until then. Nothing about the league branch's values
 * changes — this slice is behavior-neutral, so every field below is the same
 * column the previous call site read.
 */

import { type PublicDb, PublicSchema } from '@legacy-sports/db-client';
import { asc, eq } from 'drizzle-orm';

type LeagueRow = typeof PublicSchema.leagues.$inferSelect;
type DraftRow = typeof PublicSchema.drafts.$inferSelect;
type LeaguePositionRow = typeof PublicSchema.leaguePosition.$inferSelect;

/** A roster slot type (`league_positions.position_type`), e.g. `C`, `QB`, `BENCH`. */
export type RosterPositionSlot = LeaguePositionRow['positionType'];

/**
 * The settings a draft runs under, independent of whether they came from a
 * league or (from slice 4) from `mock_draft_settings`.
 *
 * Field types are projected off the `leagues` row rather than restated, so a
 * column type change can never silently drift from this contract.
 */
export interface DraftRules {
  draftId: number;
  kind: DraftRow['kind'];
  /** The owning league, or `null` for a draft-first mock draft. */
  leagueId: number | null;
  sport: LeagueRow['sport'];
  playerPool: LeagueRow['playerPool'];
  maxRosterSize: LeagueRow['maxRosterSize'];
  defensiveFormat: LeagueRow['defensiveFormat'];
  baseballEraFilter: LeagueRow['baseballEraFilter'];
  customEraStartYear: LeagueRow['customEraStartYear'];
  customEraEndYear: LeagueRow['customEraEndYear'];
  baseballHofOnly: LeagueRow['baseballHofOnly'];
  minCareerGames: LeagueRow['minCareerGames'];
  minCareerSeasons: LeagueRow['minCareerSeasons'];
  gamesPerMatchup: LeagueRow['gamesPerMatchup'];
  pitcherStartsPerMatchup: LeagueRow['pitcherStartsPerMatchup'];
  /**
   * True for a draft whose picks are never persisted to rosters — today the
   * legacy `leagues.is_mock_draft` lobbies (LS-9181), from slice 4 also
   * `drafts.kind = 'mock'`.
   */
  isMock: boolean;
  mockMode: DraftRow['mockMode'];
  controlAllTeams: DraftRow['controlAllTeams'];
  /**
   * The starter slot list this draft is filling, in league-defined order
   * (LS-10086). League drafts read `league_positions`; slice 4's mock branch
   * derives it from `getDefaultRosterPositions(sport, defensiveFormat)`,
   * because `league_positions` is league-scoped and a draft-first mock draft
   * has no league.
   *
   * `getUnfilledPositionTypes` and auto-pick positional awareness both consume
   * this rather than querying `league_positions` themselves, so slice 4 needs
   * no second code path.
   */
  rosterPositions: RosterPositionSlot[];
}

/**
 * Thrown when a draft id resolves to no `drafts` row. A caller that already
 * loaded the draft (every guard path does) can never hit this; the auto-pick
 * sweep can, when a draft is deleted mid-flight.
 */
export class DraftNotFoundError extends Error {
  constructor(draftId: number) {
    super(`Draft ${String(draftId)} not found`);
    this.name = 'DraftNotFoundError';
  }
}

/**
 * Load the {@link DraftRules} for a draft.
 *
 * Two queries for a league draft: the draft joined to its league, then the
 * league's roster positions. Safe inside a transaction — `db` may be a `tx`.
 *
 * @throws {DraftNotFoundError} when no `drafts` row has this id.
 * @throws {Error} for a `kind = 'mock'` draft — the mock branch lands in
 *   LS-10076 (slice 4). No writer creates such a row yet.
 */
export async function loadDraftRules(
  db: PublicDb,
  draftId: number,
): Promise<DraftRules> {
  const [row] = await db
    .select({
      draftId: PublicSchema.drafts.id,
      kind: PublicSchema.drafts.kind,
      leagueId: PublicSchema.drafts.leagueId,
      mockMode: PublicSchema.drafts.mockMode,
      controlAllTeams: PublicSchema.drafts.controlAllTeams,
      league: {
        id: PublicSchema.leagues.id,
        sport: PublicSchema.leagues.sport,
        playerPool: PublicSchema.leagues.playerPool,
        maxRosterSize: PublicSchema.leagues.maxRosterSize,
        defensiveFormat: PublicSchema.leagues.defensiveFormat,
        baseballEraFilter: PublicSchema.leagues.baseballEraFilter,
        customEraStartYear: PublicSchema.leagues.customEraStartYear,
        customEraEndYear: PublicSchema.leagues.customEraEndYear,
        baseballHofOnly: PublicSchema.leagues.baseballHofOnly,
        minCareerGames: PublicSchema.leagues.minCareerGames,
        minCareerSeasons: PublicSchema.leagues.minCareerSeasons,
        gamesPerMatchup: PublicSchema.leagues.gamesPerMatchup,
        pitcherStartsPerMatchup: PublicSchema.leagues.pitcherStartsPerMatchup,
        isMockDraft: PublicSchema.leagues.isMockDraft,
      },
    })
    .from(PublicSchema.drafts)
    .leftJoin(
      PublicSchema.leagues,
      eq(PublicSchema.leagues.id, PublicSchema.drafts.leagueId),
    )
    .where(eq(PublicSchema.drafts.id, draftId))
    .limit(1);

  if (!row) {
    throw new DraftNotFoundError(draftId);
  }

  if (row.kind === 'mock') {
    // Guard rather than silently returning league-shaped defaults: a mock
    // draft that fell through to league rules would draft from the wrong pool
    // against the wrong roster. Tested for 'mock' specifically, not
    // "not 'league'": the column is NOT NULL DEFAULT 'league'.
    throw new Error(
      `loadDraftRules: draft ${String(draftId)} is a mock draft — the mock branch lands in LS-10076`,
    );
  }

  const { league } = row;
  if (row.leagueId === null || !league) {
    // drafts_kind_league_ck (LS-10073) makes this unreachable for a league
    // draft; a NULL league_id or a dangling FK is a data-integrity failure,
    // not a client mistake.
    throw new Error(
      `loadDraftRules: league draft ${String(draftId)} has no league row`,
    );
  }

  const positionRows = await db
    .select({ positionType: PublicSchema.leaguePosition.positionType })
    .from(PublicSchema.leaguePosition)
    .where(eq(PublicSchema.leaguePosition.leagueId, row.leagueId))
    .orderBy(asc(PublicSchema.leaguePosition.id));

  return {
    draftId: row.draftId,
    kind: row.kind,
    leagueId: row.leagueId,
    sport: league.sport,
    playerPool: league.playerPool,
    maxRosterSize: league.maxRosterSize,
    defensiveFormat: league.defensiveFormat,
    baseballEraFilter: league.baseballEraFilter,
    customEraStartYear: league.customEraStartYear,
    customEraEndYear: league.customEraEndYear,
    baseballHofOnly: league.baseballHofOnly,
    minCareerGames: league.minCareerGames,
    minCareerSeasons: league.minCareerSeasons,
    gamesPerMatchup: league.gamesPerMatchup,
    pitcherStartsPerMatchup: league.pitcherStartsPerMatchup,
    isMock: league.isMockDraft,
    mockMode: row.mockMode,
    controlAllTeams: row.controlAllTeams,
    rosterPositions: positionRows.map((p) => p.positionType),
  };
}
