import {
  getPfaPlayerSeasonPayload,
  getPlayerSeasonPayload,
  getTeamDefenseSeasonPayload,
  isFootballCorpusConfigured,
  resolveFootballCorpusKey,
  type StoredGameFootballDefense,
  type StoredGameFootballDefenseIdp,
  type StoredGameFootballKicking,
  type StoredGameFootballPassing,
  type StoredGameFootballReceiving,
  type StoredGameFootballRushing,
} from '@legacy-sports/football-game-stats-provider';

/**
 * Read path for football per-game stats in the stats Lambda (LS-10214).
 *
 * Every game log comes from the football corpus in S3
 * (`terraform/main/football-corpus.tf`), split at the 1999 boundary:
 *
 *   1999+      nflverse/v1/<pfrId>/<season>.json.gz, and
 *              nflverse/v1/team-defense/<nflTeam>/<season>.json.gz for DST
 *              (`@legacy-sports/football-game-stats-provider`, LS-9989)
 *   1960-1998  pfa/v1/<corpusKey>/<season>.json.gz (PFA provider, LS-9997)
 *              — offense and kicking only; see `pfaSource`
 *
 * Player objects are addressed by the corpus key, `pfr_id ?? 'pfa-' || pfa_id`
 * (ADR 0023, LS-10588; see `resolvePlayerCorpusKey`). A player with no PFR id
 * only has PFA objects, under `pfa-<pfaId>`.
 *
 * There is deliberately no Pro Football Reference fallback. PFR returns 403 to
 * every scripted request (LS-9908), so a scrape fallback could only ever fail.
 * A corpus miss resolves to `null`, which the caller records as
 * no_game_data_found. Any other failure (S3 throttling, AccessDenied, network,
 * a corrupt object) throws, so it is never silently recorded as "no data".
 */

/** First season the nflverse corpus covers. Earlier seasons route to PFA. */
export const NFLVERSE_FIRST_SEASON = 1999;

/** Rows are returned without `playerId`; the caller owns the app's player id. */
export interface FootballCareerGameLog {
  passing: StoredGameFootballPassing[];
  rushing: StoredGameFootballRushing[];
  receiving: StoredGameFootballReceiving[];
  kicking: StoredGameFootballKicking[];
}

/**
 * One corpus source. Each method resolves `null` when the corpus has no object
 * for the request (a miss) and throws on any other failure.
 */
export interface FootballGameStatsSource {
  readonly name: string;
  getCareerGameLog(
    corpusKey: string,
    season: number,
  ): Promise<FootballCareerGameLog | null>;
  getIdpGameLog(
    corpusKey: string,
    season: number,
  ): Promise<StoredGameFootballDefenseIdp[] | null>;
  getTeamDefenseGameLog(
    nflTeam: string,
    season: number,
  ): Promise<StoredGameFootballDefense[] | null>;
}

/**
 * The corpus cannot be read at all because the bucket env var is missing.
 * This is not a miss, so it must not be recorded as no_game_data_found — that
 * would stamp a permanent zero on a matchup whose data does exist.
 */
export class FootballCorpusUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FootballCorpusUnavailableError';
  }
}

function assertCorpusConfigured(): void {
  if (!isFootballCorpusConfigured()) {
    throw new FootballCorpusUnavailableError(
      'FOOTBALL_CORPUS_S3_BUCKET is not set; football game stats cannot be loaded',
    );
  }
}

/**
 * The player's corpus key: `pfrId` when set, else `pfa-<pfaId>`. Throws when
 * the player has neither — there is no object to read, and recording that as
 * a corpus miss would hide a selection bug.
 */
export function resolvePlayerCorpusKey(player: {
  pfrId: string | null;
  pfaId?: string | null;
}): string {
  const corpusKey = resolveFootballCorpusKey(player);
  if (corpusKey === null) {
    throw new Error('Football player has neither pfr_id nor pfa_id');
  }
  return corpusKey;
}

/**
 * nflverse source for 1999+. Uses the provider package's S3 reads directly
 * rather than its `CareerStats`/`IDPStats`/`TeamDefense` wrappers, because
 * those wrappers fall back to the PFR scraper on a miss.
 */
export const nflverseSource: FootballGameStatsSource = {
  name: 'nflverse',
  async getCareerGameLog(corpusKey, season) {
    assertCorpusConfigured();
    const payload = await getPlayerSeasonPayload(corpusKey, season);
    if (payload === null) return null;
    return {
      passing: payload.passing,
      rushing: payload.rushing,
      receiving: payload.receiving,
      kicking: payload.kicking,
    };
  },
  async getIdpGameLog(corpusKey, season) {
    assertCorpusConfigured();
    const payload = await getPlayerSeasonPayload(corpusKey, season);
    return payload === null ? null : payload.defenseIdp;
  },
  async getTeamDefenseGameLog(nflTeam, season) {
    assertCorpusConfigured();
    const payload = await getTeamDefenseSeasonPayload(nflTeam, season);
    return payload === null ? null : payload.games;
  },
};

/**
 * PFA source for 1960-1998. The provider package validates each object and
 * throws `PfaPayloadError` on a corrupt one, so corruption is never reported
 * as a miss.
 *
 * PFA has no per-game IDP or team-defense data, and no other source does
 * either for these seasons (ADR 0022, LS-9948). Those are permanent gaps, not
 * outages, so they resolve as a miss and the player is recorded as
 * no_game_data_found.
 */
export const pfaSource: FootballGameStatsSource = {
  name: 'pfa',
  async getCareerGameLog(corpusKey, season) {
    assertCorpusConfigured();
    const payload = await getPfaPlayerSeasonPayload(corpusKey, season);
    if (payload === null) return null;
    return {
      passing: payload.passing,
      rushing: payload.rushing,
      receiving: payload.receiving,
      kicking: payload.kicking,
    };
  },
  getIdpGameLog() {
    assertCorpusConfigured();
    return Promise.resolve(null);
  },
  getTeamDefenseGameLog() {
    assertCorpusConfigured();
    return Promise.resolve(null);
  },
};

/** Pick the corpus source that covers `season`. */
export function getFootballGameStatsSource(
  season: number,
): FootballGameStatsSource {
  return season >= NFLVERSE_FIRST_SEASON ? nflverseSource : pfaSource;
}
