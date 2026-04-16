import React, { useEffect, useState } from 'react';
import { H3, Separator, Spinner, Text, XStack, YStack } from 'tamagui';
import { GameCard } from './GameCard';
import { FONT_BODY, FONT_DISPLAY } from '../../constants/typography';
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

// ─── Date navigation ──────────────────────────────────────────────────────────

/** Shift an ISO date string by ±N calendar days. */
function offsetDate(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const ny = dt.getFullYear();
  const nm = String(dt.getMonth() + 1).padStart(2, '0');
  const nd = String(dt.getDate()).padStart(2, '0');
  return `${ny}-${nm}-${nd}`;
}

/**
 * DateNav — prev-day / date-input / next-day navigation control.
 *
 * - Arrow buttons are min 44×44px for WCAG touch-target compliance.
 * - Next-day button is disabled when the selected date is today.
 * - The date input carries an aria-label and is capped at today (max attribute).
 * - Uses native input[type=date] so the platform's accessible calendar widget
 *   is available to keyboard and screen-reader users.
 */
function DateNav({
  date,
  onChange,
}: {
  date: string;
  onChange: (d: string) => void;
}) {
  const today = todayISO();
  const isToday = date >= today;

  return (
    <XStack
      alignItems="center"
      gap="$2"
      role="group"
      aria-label="Scoreboard date navigation"
    >
      <button
        type="button"
        aria-label="Previous day"
        onClick={() => onChange(offsetDate(date, -1))}
        className="date-nav-btn"
      >
        ←
      </button>

      <input
        type="date"
        value={date}
        max={today}
        onChange={(e) => {
          const val = e.target.value;
          if (val) onChange(val <= today ? val : today);
        }}
        aria-label="Scoreboard date"
        data-testid="scoreboard-date-picker"
        className="scoreboard-date-input"
      />

      <button
        type="button"
        aria-label="Next day"
        disabled={isToday}
        onClick={() => !isToday && onChange(offsetDate(date, 1))}
        className="date-nav-btn"
      >
        →
      </button>
    </XStack>
  );
}

// ─── Section label ────────────────────────────────────────────────────────────

/**
 * SectionLabel — a rule + label divider between game groups.
 *
 * Live section uses heritage gold; others use muted gray.
 * Uses a hairline + text pattern (no border-left stripe).
 */
function SectionLabel({
  label,
  count,
  isLive = false,
}: {
  label: string;
  count: number;
  isLive?: boolean;
}) {
  return (
    <XStack alignItems="center" gap="$3" paddingTop="$2" paddingBottom="$1">
      <XStack alignItems="baseline" gap="$2" flexShrink={0}>
        <Text
          fontSize="$2"
          fontWeight="700"
          fontFamily={FONT_DISPLAY}
          letterSpacing={2}
          color={isLive ? '$brandGold' : '$gray9'}
          textTransform="uppercase"
        >
          {label}
        </Text>
        <Text
          fontSize="$1"
          color={isLive ? '$brandGold' : '$gray10'}
          fontFamily={FONT_BODY}
          opacity={0.7}
        >
          {count}
        </Text>
      </XStack>
      {/* Hairline rule — pulls to the right of the label */}
      <Separator
        flex={1}
        borderColor={isLive ? '$brandGold' : '$borderColor'}
        opacity={isLive ? 0.4 : 0.6}
      />
    </XStack>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

const LIVE_POLL_MS = 15_000;

/**
 * Scoreboard — displays all MLB games for a selected date.
 * Auto-polls every 15 seconds while any game is live.
 * Provider-agnostic: talks only to our GraphQL API (resolver implemented in LS-1865).
 *
 * Layout:
 *  - Centered column, maxWidth 900px
 *  - Games split into explicit Live / Upcoming / Final sections with labeled dividers
 *  - Live section uses heritage gold labels; others use muted treatment
 */
export function Scoreboard() {
  const [date, setDate] = useState(todayISO());

  const { data, loading, error, startPolling, stopPolling } =
    useGetScoreboardQuery({
      variables: { date },
      fetchPolicy: 'cache-and-network',
    });

  const games: ScoreboardGame[] = (data?.scoreboard?.games ??
    []) as ScoreboardGame[];
  const lastUpdated = data?.scoreboard?.lastUpdated;

  const isAnyGameLive = games.some((g) => g.status === 'Live');

  useEffect(() => {
    if (isAnyGameLive) {
      startPolling(LIVE_POLL_MS);
    } else {
      stopPolling();
    }
    return () => stopPolling();
  }, [isAnyGameLive, startPolling, stopPolling]);

  // Partition into sections — order: Live → Upcoming → Final
  const liveGames = games.filter((g) => g.status === 'Live');
  const upcomingGames = games.filter(
    (g) => g.status !== 'Live' && g.status !== 'Final',
  );
  const finalGames = games.filter((g) => g.status === 'Final');

  return (
    <YStack
      flex={1}
      padding="$4"
      maxWidth={900}
      width="100%"
      alignSelf="center"
    >
      {/* ── Page header block ─────────────────────────────────────────────── */}
      <YStack gap="$2" marginBottom="$5">
        <XStack
          justifyContent="space-between"
          alignItems="center"
          flexWrap="wrap"
          gap="$2"
        >
          <H3
            data-testid="scoreboard-heading"
            fontFamily={FONT_DISPLAY}
            letterSpacing={1}
          >
            MLB Scoreboard
          </H3>

          <DateNav date={date} onChange={setDate} />
        </XStack>

        {/* Date label + game count summary */}
        <XStack gap="$3" flexWrap="wrap" alignItems="center">
          <Text color="$gray11" fontFamily={FONT_BODY}>
            {formatDisplayDate(date)}
          </Text>
          {liveGames.length > 0 && (
            <Text
              color="$green10"
              fontWeight="700"
              fontFamily={FONT_DISPLAY}
              letterSpacing={0.5}
            >
              {liveGames.length} Live
            </Text>
          )}
          {finalGames.length > 0 && (
            <Text color="$gray10" fontFamily={FONT_DISPLAY} letterSpacing={0.5}>
              {finalGames.length} Final
            </Text>
          )}
          {upcomingGames.length > 0 && (
            <Text color="$blue10" fontFamily={FONT_DISPLAY} letterSpacing={0.5}>
              {upcomingGames.length} Upcoming
            </Text>
          )}
        </XStack>

        {(lastUpdated || isAnyGameLive) && (
          <Text
            fontSize="$2"
            color="$gray9"
            fontFamily={FONT_BODY}
            data-testid="scoreboard-last-updated"
          >
            {[
              lastUpdated
                ? `Updated ${new Date(lastUpdated).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
                : null,
              isAnyGameLive ? 'Auto-refreshing every 15s' : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        )}
      </YStack>

      {/* ── Loading state ─────────────────────────────────────────────────── */}
      {loading && !data && (
        <YStack
          flex={1}
          alignItems="center"
          justifyContent="center"
          padding="$8"
        >
          <Spinner size="large" color="$blue10" />
          <Text color="$gray10" marginTop="$3" fontFamily={FONT_BODY}>
            Loading scoreboard...
          </Text>
        </YStack>
      )}

      {/* ── Error state ───────────────────────────────────────────────────── */}
      {error && (
        <YStack
          padding="$4"
          borderRadius="$4"
          backgroundColor="$red3"
          borderWidth={1}
          borderColor="$red8"
          role="alert"
          data-testid="scoreboard-error"
        >
          <Text color="$red11" fontWeight="600" fontFamily={FONT_DISPLAY}>
            Error loading scoreboard
          </Text>
          <Text
            color="$red10"
            fontSize="$3"
            marginTop="$1"
            fontFamily={FONT_BODY}
          >
            Unable to load games. Please try refreshing the page.
          </Text>
        </YStack>
      )}

      {/* ── No data state ─────────────────────────────────────────────────── */}
      {!loading && !error && data && data.scoreboard === null && (
        <YStack
          flex={1}
          alignItems="center"
          justifyContent="center"
          padding="$8"
          data-testid="scoreboard-unavailable"
        >
          <Text color="$gray10" fontSize="$5" fontFamily={FONT_BODY}>
            Scoreboard data is not yet available
          </Text>
        </YStack>
      )}

      {/* ── Empty state ───────────────────────────────────────────────────── */}
      {!loading && !error && data?.scoreboard != null && games.length === 0 && (
        <YStack
          flex={1}
          alignItems="center"
          justifyContent="center"
          padding="$8"
          data-testid="scoreboard-empty"
        >
          <Text color="$gray10" fontSize="$5" fontFamily={FONT_BODY}>
            No games scheduled for {formatDisplayDate(date)}
          </Text>
        </YStack>
      )}

      {/* ── Game sections ─────────────────────────────────────────────────── */}
      {games.length > 0 && (
        <YStack gap="$5">
          {/* Live section — heritage gold label */}
          {liveGames.length > 0 && (
            <YStack gap="$3">
              <SectionLabel label="Live Now" count={liveGames.length} isLive />
              {liveGames.map((game) => (
                <GameCard key={game.gamePk} game={game} />
              ))}
            </YStack>
          )}

          {/* Upcoming section */}
          {upcomingGames.length > 0 && (
            <YStack gap="$3">
              <SectionLabel label="Upcoming" count={upcomingGames.length} />
              {upcomingGames.map((game) => (
                <GameCard key={game.gamePk} game={game} />
              ))}
            </YStack>
          )}

          {/* Final section */}
          {finalGames.length > 0 && (
            <YStack gap="$3">
              <SectionLabel label="Final" count={finalGames.length} />
              {finalGames.map((game) => (
                <GameCard key={game.gamePk} game={game} />
              ))}
            </YStack>
          )}
        </YStack>
      )}
    </YStack>
  );
}
