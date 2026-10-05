export { CareerStats, IDPStats, TeamDefense } from './lib/provider';

// PFA (1960-1998) half — LS-9997. Not wired into a season router yet (LS-10214).
export { PfaCareerStats } from './lib/pfa-provider';
export {
  buildPfaObjectKey,
  type FootballCorpusIdentity,
  isPfaSeason,
  PFA_FIRST_SEASON,
  PFA_LAST_SEASON,
  PFA_PAYLOAD_VERSION,
  PFA_ONLY_KEY_PREFIX,
  PfaPayloadError,
  type PfaPlayerSeasonPayload,
  resolveFootballCorpusKey,
} from './lib/pfa-types';

export {
  clearFootballCorpusCache,
  getPfaPlayerSeasonPayload,
  getPlayerSeasonPayload,
  getTeamDefenseSeasonPayload,
  isFootballCorpusConfigured,
} from './lib/s3-store';

export {
  buildPlayerObjectKey,
  buildTeamDefenseObjectKey,
  NFLVERSE_ATTRIBUTION,
  NFLVERSE_PAYLOAD_VERSION,
  type NflversePlayerSeasonPayload,
  type NflverseTeamDefenseSeasonPayload,
  type StoredGameFootballDefense,
  type StoredGameFootballDefenseIdp,
  type StoredGameFootballKicking,
  type StoredGameFootballPassing,
  type StoredGameFootballReceiving,
  type StoredGameFootballRushing,
} from './lib/types';

export {
  buildDefenseIdpRows,
  buildGameIdIndex,
  buildGsisToPfrCrosswalk,
  buildKickingRows,
  buildPassingRows,
  buildReceivingRows,
  buildRushingRows,
  buildTeamDefenseGames,
  normalizeNflTeam,
  parseNflverseCsv,
  toNum,
  type NflverseRow,
} from './lib/transform';
