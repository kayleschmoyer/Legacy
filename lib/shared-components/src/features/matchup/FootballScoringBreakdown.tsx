import React, { useMemo, useState } from 'react';
import { Card, Separator, Spinner, Text, XStack, YStack } from 'tamagui';
import { TABULAR_NUMS } from '../../utils/typography';
import { StatCategory } from '../football/StatCategory';

/**
 * One NFL game played by a rostered player during the matchup week, with the
 * stat groups the box score renders. Every group is optional — a player only
 * carries the groups their position produced (LS-6393).
 */
export interface FootballScoringBreakdownGame {
  gameNum: number;
  opponent?: string | null;
  fantasyPoints: number;
  passing?: {
    att?: number | null;
    cmp?: number | null;
    yds?: number | null;
    td?: number | null;
    int?: number | null;
  } | null;
  rushing?: {
    att?: number | null;
    yds?: number | null;
    td?: number | null;
  } | null;
  receiving?: {
    tgt?: number | null;
    rec?: number | null;
    yds?: number | null;
    td?: number | null;
  } | null;
  kicking?: {
    fgm?: number | null;
    fga?: number | null;
    xpm?: number | null;
    xpa?: number | null;
  } | null;
  defense?: {
    sacks?: number | null;
    int?: number | null;
    fumRec?: number | null;
    defTd?: number | null;
    safeties?: number | null;
    ptsAllowed?: number | null;
    ydsAllowed?: number | null;
  } | null;
  idp?: {
    soloTkl?: number | null;
    astTkl?: number | null;
    sacks?: number | null;
    int?: number | null;
    ff?: number | null;
    fr?: number | null;
    pd?: number | null;
    defTd?: number | null;
  } | null;
}

/** One rostered player's week, as rendered by a single accordion row. */
export interface FootballScoringBreakdownPlayer {
  playerId: number;
  playerName: string;
  position: string;
  totalPoints: number;
  projectedPoints?: number | null;
  games: readonly FootballScoringBreakdownGame[];
}

/** One side of the matchup. */
export interface FootballScoringBreakdownTeam {
  teamId: number;
  teamName: string;
  totalPoints: number;
  players: readonly FootballScoringBreakdownPlayer[];
}

export interface FootballScoringBreakdownProps {
  /** Both matchup teams, in display order (team1 first). */
  teams: readonly FootballScoringBreakdownTeam[];
  /** True while the underlying `MatchupScores` query is in flight. */
  loading?: boolean;
  testID?: string;
}

/**
 * Shape of one `FootballMatchupStats` entry from `MatchupScores`, declared
 * structurally so this module stays free of a `@legacy-sports/graphql` import
 * — the generated type satisfies it, and so does a hand-built test fixture.
 * Mirrors the `MatchupScoresPlayerLike` convention in
 * {@link ../football/ScoringFormatSimulator}.
 */
export interface MatchupScoresTeamLike {
  __typename?: string;
  teamId?: number | null;
  teamName?: string | null;
  totalPoints?: number | null;
  players?: readonly FootballScoringBreakdownPlayer[] | null;
}

/**
 * Picks the two matchup teams out of a week's `matchupScores` (which covers
 * every matchup in the league that week) and maps them onto this component's
 * props, in `[team1, team2]` order. Teams with no entry in the response — the
 * scores not having landed yet — are dropped rather than rendered empty.
 */
export function toFootballScoringBreakdownTeams(
  scores: readonly MatchupScoresTeamLike[] | undefined | null,
  teamIds: readonly (number | null | undefined)[],
): FootballScoringBreakdownTeam[] {
  const teams: FootballScoringBreakdownTeam[] = [];

  for (const teamId of teamIds) {
    if (teamId == null) continue;

    const stats = (scores ?? []).find(
      (entry) =>
        entry.__typename === 'FootballMatchupStats' && entry.teamId === teamId,
    );
    if (!stats) continue;

    teams.push({
      teamId,
      teamName: stats.teamName ?? `Team ${teamId}`,
      totalPoints: stats.totalPoints ?? 0,
      players: stats.players ?? [],
    });
  }

  return teams;
}

/** A labeled stat group rendered as one line of the expanded game row. */
export interface FootballStatCategoryLine {
  label: string;
  value: string;
}

function isPresent(value: number | null | undefined): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value !== 0;
}

/**
 * A made/attempted pair (`"22/31"`, `"1/2 FG"`). Suppressed entirely when both
 * halves are zero or absent — a 0/0 line is noise, while 0/2 is a real miss.
 */
function formatPair(
  made: number | null | undefined,
  attempted: number | null | undefined,
  suffix?: string,
): string | null {
  if (!isPresent(made) && !isPresent(attempted)) return null;
  const pair = `${made ?? 0}/${attempted ?? 0}`;
  return suffix ? `${pair} ${suffix}` : pair;
}

/**
 * Joins a stat group's surviving terms into `"22/31, 254 YDS, 2 TD"`-style
 * text. Callers pass `null` for every zero/absent term, so a group whose terms
 * are all zero collapses to `null` and produces no line at all — a WR with an
 * empty rushing row should not render "Rush 0 YDS".
 */
function joinTerms(terms: (string | null)[]): string | null {
  const present = terms.filter((term): term is string => term != null);
  return present.length > 0 ? present.join(', ') : null;
}

/**
 * The stat lines for one game, in offensive-to-defensive reading order. Pure
 * and exported so the formatting is unit-testable without rendering.
 */
export function buildStatCategoryLines(
  game: FootballScoringBreakdownGame,
): FootballStatCategoryLine[] {
  const lines: FootballStatCategoryLine[] = [];

  const passing = game.passing;
  if (passing) {
    const value = joinTerms([
      formatPair(passing.cmp, passing.att),
      passing.yds ? `${passing.yds} YDS` : null,
      passing.td ? `${passing.td} TD` : null,
      passing.int ? `${passing.int} INT` : null,
    ]);
    if (value) lines.push({ label: 'Pass', value });
  }

  const rushing = game.rushing;
  if (rushing) {
    const value = joinTerms([
      rushing.att ? `${rushing.att} ATT` : null,
      rushing.yds ? `${rushing.yds} YDS` : null,
      rushing.td ? `${rushing.td} TD` : null,
    ]);
    if (value) lines.push({ label: 'Rush', value });
  }

  const receiving = game.receiving;
  if (receiving) {
    const value = joinTerms([
      formatPair(receiving.rec, receiving.tgt, 'REC'),
      receiving.yds ? `${receiving.yds} YDS` : null,
      receiving.td ? `${receiving.td} TD` : null,
    ]);
    if (value) lines.push({ label: 'Rec', value });
  }

  const kicking = game.kicking;
  if (kicking) {
    const value = joinTerms([
      formatPair(kicking.fgm, kicking.fga, 'FG'),
      formatPair(kicking.xpm, kicking.xpa, 'XP'),
    ]);
    if (value) lines.push({ label: 'Kick', value });
  }

  const defense = game.defense;
  if (defense) {
    const value = joinTerms([
      defense.sacks ? `${defense.sacks} SACK` : null,
      defense.int ? `${defense.int} INT` : null,
      defense.fumRec ? `${defense.fumRec} FR` : null,
      defense.defTd ? `${defense.defTd} TD` : null,
      defense.safeties ? `${defense.safeties} SAF` : null,
      defense.ptsAllowed != null ? `${defense.ptsAllowed} PA` : null,
      defense.ydsAllowed != null ? `${defense.ydsAllowed} YA` : null,
    ]);
    if (value) lines.push({ label: 'Def', value });
  }

  const idp = game.idp;
  if (idp) {
    const value = joinTerms([
      idp.soloTkl ? `${idp.soloTkl} SOLO` : null,
      idp.astTkl ? `${idp.astTkl} AST` : null,
      idp.sacks ? `${idp.sacks} SACK` : null,
      idp.int ? `${idp.int} INT` : null,
      idp.ff ? `${idp.ff} FF` : null,
      idp.fr ? `${idp.fr} FR` : null,
      idp.pd ? `${idp.pd} PD` : null,
      idp.defTd ? `${idp.defTd} TD` : null,
    ]);
    if (value) lines.push({ label: 'IDP', value });
  }

  return lines;
}

/** One decimal place, matching the per-player points shown on roster rows. */
function formatPoints(points: number): string {
  return points.toFixed(1);
}

function GameRow({ game }: { game: FootballScoringBreakdownGame }) {
  const lines = buildStatCategoryLines(game);

  return (
    <YStack
      gap="$1"
      paddingHorizontal="$3"
      paddingVertical="$2"
      testID={`breakdown-game-${game.gameNum}`}
    >
      <XStack alignItems="baseline" gap="$2">
        <Text fontSize={12} fontWeight="700" color="$gray11" flex={1}>
          {game.opponent ? `vs ${game.opponent}` : `Game ${game.gameNum}`}
        </Text>
        <Text fontSize={12} fontWeight="700" color="$color12" {...TABULAR_NUMS}>
          {formatPoints(game.fantasyPoints)} pts
        </Text>
      </XStack>

      {lines.length > 0 ? (
        lines.map((line) => (
          <StatCategory key={line.label} label={line.label}>
            <Text fontSize={11} color="$color12" {...TABULAR_NUMS}>
              {line.value}
            </Text>
          </StatCategory>
        ))
      ) : (
        <Text fontSize={11} color="$gray9">
          No recorded stats
        </Text>
      )}
    </YStack>
  );
}

function PlayerRow({
  player,
  expanded,
  onToggle,
}: {
  player: FootballScoringBreakdownPlayer;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <YStack testID={`breakdown-player-${player.playerId}`}>
      <XStack
        paddingHorizontal="$3"
        paddingVertical="$2"
        alignItems="center"
        gap="$2"
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${player.playerName}, ${formatPoints(
          player.totalPoints,
        )} points. ${expanded ? 'Collapse' : 'Expand'} game stats.`}
        onPress={onToggle}
        cursor="pointer"
        // Keyboard parity for the web build of this row — `onPress` alone is
        // pointer/touch-only, so the accordion would be unreachable by keyboard
        // (same treatment as MatchupCard's pressable surface).
        tabIndex={0}
        onKeyDown={(event: React.KeyboardEvent) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onToggle();
          }
        }}
        pressStyle={{ opacity: 0.6 }}
        testID={`breakdown-player-toggle-${player.playerId}`}
      >
        <Text fontSize={11} fontWeight="700" color="$gray9" minWidth={30}>
          {player.position}
        </Text>
        <Text fontSize={13} color="$color12" flex={1} numberOfLines={1}>
          {player.playerName}
        </Text>
        <Text fontSize={13} fontWeight="700" color="$color12" {...TABULAR_NUMS}>
          {formatPoints(player.totalPoints)}
        </Text>
        <Text fontSize={11} color="$gray9">
          {expanded ? '▾' : '▸'}
        </Text>
      </XStack>

      {expanded ? (
        <YStack backgroundColor="$backgroundHover" paddingBottom="$1">
          {player.games.length > 0 ? (
            player.games.map((game) => (
              <GameRow key={game.gameNum} game={game} />
            ))
          ) : (
            <Text
              fontSize={11}
              color="$gray9"
              paddingHorizontal="$3"
              paddingVertical="$2"
            >
              No games played this week
            </Text>
          )}
        </YStack>
      ) : null}
    </YStack>
  );
}

/**
 * Per-player box score for a football matchup week: one tap-to-expand row per
 * rostered player, revealing that player's per-game pass/rush/recv/kick/def/IDP
 * line and fantasy points (LS-6393).
 *
 * Built here rather than in `apps/app` so web's matchup detail page can adopt
 * the same rows (shared-components-first); mobile is the only consumer today.
 *
 * Rows are rendered directly rather than through a `FlatList`: the screen
 * already nests this inside a `ScrollView`, where a nested virtualized list is
 * an explicit React Native anti-pattern (`VirtualizedLists should never be
 * nested inside plain ScrollViews`), and the list is bounded by the league's
 * roster size rather than being open-ended.
 */
export function FootballScoringBreakdown({
  teams,
  loading = false,
  testID = 'football-scoring-breakdown',
}: FootballScoringBreakdownProps) {
  const [expandedPlayerIds, setExpandedPlayerIds] = useState<
    ReadonlySet<number>
  >(() => new Set());

  const hasPlayers = useMemo(
    () => teams.some((team) => team.players.length > 0),
    [teams],
  );

  const togglePlayer = (playerId: number) => {
    setExpandedPlayerIds((current) => {
      const next = new Set(current);
      if (next.has(playerId)) {
        next.delete(playerId);
      } else {
        next.add(playerId);
      }
      return next;
    });
  };

  if (loading) {
    return (
      <YStack alignItems="center" padding="$4" testID={`${testID}-loading`}>
        <Spinner size="small" color="$brandNavyLight" />
      </YStack>
    );
  }

  // Nothing to show until the week's scores land — render no section at all
  // rather than an empty card under the rosters.
  if (!hasPlayers) return null;

  return (
    <YStack gap="$3" testID={testID}>
      {teams.map((team) => (
        <Card
          key={team.teamId}
          bordered
          backgroundColor="$background"
          borderRadius="$4"
          overflow="hidden"
          testID={`${testID}-team-${team.teamId}`}
        >
          <XStack
            paddingHorizontal="$3"
            paddingVertical="$2"
            backgroundColor="$backgroundHover"
            alignItems="center"
            gap="$2"
          >
            <Text
              fontSize={13}
              fontWeight="700"
              color="$color12"
              flex={1}
              numberOfLines={1}
            >
              {team.teamName} · Box Score
            </Text>
            <Text
              fontSize={13}
              fontWeight="700"
              color="$color12"
              {...TABULAR_NUMS}
            >
              {formatPoints(team.totalPoints)}
            </Text>
          </XStack>

          <Separator />

          {team.players.map((player) => (
            <PlayerRow
              key={player.playerId}
              player={player}
              expanded={expandedPlayerIds.has(player.playerId)}
              onToggle={() => togglePlayer(player.playerId)}
            />
          ))}
        </Card>
      ))}
    </YStack>
  );
}

export default FootballScoringBreakdown;
