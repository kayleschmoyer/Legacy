import { useMemo } from 'react';
import type {
  AvailableDraftPlayer,
  DraftPickRecord,
  DraftPlayer,
  PlayerStatsEntry,
} from '../types';

const PITCHER_POSITIONS = new Set(['P', 'SP', 'RP']);
const OUTFIELD_POSITIONS = new Set(['OF', 'CF', 'LF', 'RF']);

export const isPitcherPosition = (pos: string): boolean =>
  PITCHER_POSITIONS.has(pos.toUpperCase());

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
}

export function usePlayerData({
  availablePlayers,
  pickHistory,
  playerStatsMap,
  pitchingStatsMap,
  myTeamId,
}: UsePlayerDataParams) {
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
      const pitcher =
        (ap.eligiblePositions?.some(isPitcherPosition) ?? false) ||
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
      });
    }
    // Seed from pick history for drafted players absent from stats
    for (const pick of pickHistory) {
      if (!map.has(pick.playerId) && pick.player) {
        const name = `${pick.player.firstName} ${pick.player.lastName}`.trim();
        if (name) {
          const ps = pitchingStatsMap.get(pick.playerId);
          map.set(pick.playerId, {
            id: pick.playerId,
            name,
            position: ps
              ? ps.gamesStarted >= ps.games / 2
                ? 'SP'
                : 'RP'
              : 'P',
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
          });
        }
      }
    }
    return map;
  }, [availablePlayers, pickHistory, playerStatsMap, pitchingStatsMap]);

  // Merge available players with stats for rich card display
  const enrichedPlayers: DraftPlayer[] = useMemo(() => {
    return availablePlayers.map((ap) => {
      const s = playerStatsMap.get(ap.id);
      // Derive position from eligiblePositions (authoritative) since primaryPosition
      // is no longer fetched in GetDraftPlayerStats (LS-3113).
      const pos = ap.eligiblePositions?.[0] ?? s?.position ?? 'UTIL';
      const pitcher =
        (ap.eligiblePositions?.some(isPitcherPosition) ?? false) ||
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
      };
    });
  }, [availablePlayers, playerStatsMap, pitchingStatsMap]);

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
