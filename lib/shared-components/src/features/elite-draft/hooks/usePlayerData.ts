import { useMemo } from 'react';
import type {
  AvailableDraftPlayer,
  DraftPickRecord,
  DraftPlayer,
  PlayerFootballStatsEntry,
  PlayerStatsEntry,
} from '../types';
import type { SportKind } from '../../../config/sports';

const PITCHER_POSITIONS = new Set(['P', 'SP', 'RP']);
const OUTFIELD_POSITIONS = new Set(['OF', 'CF', 'LF', 'RF']);

export const isPitcherPosition = (pos: string): boolean =>
  PITCHER_POSITIONS.has(pos.toUpperCase());

/**
 * Football stat fields for a DraftPlayer (LS-9478). Every field stays
 * undefined — never defaults to 0 — when the player has no entry in
 * footballStatsMap (no career row in any of the four source tables) so the
 * board renders an em-dash instead of repeating the LS-9473 fabricated-zero
 * defect (`?? 0` on an unmeasured stat).
 *
 * `td` is the board's generic TD column: rushTd + recTd. Passing TDs are
 * excluded (already implied by passYds for QBs, per the LS-9478 field-mapping
 * decision) — it stays undefined only when the player has neither a rushing
 * nor a receiving row, not when both are a measured 0.
 */
function footballStatFields(
  stats: PlayerFootballStatsEntry | undefined,
): Pick<
  DraftPlayer,
  'passYds' | 'passTd' | 'rushYds' | 'rushTd' | 'rec' | 'recTd' | 'td' | 'fg'
> {
  const hasRushOrRecTd = stats?.rushTd != null || stats?.recTd != null;
  return {
    passYds: stats?.passYds,
    passTd: stats?.passTd,
    rushYds: stats?.rushYds,
    rushTd: stats?.rushTd,
    rec: stats?.rec,
    recTd: stats?.recTd,
    td: hasRushOrRecTd ? (stats?.rushTd ?? 0) + (stats?.recTd ?? 0) : undefined,
    fg: stats?.fg,
  };
}

interface PitchingStats {
  wins: number;
  losses: number;
  era: number;
  strikeouts: number;
  saves: number;
  games: number;
  gamesStarted: number;
  whip: number;
  winPct: number;
}

interface UsePlayerDataParams {
  availablePlayers: AvailableDraftPlayer[];
  pickHistory: DraftPickRecord[];
  playerStatsMap: Map<number, PlayerStatsEntry>;
  pitchingStatsMap: Map<number, PitchingStats>;
  myTeamId: number | null;
  /** League sport (LS-9478). Defaults to 'baseball' so existing callers that
   * don't yet pass a sport (e.g. the spectator room) are unaffected. */
  sport?: SportKind;
  /** Football stat lookup (LS-9478), keyed by player id. Ignored when sport
   * is not 'football'. Defaults to an empty map. */
  footballStatsMap?: Map<number, PlayerFootballStatsEntry>;
}

const EMPTY_FOOTBALL_STATS_MAP: Map<number, PlayerFootballStatsEntry> =
  new Map();

export function usePlayerData({
  availablePlayers,
  pickHistory,
  playerStatsMap,
  pitchingStatsMap,
  myTeamId,
  sport = 'baseball',
  footballStatsMap = EMPTY_FOOTBALL_STATS_MAP,
}: UsePlayerDataParams) {
  const isFootball = sport === 'football';
  // Build a lookup map by player ID for displaying player names in history/board
  const statsLookup = useMemo(() => {
    const map = new Map<number, DraftPlayer>();
    // Seed from playerStatsMap
    for (const [pid, s] of playerStatsMap) {
      const pitcher = isPitcherPosition(s.position);
      const ps = pitcher ? pitchingStatsMap.get(pid) : undefined;
      map.set(pid, {
        id: pid,
        name:
          `${s.firstName} ${s.lastName}`.trim() ||
          `Unknown Player (ID: ${pid})`,
        position: s.position,
        avg: s.avg,
        hr: s.hr,
        rbi: s.rbi,
        runs: s.runs,
        sb: s.sb,
        games: ps?.games ?? s.games,
        hits: s.hits,
        obp: s.obp,
        slg: s.slg,
        isPitcher: pitcher,
        wins: ps?.wins,
        losses: ps?.losses,
        era: ps?.era,
        strikeouts: ps?.strikeouts,
        saves: ps?.saves,
        whip: ps?.whip,
        winPct: ps?.winPct,
        gamesStarted: ps?.gamesStarted,
      });
    }
    // Override with available players (authoritative firstName/lastName)
    for (const ap of availablePlayers) {
      const s = playerStatsMap.get(ap.id);
      // primaryPosition is no longer fetched in GetDraftPlayerStats to avoid
      // expensive DataLoader calls that caused 502s (LS-3113). Derive position
      // from eligiblePositions (authoritative, from player_eligible_positions
      // materialized view) and fall back to the stats entry when absent.
      const pos = ap.eligiblePositions?.[0] ?? s?.position ?? 'UTIL';
      // Determine pitcher status using eligiblePositions (authoritative) first,
      // then pitchingStatsMap presence, then position — covers pure pitchers that
      // are absent from playerStatsMap (no career batting row) (LS-3115).
      const pitcher =
        (ap.eligiblePositions?.some(isPitcherPosition) ?? false) ||
        pitchingStatsMap.has(ap.id) ||
        isPitcherPosition(pos);
      const ps = pitcher ? pitchingStatsMap.get(ap.id) : undefined;
      map.set(ap.id, {
        id: ap.id,
        name: `${ap.firstName} ${ap.lastName}`.trim(),
        position: pos,
        eligiblePositions: ap.eligiblePositions ?? undefined,
        avg: s?.avg ?? 0,
        hr: s?.hr ?? 0,
        rbi: s?.rbi ?? 0,
        runs: s?.runs ?? 0,
        sb: s?.sb ?? 0,
        games: ps?.games ?? s?.games ?? 0,
        hits: s?.hits ?? 0,
        obp: s?.obp ?? 0,
        slg: s?.slg ?? 0,
        isPitcher: pitcher,
        wins: ps?.wins,
        losses: ps?.losses,
        era: ps?.era,
        strikeouts: ps?.strikeouts,
        saves: ps?.saves,
        whip: ps?.whip,
        winPct: ps?.winPct,
        gamesStarted: ps?.gamesStarted,
        ppg: ap.projectedMatchupPoints ?? null,
        adp: ap.adp ?? null,
        club: ap.club ?? null,
        ...footballStatFields(
          isFootball ? footballStatsMap.get(ap.id) : undefined,
        ),
      });
    }
    // Seed from pick history for drafted players absent from stats, and fix
    // position for players seeded from playerStatsMap whose position is 'UTIL'
    // (playerStatsMap hardcodes position as 'UTIL' since primaryPosition was
    // removed from GetDraftPlayerStats to avoid expensive DataLoader calls —
    // LS-3113, LS-3647).
    for (const pick of pickHistory) {
      if (!pick.player) continue;
      const name = `${pick.player.firstName} ${pick.player.lastName}`.trim();
      if (!name) continue;
      const ps = pitchingStatsMap.get(pick.playerId);
      if (!map.has(pick.playerId)) {
        // Player has no batting stats (e.g. pure pitcher) — add entry
        map.set(pick.playerId, {
          id: pick.playerId,
          name,
          position:
            pick.player.eligiblePositions?.[0] ??
            (ps ? (ps.gamesStarted >= ps.games / 2 ? 'SP' : 'RP') : 'P'),
          eligiblePositions: pick.player.eligiblePositions ?? undefined,
          club: pick.player.club ?? null,
          avg: 0,
          hr: 0,
          rbi: 0,
          runs: 0,
          sb: 0,
          games: ps?.games ?? 0,
          hits: 0,
          obp: 0,
          slg: 0,
          ...(ps && {
            era: ps.era,
            wins: ps.wins,
            losses: ps.losses,
            saves: ps.saves,
            strikeouts: ps.strikeouts,
            gamesStarted: ps.gamesStarted,
          }),
          ...footballStatFields(
            isFootball ? footballStatsMap.get(pick.playerId) : undefined,
          ),
        });
      } else if (pick.player.eligiblePositions?.length) {
        // Player is in map from playerStatsMap with hardcoded 'UTIL' — patch
        // position and eligiblePositions using the authoritative server data.
        const existing = map.get(pick.playerId);
        if (existing?.position === 'UTIL') {
          map.set(pick.playerId, {
            ...existing,
            position: pick.player.eligiblePositions[0],
            eligiblePositions: pick.player.eligiblePositions,
          });
        }
      }
    }
    return map;
  }, [
    availablePlayers,
    pickHistory,
    playerStatsMap,
    pitchingStatsMap,
    isFootball,
    footballStatsMap,
  ]);

  // Merge available players with stats for rich card display
  const enrichedPlayers: DraftPlayer[] = useMemo(() => {
    return availablePlayers.map((ap) => {
      const s = playerStatsMap.get(ap.id);
      // Derive position from eligiblePositions (authoritative) since primaryPosition
      // is no longer fetched in GetDraftPlayerStats (LS-3113).
      const pos = ap.eligiblePositions?.[0] ?? s?.position ?? 'UTIL';
      // Determine pitcher status using eligiblePositions (authoritative) first,
      // then pitchingStatsMap presence, then position — covers pure pitchers that
      // are absent from playerStatsMap (no career batting row) (LS-3115).
      const pitcher =
        (ap.eligiblePositions?.some(isPitcherPosition) ?? false) ||
        pitchingStatsMap.has(ap.id) ||
        isPitcherPosition(pos);
      const ps = pitcher ? pitchingStatsMap.get(ap.id) : undefined;
      return {
        id: ap.id,
        name: `${ap.firstName} ${ap.lastName}`.trim(),
        position: pos,
        eligiblePositions: ap.eligiblePositions ?? undefined,
        avg: s?.avg ?? 0,
        hr: s?.hr ?? 0,
        rbi: s?.rbi ?? 0,
        runs: s?.runs ?? 0,
        sb: s?.sb ?? 0,
        games: ps?.games ?? s?.games ?? 0,
        hits: s?.hits ?? 0,
        obp: s?.obp ?? 0,
        slg: s?.slg ?? 0,
        isPitcher: pitcher,
        wins: ps?.wins,
        losses: ps?.losses,
        era: ps?.era,
        strikeouts: ps?.strikeouts,
        saves: ps?.saves,
        whip: ps?.whip,
        winPct: ps?.winPct,
        gamesStarted: ps?.gamesStarted,
        ppg: ap.projectedMatchupPoints ?? null,
        adp: ap.adp ?? null,
        club: ap.club ?? null,
        ...footballStatFields(
          isFootball ? footballStatsMap.get(ap.id) : undefined,
        ),
      };
    });
  }, [
    availablePlayers,
    playerStatsMap,
    pitchingStatsMap,
    isFootball,
    footballStatsMap,
  ]);

  // My team picks from history
  const myTeamPicks = useMemo(
    () => pickHistory.filter((p) => p.teamId === myTeamId),
    [pickHistory, myTeamId],
  );

  // My drafted players mapped to DraftPlayer for roster display
  const myTeam: DraftPlayer[] = useMemo(
    () =>
      myTeamPicks.map((pick) => {
        const player = statsLookup.get(pick.playerId);
        if (player) return player;
        return {
          id: pick.playerId,
          name: `Unknown Player (ID: ${pick.playerId})`,
          position: 'UTIL',
          avg: 0,
          hr: 0,
          rbi: 0,
          runs: 0,
          sb: 0,
          games: 0,
          hits: 0,
          obp: 0,
          slg: 0,
        };
      }),
    [myTeamPicks, statsLookup],
  );

  const positionCounts = useMemo(
    () =>
      myTeam.reduce<Record<string, number>>((acc, p) => {
        const key = OUTFIELD_POSITIONS.has(p.position)
          ? 'OF'
          : PITCHER_POSITIONS.has(p.position)
            ? 'P'
            : p.position;
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      }, {}),
    [myTeam],
  );

  return {
    statsLookup,
    enrichedPlayers,
    myTeamPicks,
    myTeam,
    positionCounts,
  } as const;
}
