import React, { useMemo, useState } from 'react';
import { Button, Text, XStack, YStack } from 'tamagui';
import {
  computeFootballPlayerGamePoints,
  type FootballScoringSettings,
  getDefaultFootballScoringSettings,
} from '@legacy-sports/scoring';
import {
  detectPreset,
  type FootballScoringFormat,
} from './ScoringSettingsEditor';
import { PremiumGate } from '../../components/PremiumGate';

/** One game's receiving line for a player on the simulated week. */
export interface ScoringFormatSimulatorReceivingLine {
  rec?: number | null;
  yds?: number | null;
  td?: number | null;
}

/** One rostered player on the simulated week. */
export interface ScoringFormatSimulatorPlayer {
  playerId: number;
  playerName: string;
  position: string;
  /** Authoritative points this week, as scored by the league's own profile. */
  totalPoints: number;
  /** Receiving lines from each of this player's games this week. */
  receivingGames: ScoringFormatSimulatorReceivingLine[];
}

export interface ScoringFormatSimulatorProps {
  /** Rostered players with their authoritative weekly score. */
  players: ScoringFormatSimulatorPlayer[];
  /** Authoritative team total for the week, as displayed elsewhere on the page. */
  teamTotalPoints: number;
  /**
   * The league's own receiving `rec` multiplier, read from
   * `GetLeagueScoringProfile`. Undefined until the profile resolves — the
   * panel renders nothing without it, since every number here is expressed
   * relative to the league's own format.
   */
  leagueReceptionPoints: number | undefined;
  /** Whether the viewer holds `ENTITLEMENTS.football_projections`. */
  isPremium: boolean;
  /**
   * Platform-specific upgrade action (web: track + open UpgradeModal; native:
   * track + navigate to subscription-settings). Kept as a prop so this
   * component carries no platform dependency.
   */
  onUpgrade?: () => void;
  testID?: string;
}

/**
 * Shape of one `FootballMatchupStats.players` entry, declared structurally so
 * this module stays free of a `@legacy-sports/graphql` import — the generated
 * type satisfies it, and so does a hand-built test fixture.
 */
export interface MatchupScoresPlayerLike {
  playerId: number;
  playerName: string;
  position: string;
  totalPoints: number;
  games: readonly {
    receiving?: {
      rec?: number | null;
      yds?: number | null;
      td?: number | null;
    } | null;
  }[];
}

/** Maps a `MatchupScores` team's players onto the simulator's props. */
export function toScoringFormatSimulatorPlayers(
  players: readonly MatchupScoresPlayerLike[] | undefined,
): ScoringFormatSimulatorPlayer[] {
  return (players ?? []).map((player) => ({
    playerId: player.playerId,
    playerName: player.playerName,
    position: player.position,
    totalPoints: player.totalPoints,
    receivingGames: player.games
      .map((game) => game.receiving)
      .filter((line): line is NonNullable<typeof line> => line != null),
  }));
}

/** Shape of a `GetLeagueScoringProfile` result, declared structurally. */
export interface LeagueScoringProfileLike {
  stats?:
    | readonly ({
        multiplier?: number | null;
        definition?: {
          statGroup?: string | null;
          statKey?: string | null;
        } | null;
      } | null)[]
    | null;
}

/**
 * The league's receiving `rec` multiplier — the one value a football scoring
 * format actually sets. Undefined when the profile has not resolved or does
 * not carry a reception entry, which is the simulator's "render nothing" case.
 */
export function getLeagueReceptionPoints(
  profile: LeagueScoringProfileLike | null | undefined,
): number | undefined {
  const receptionStat = profile?.stats?.find(
    (stat) =>
      stat?.definition?.statGroup === 'receiving' &&
      stat.definition.statKey === 'rec',
  );

  const multiplier = receptionStat?.multiplier;

  return typeof multiplier === 'number' && Number.isFinite(multiplier)
    ? multiplier
    : undefined;
}

/**
 * Analytics/display name and upsell copy for this feature. Exported so the
 * platform upgrade paths (web's UpgradeModal, native's
 * `trackPremiumFeatureClick`) use the same strings the locked gate shows,
 * instead of each restating them.
 */
export const SCORING_SIMULATOR_FEATURE_NAME = 'Scoring Format Simulator';
export const SCORING_SIMULATOR_FEATURE_DESCRIPTION =
  'See what this week would have scored if your league used Standard, Half-PPR or PPR receptions.';

const FORMAT_LABELS: Record<FootballScoringFormat, string> = {
  standard: 'Standard',
  half_ppr: 'Half-PPR',
  ppr: 'PPR',
  custom: 'Custom',
};

interface SimulatedFormat {
  format: FootballScoringFormat;
  receptionPoints: number;
}

/**
 * The three formats a manager can simulate, and their reception multiplier.
 * These are the same thresholds `detectPreset` classifies against, and the
 * only value a league's scoring format actually changes (see
 * `LeagueService.createLeague`, which overrides `receiving_rec` and nothing
 * else when a format is picked at league creation).
 */
const SIMULATED_FORMATS: readonly SimulatedFormat[] = Object.freeze([
  { format: 'standard', receptionPoints: 0 },
  { format: 'half_ppr', receptionPoints: 0.5 },
  { format: 'ppr', receptionPoints: 1 },
]);

/**
 * Platform defaults with the receiving `rec` multiplier swapped out. Every
 * other weight is left at its default on purpose — see `playerDelta`.
 */
function settingsWithReceptionPoints(
  receptionPoints: number,
): FootballScoringSettings {
  const settings = getDefaultFootballScoringSettings();
  return {
    ...settings,
    receiving: { ...settings.receiving, rec: receptionPoints },
  };
}

/**
 * How many points this player's week gains or loses if the league's reception
 * scoring changed from `baselinePoints` to `targetPoints`.
 *
 * Both sides run through the shared scoring engine
 * (`computeFootballPlayerGamePoints`) rather than multiplying receptions by
 * hand, so the simulation automatically tracks any future change to how the
 * receiving group is scored.
 *
 * The stat row deliberately carries only the receiving group. The two calls
 * share every non-receiving multiplier, so every term the row omits —
 * sacks taken, fumbles, 50+ yard field goals, defensive yardage splits —
 * contributes identically on both sides and cancels exactly in the
 * subtraction. That is what lets the caller add this delta to the server's
 * authoritative total and get a simulated total that cannot disagree with the
 * score already on screen.
 */
function playerDelta(
  player: ScoringFormatSimulatorPlayer,
  baselineSettings: FootballScoringSettings,
  targetSettings: FootballScoringSettings,
): number {
  let delta = 0;

  for (const game of player.receivingGames) {
    const row = {
      offense: {
        rec: game.rec ?? null,
        recYds: game.yds ?? null,
        recTd: game.td ?? null,
      },
    };

    delta +=
      computeFootballPlayerGamePoints(row, targetSettings) -
      computeFootballPlayerGamePoints(row, baselineSettings);
  }

  return delta;
}

function roundPoints(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatPoints(value: number): string {
  return roundPoints(value).toFixed(2);
}

function formatDelta(value: number): string {
  const rounded = roundPoints(value);
  if (rounded === 0) {
    return '—';
  }
  return `${rounded > 0 ? '+' : ''}${rounded.toFixed(2)}`;
}

function deltaColor(value: number): string {
  const rounded = roundPoints(value);
  if (rounded > 0) return '$green10';
  if (rounded < 0) return '$red10';
  return '$gray10';
}

interface SimulatedFormatRow {
  format: FootballScoringFormat;
  label: string;
  receptionPoints: number;
  isBaseline: boolean;
  total: number;
  delta: number;
  playerDeltas: { playerId: number; label: string; delta: number }[];
}

/**
 * LS-6454 (FTD-028) — premium "what would my score be if my league used PPR?"
 * preview for football Team Detail.
 *
 * Collapsed by default so the default view keeps a single toggle row. Expanded,
 * it re-scores the week already on screen under Standard / Half-PPR / PPR and
 * shows each format's team total alongside the delta versus the league's own
 * format, with a per-player breakdown for the players whose score moves.
 */
export function ScoringFormatSimulator({
  players,
  teamTotalPoints,
  leagueReceptionPoints,
  isPremium,
  onUpgrade,
  testID = 'football-scoring-simulator',
}: ScoringFormatSimulatorProps): React.JSX.Element | null {
  const [expanded, setExpanded] = useState(false);
  const [openFormat, setOpenFormat] = useState<FootballScoringFormat | null>(
    null,
  );

  const rows = useMemo<SimulatedFormatRow[]>(() => {
    if (leagueReceptionPoints === undefined) {
      return [];
    }

    const baselineSettings = settingsWithReceptionPoints(leagueReceptionPoints);

    return SIMULATED_FORMATS.map(({ format, receptionPoints }) => {
      const targetSettings = settingsWithReceptionPoints(receptionPoints);

      const perPlayer = players.map((player) => ({
        playerId: player.playerId,
        label: `${player.playerName} (${player.position})`,
        delta: playerDelta(player, baselineSettings, targetSettings),
      }));

      const delta = perPlayer.reduce((sum, entry) => sum + entry.delta, 0);

      const playerDeltas = perPlayer
        .filter((entry) => roundPoints(entry.delta) !== 0)
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

      return {
        format,
        label: FORMAT_LABELS[format],
        receptionPoints,
        // A league already on this format is the baseline: same settings on
        // both sides of the subtraction, so the delta is exactly zero.
        isBaseline: receptionPoints === leagueReceptionPoints,
        total: teamTotalPoints + delta,
        delta,
        playerDeltas,
      };
    });
  }, [players, teamTotalPoints, leagueReceptionPoints]);

  if (leagueReceptionPoints === undefined) {
    return null;
  }

  const leagueFormat = detectPreset(leagueReceptionPoints);

  return (
    <YStack
      testID={testID}
      padding="$3"
      backgroundColor="$color2"
      borderRadius="$3"
      margin="$3"
      marginTop="$1"
      gap="$2"
    >
      <Button
        chromeless
        justifyContent="space-between"
        onPress={() => setExpanded((prev) => !prev)}
        testID={`${testID}-toggle`}
      >
        <Text fontSize="$3" fontWeight="600">
          Simulate scoring format
        </Text>
        <Text fontSize="$2" color="$gray10">
          {expanded ? 'Hide ▲' : 'What if? ▼'}
        </Text>
      </Button>

      {expanded && (
        <PremiumGate
          isPremium={isPremium}
          featureName={SCORING_SIMULATOR_FEATURE_NAME}
          featureDescription={SCORING_SIMULATOR_FEATURE_DESCRIPTION}
          onUpgrade={onUpgrade}
        >
          <YStack testID={`${testID}-results`} gap="$2" paddingTop="$1">
            <Text fontSize="$2" color="$gray10">
              This week scored {formatPoints(teamTotalPoints)} under your
              league&apos;s {FORMAT_LABELS[leagueFormat]} scoring.
            </Text>

            {rows.map((row) => (
              <YStack key={row.format} gap="$1">
                <Button
                  chromeless
                  justifyContent="space-between"
                  disabled={row.playerDeltas.length === 0}
                  onPress={() =>
                    setOpenFormat((prev) =>
                      prev === row.format ? null : row.format,
                    )
                  }
                  testID={`${testID}-format-${row.format}`}
                >
                  <XStack alignItems="center" gap="$2">
                    <Text fontSize="$2" fontWeight="600">
                      {row.label}
                    </Text>
                    {row.isBaseline && (
                      <Text
                        fontSize="$1"
                        color="$gray10"
                        testID={`${testID}-baseline`}
                      >
                        your league
                      </Text>
                    )}
                  </XStack>
                  <XStack alignItems="center" gap="$3">
                    <Text fontSize="$2" fontWeight="600">
                      {formatPoints(row.total)}
                    </Text>
                    <Text
                      fontSize="$2"
                      color={deltaColor(row.delta)}
                      testID={`${testID}-delta-${row.format}`}
                    >
                      {formatDelta(row.delta)}
                    </Text>
                  </XStack>
                </Button>

                {openFormat === row.format && row.playerDeltas.length > 0 && (
                  <YStack
                    gap="$1"
                    paddingLeft="$3"
                    testID={`${testID}-players-${row.format}`}
                  >
                    {row.playerDeltas.map((entry) => (
                      <XStack
                        key={entry.playerId}
                        justifyContent="space-between"
                      >
                        <Text fontSize="$2" color="$gray10">
                          {entry.label}
                        </Text>
                        <Text fontSize="$2" color={deltaColor(entry.delta)}>
                          {formatDelta(entry.delta)}
                        </Text>
                      </XStack>
                    ))}
                  </YStack>
                )}
              </YStack>
            ))}
          </YStack>
        </PremiumGate>
      )}
    </YStack>
  );
}
