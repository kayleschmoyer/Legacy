import React from 'react';
import { ScrollView, Spinner, Text, XStack, YStack } from 'tamagui';
import {
  type GetPlayerDetailByIdQuery,
  useGetPlayerDetailByIdQuery,
} from '@legacy-sports/graphql';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Generic player detail interface used by the cross-platform component. */
export interface PlayerDetailData {
  id: number;
  name: string;
  position: string;
  team: string;
  battingAvg?: number;
  homeRuns?: number;
  rbi?: number;
  runs?: number;
  hits?: number;
  strikeouts?: number;
  walks?: number;
  obp?: number;
  slg?: number;
  era?: number;
  wins?: number;
  losses?: number;
  saves?: number;
}

export interface PlayerDetailProps {
  player?: PlayerDetailData;
  loading?: boolean;
  error?: string;
  onPlayerSelect?: (playerId: number) => void;
  initialName?: string;
}

// ---------------------------------------------------------------------------
// Stat row helper
// ---------------------------------------------------------------------------

function StatRow({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
}) {
  return (
    <XStack
      justifyContent="space-between"
      paddingVertical="$2"
      paddingHorizontal="$3"
      borderBottomWidth={1}
      borderBottomColor="$borderColor"
    >
      <Text fontSize="$3" color="$textMuted">
        {label}
      </Text>
      <Text
        fontSize="$3"
        fontWeight="700"
        color={accent ? '$color12' : '$color'}
      >
        {value}
      </Text>
    </XStack>
  );
}

// ---------------------------------------------------------------------------
// Section header helper
// ---------------------------------------------------------------------------

function SectionHeader({ title }: { title: string }) {
  return (
    <XStack
      paddingHorizontal="$3"
      paddingVertical="$2"
      backgroundColor="$backgroundFocus"
      borderBottomWidth={1}
      borderBottomColor="$borderColor"
    >
      <Text fontSize="$4" fontWeight="700" color="$color12">
        {title}
      </Text>
    </XStack>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

function PlayerDetail({
  player,
  loading,
  error,
  initialName,
}: PlayerDetailProps) {
  if (loading) {
    return (
      <YStack flex={1} backgroundColor="$background">
        {initialName ? (
          <YStack
            alignItems="center"
            paddingTop="$5"
            paddingBottom="$4"
            borderBottomWidth={1}
            borderBottomColor="$borderColor"
            gap="$1"
          >
            <Text fontSize="$8" fontWeight="bold" color="$color12">
              {initialName}
            </Text>
          </YStack>
        ) : null}
        <YStack
          flex={1}
          padding="$5"
          alignItems="center"
          justifyContent="center"
        >
          <Spinner size="large" color="$color10" />
          <Text
            color="$textMuted"
            fontSize="$4"
            marginTop="$3"
            textAlign="center"
          >
            Loading player details…
          </Text>
        </YStack>
      </YStack>
    );
  }

  if (error) {
    return (
      <YStack
        flex={1}
        backgroundColor="$background"
        padding="$5"
        alignItems="center"
        justifyContent="center"
      >
        <Text color="$red10" fontSize="$4" textAlign="center">
          Error: {error}
        </Text>
      </YStack>
    );
  }

  if (!player) {
    return (
      <YStack
        flex={1}
        backgroundColor="$background"
        padding="$5"
        alignItems="center"
        justifyContent="center"
      >
        <Text color="$red10" fontSize="$4" textAlign="center">
          Player not found
        </Text>
      </YStack>
    );
  }

  // Mirror the pitching-section guard below: with real API data a pure pitcher
  // has no career batting line, and an unconditional header would render an
  // empty "Batting Statistics" card (LS-8824).
  const hasBattingStats =
    player.battingAvg !== undefined ||
    player.homeRuns !== undefined ||
    player.rbi !== undefined ||
    player.runs !== undefined ||
    player.hits !== undefined ||
    player.obp !== undefined ||
    player.slg !== undefined;

  return (
    <ScrollView flex={1} backgroundColor="$background" padding="$4">
      {/* ── Player header ── */}
      <YStack
        alignItems="center"
        marginBottom="$5"
        paddingBottom="$4"
        borderBottomWidth={1}
        borderBottomColor="$borderColor"
        gap="$1"
      >
        <Text fontSize="$8" fontWeight="bold" color="$color12">
          {player.name}
        </Text>
        <XStack gap="$2" alignItems="center">
          <Text
            fontSize="$2"
            fontWeight="700"
            color="$color"
            backgroundColor="$backgroundFocus"
            paddingHorizontal="$2"
            paddingVertical="$1"
            borderRadius="$2"
          >
            {player.position}
          </Text>
          <Text fontSize="$4" color="$textMuted">
            {player.team}
          </Text>
        </XStack>
      </YStack>

      {/* ── Batting stats (shown only if relevant) ── */}
      {hasBattingStats && (
        <YStack
          borderRadius="$4"
          borderWidth={1}
          borderColor="$borderColor"
          overflow="hidden"
          marginBottom="$4"
        >
          <SectionHeader title="Batting Statistics" />

          {player.battingAvg !== undefined && (
            <StatRow
              label="Batting Average"
              value={player.battingAvg.toFixed(3)}
              accent
            />
          )}
          {player.homeRuns !== undefined && (
            <StatRow label="Home Runs" value={player.homeRuns} />
          )}
          {player.rbi !== undefined && (
            <StatRow label="RBIs" value={player.rbi} />
          )}
          {player.runs !== undefined && (
            <StatRow label="Runs" value={player.runs} />
          )}
          {player.hits !== undefined && (
            <StatRow label="Hits" value={player.hits} />
          )}
          {player.obp !== undefined && (
            <StatRow
              label="On-Base Percentage"
              value={player.obp.toFixed(3)}
              accent
            />
          )}
          {player.slg !== undefined && (
            <StatRow
              label="Slugging Percentage"
              value={player.slg.toFixed(3)}
              accent
            />
          )}
        </YStack>
      )}

      {/* ── Pitching stats (shown only if relevant) ── */}
      {(player.era !== undefined || player.wins !== undefined) && (
        <YStack
          borderRadius="$4"
          borderWidth={1}
          borderColor="$borderColor"
          overflow="hidden"
          marginBottom="$4"
        >
          <SectionHeader title="Pitching Statistics" />

          {player.era !== undefined && (
            <StatRow label="ERA" value={player.era.toFixed(2)} accent />
          )}
          {player.wins !== undefined && (
            <StatRow label="Wins" value={player.wins} />
          )}
          {player.losses !== undefined && (
            <StatRow label="Losses" value={player.losses} />
          )}
          {player.saves !== undefined && (
            <StatRow label="Saves" value={player.saves} />
          )}
        </YStack>
      )}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Convenience wrapper that takes only a player ID
// ---------------------------------------------------------------------------

export interface PlayerDetailByIdProps {
  playerId: number;
  initialName?: string;
}

/** Placeholder for a field the API has no value for. */
const UNKNOWN = '—';

/** Narrow `null` to `undefined` so PlayerDetail's `!== undefined` guards hold. */
function orUndefined<T>(value: T | null | undefined): T | undefined {
  return value ?? undefined;
}

/**
 * `CareerPitching.era` is a String in the schema, but PlayerDetailData.era is a
 * number that gets `.toFixed(2)` applied — parse defensively.
 */
function toNumber(value: string | null | undefined): number | undefined {
  if (value == null) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Most recent team across the player's batting and pitching season lines.
 * `Player` carries no historical team field, so this is the only team available
 * for players who are not on a current MLB roster.
 */
function latestTeam(
  seasons: ReadonlyArray<{
    season?: number | null;
    team?: string | null;
  }>,
): string | undefined {
  let latest: { season: number; team: string } | undefined;

  for (const entry of seasons) {
    const team = entry.team?.trim();
    if (entry.season == null || !team) continue;
    if (!latest || entry.season > latest.season) {
      latest = { season: entry.season, team };
    }
  }

  return latest?.team;
}

/**
 * Map the GraphQL payload onto the presentational shape. Returns `undefined`
 * only when the API genuinely has no player for the requested id — that is the
 * sole path to PlayerDetail's "Player not found" state.
 */
export function toPlayerDetailData(
  data: GetPlayerDetailByIdQuery | undefined,
): PlayerDetailData | undefined {
  const player = data?.player;
  if (!player || player.id == null) return undefined;

  const batting = player.careerBatting;
  const pitching = player.careerPitching;

  const name = [player.firstName, player.lastName]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(' ');

  return {
    id: player.id,
    name: name || UNKNOWN,
    position:
      batting?.primaryPosition ??
      pitching?.primaryPosition ??
      player.eligiblePositions?.[0] ??
      UNKNOWN,
    team:
      latestTeam([
        ...(data?.playerSeasonBatting ?? []),
        ...(data?.playerSeasonPitching ?? []),
      ]) ??
      player.mlbTeam ??
      UNKNOWN,
    battingAvg: orUndefined(batting?.battingAverage),
    homeRuns: orUndefined(batting?.homeRuns),
    rbi: orUndefined(batting?.rbi),
    runs: orUndefined(batting?.runs),
    hits: orUndefined(batting?.hits),
    obp: orUndefined(batting?.onBasePercentage),
    slg: orUndefined(batting?.sluggingPercentage),
    era: toNumber(pitching?.era),
    wins: orUndefined(pitching?.wins),
    losses: orUndefined(pitching?.losses),
    saves: orUndefined(pitching?.saves),
  };
}

function PlayerDetailById({ playerId, initialName }: PlayerDetailByIdProps) {
  // Ids that can never match a row (the route's own guard already rejects
  // non-numeric params) short-circuit to the not-found state without a request.
  const skip = !Number.isInteger(playerId) || playerId <= 0;

  const { data, loading, error } = useGetPlayerDetailByIdQuery({
    variables: { playerId },
    skip,
  });

  return (
    <PlayerDetail
      player={toPlayerDetailData(data)}
      loading={loading}
      error={error?.message}
      initialName={initialName}
    />
  );
}

export { PlayerDetail };
export { PlayerDetailById };
