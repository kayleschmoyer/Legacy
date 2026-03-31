import React, { useEffect, useState } from 'react';
import { H3, Spinner, Text, XStack, YStack } from 'tamagui';
import { Input } from 'tamagui';
import { GameCard } from './GameCard';
import { useGetScoreboardQuery } from '../../api/db/graphql.generated';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ScoreboardTeam {
  teamName: string;
  abbreviation: string;
  runs: number;
  hits: number;
  errors: number;
  linescoreInnings?: number[] | null;
}

export interface ScoreboardGame {
  gamePk: number;
  status: string;
  startTime?: string | null;
  inning?: number | null;
  inningHalf?: string | null;
  outs?: number | null;
  homeTeam: ScoreboardTeam;
  awayTeam: ScoreboardTeam;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function todayISO(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDisplayDate(iso: string): string {
  try {
    const [year, month, day] = iso.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

const LIVE_POLL_MS = 15_000;

/**
 * Scoreboard — displays all MLB games for a selected date.
 * Auto-polls every 15 seconds while any game is live.
 * Provider-agnostic: talks only to our GraphQL API (resolver implemented in LS-1865).
 */
export function Scoreboard() {
  const [date, setDate] = useState(todayISO());

  const { data, loading, error, startPolling, stopPolling } =
    useGetScoreboardQuery({
      variables: { date },
      fetchPolicy: 'cache-and-network',
    });

  // games array items match ScoreboardGame after codegen tightened nullability on
  // gamePk, status, homeTeam, awayTeam and their required primitives.
  const games: ScoreboardGame[] = (data?.scoreboard?.games ??
    []) as ScoreboardGame[];
  const lastUpdated = data?.scoreboard?.lastUpdated;

  const isAnyGameLive = games.some((g) => g.status === 'Live');

  // Start/stop polling based on whether any game is currently live.
  // Depends on the stable boolean `isAnyGameLive` rather than the games array
  // reference so that re-renders don't trigger repeated startPolling() calls.
  useEffect(() => {
    if (isAnyGameLive) {
      startPolling(LIVE_POLL_MS);
    } else {
      stopPolling();
    }
    return () => stopPolling();
  }, [isAnyGameLive, startPolling, stopPolling]);

  const liveCount = games.filter(
    (g: ScoreboardGame) => g.status === 'Live',
  ).length;
  const finalCount = games.filter(
    (g: ScoreboardGame) => g.status === 'Final',
  ).length;
  const upcomingCount = games.filter(
    (g: ScoreboardGame) => g.status !== 'Live' && g.status !== 'Final',
  ).length;

  return (
    <YStack
      flex={1}
      padding="$4"
      gap="$4"
      maxWidth={900}
      alignSelf="center"
      width="100%"
    >
      {/* Header */}
      <XStack
        justifyContent="space-between"
        alignItems="center"
        flexWrap="wrap"
        gap="$2"
      >
        <H3 data-testid="scoreboard-heading">MLB Scoreboard</H3>

        {/* Date picker */}
        <Input
          type="date"
          value={date}
          onChangeText={setDate}
          size="$3"
          width={160}
          data-testid="scoreboard-date-picker"
        />
      </XStack>

      {/* Date label + summary */}
      <XStack gap="$3" flexWrap="wrap" alignItems="center">
        <Text color="$gray11">{formatDisplayDate(date)}</Text>
        {liveCount > 0 && (
          <Text color="$green10" fontWeight="600">
            {liveCount} Live
          </Text>
        )}
        {finalCount > 0 && <Text color="$gray10">{finalCount} Final</Text>}
        {upcomingCount > 0 && (
          <Text color="$blue10">{upcomingCount} Upcoming</Text>
        )}
        {liveCount > 0 && (
          <Text fontSize="$2" color="$gray9">
            Auto-refreshing every 15s
          </Text>
        )}
      </XStack>

      {lastUpdated && (
        <Text
          fontSize="$2"
          color="$gray9"
          data-testid="scoreboard-last-updated"
        >
          Updated {new Date(lastUpdated).toLocaleTimeString()}
        </Text>
      )}

      {/* States */}
      {loading && !data && (
        <YStack
          flex={1}
          alignItems="center"
          justifyContent="center"
          padding="$8"
        >
          <Spinner size="large" color="$blue10" />
          <Text color="$gray10" marginTop="$3">
            Loading scoreboard...
          </Text>
        </YStack>
      )}

      {error && (
        <YStack
          padding="$4"
          borderRadius="$4"
          backgroundColor="$red3"
          borderWidth={1}
          borderColor="$red8"
          data-testid="scoreboard-error"
        >
          <Text color="$red11" fontWeight="600">
            Error loading scoreboard
          </Text>
          <Text color="$red10" fontSize="$3" marginTop="$1">
            {error.message}
          </Text>
        </YStack>
      )}

      {!loading && !error && data && data.scoreboard === null && (
        <YStack
          flex={1}
          alignItems="center"
          justifyContent="center"
          padding="$8"
          data-testid="scoreboard-unavailable"
        >
          <Text color="$gray10" fontSize="$5">
            Scoreboard data is not yet available
          </Text>
        </YStack>
      )}

      {!loading && !error && data?.scoreboard != null && games.length === 0 && (
        <YStack
          flex={1}
          alignItems="center"
          justifyContent="center"
          padding="$8"
          data-testid="scoreboard-empty"
        >
          <Text color="$gray10" fontSize="$5">
            No games scheduled for {formatDisplayDate(date)}
          </Text>
        </YStack>
      )}

      {/* Game cards — live first, then upcoming, then final */}
      {games.length > 0 && (
        <YStack gap="$3">
          {[...games]
            .sort((a: ScoreboardGame, b: ScoreboardGame) => {
              const order: Record<string, number> = { Live: 0, Final: 2 };
              const aOrder = order[a.status] ?? 1;
              const bOrder = order[b.status] ?? 1;
              return aOrder - bOrder;
            })
            .map((game) => (
              <GameCard key={game.gamePk} game={game} />
            ))}
        </YStack>
      )}
    </YStack>
  );
}
