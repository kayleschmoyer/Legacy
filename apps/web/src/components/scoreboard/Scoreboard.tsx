/**
 * Scoreboard — full-page MLB scoreboard for the `/scoreboard` route.
 *
 * Page layout:
 *  - Marquee header (eyebrow + title + formatted date) with date-nav pill
 *  - Counter row (live / upcoming / final) using semantic colours
 *  - Last-updated row with a pulsing refresh indicator while live
 *  - Sectioned game grid (Live → Upcoming → Final), each section headed by
 *    a labelled rule with a lamp marker
 *
 * Live games trigger a 15-second auto-poll on the underlying GraphQL query.
 *
 * Game-card visuals, linescore, and outs pips are imported from
 * `@legacy-sports/shared-components` so the same building blocks can be
 * reused on mobile in a follow-up.
 */
import React, { useEffect, useState } from 'react';
import { Card, H1, Text, XStack, YStack } from 'tamagui';
import {
  GameCard,
  LiveLamp,
  type ScoreboardGame,
} from '@legacy-sports/shared-components';
import { SportFilter, type SportKey } from './SportFilter';
import { useGetScoreboardQuery } from '../../api/db/graphql.generated';
import { FONT_BODY, FONT_DISPLAY } from '../../constants/typography';

const LIVE_POLL_MS = 15_000;

// ─── Date helpers ───────────────────────────────────────────────────────────

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function offsetDate(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function formatDisplayDate(iso: string): string {
  try {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function formatLastUpdated(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return null;
  }
}

// ─── DateNav (web-only date picker) ─────────────────────────────────────────

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
      backgroundColor="$surfacePanel"
      borderColor="$borderColor"
      borderWidth={1}
      borderRadius="$10"
      padding="$1.5"
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

// ─── Counter row pieces ────────────────────────────────────────────────────

function Counter({
  count,
  label,
  color,
  pulseLamp = false,
}: {
  count: number;
  label: string;
  color: string;
  pulseLamp?: boolean;
}) {
  return (
    <XStack alignItems="center" gap="$2">
      {pulseLamp && <LiveLamp pulse glow color={color} />}
      <Text
        fontSize={22}
        fontWeight="800"
        color={color}
        fontFamily={FONT_DISPLAY}
      >
        {count}
      </Text>
      <Text
        fontSize={11}
        fontWeight="700"
        letterSpacing={1.4}
        textTransform="uppercase"
        color={color}
        fontFamily={FONT_DISPLAY}
      >
        {label}
      </Text>
    </XStack>
  );
}

function CounterDot() {
  return (
    <Text fontSize={14} color="$color9" selectable={false}>
      ·
    </Text>
  );
}

// ─── Section header (lamp + label + count + hairline rule) ──────────────────

function SectionHead({
  label,
  count,
  kind,
}: {
  label: string;
  count: number;
  kind: 'live' | 'upcoming' | 'final' | 'postponed';
}) {
  const lampColor =
    kind === 'live'
      ? '$green11'
      : kind === 'upcoming'
        ? '$brandNavyLight'
        : '$color9';

  return (
    <XStack alignItems="center" gap="$3" paddingBottom="$2">
      <XStack alignItems="center" gap="$2" flexShrink={0}>
        <LiveLamp
          color={lampColor}
          pulse={kind === 'live'}
          glow={kind === 'live'}
        />
        <Text
          fontSize={14}
          fontWeight="800"
          letterSpacing={2}
          textTransform="uppercase"
          color="$color12"
          fontFamily={FONT_DISPLAY}
        >
          {label}
        </Text>
        <Text
          fontSize={12}
          fontWeight="700"
          color="$color9"
          fontFamily={FONT_DISPLAY}
        >
          ({count})
        </Text>
      </XStack>
      <YStack flex={1} height={1} backgroundColor="$borderColor" />
    </XStack>
  );
}

// ─── Skeleton card (loading) ────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <Card
      bordered
      backgroundColor="$surfaceCard"
      padding="$4"
      gap="$3"
      borderColor="$borderColor"
    >
      <XStack justifyContent="space-between">
        <SkeletonBar fixedWidth={80} />
        <SkeletonBar fixedWidth={60} />
      </XStack>
      {[0, 1].map((i) => (
        <XStack key={i} alignItems="center" gap="$3">
          <YStack
            width={38}
            height={38}
            borderRadius={19}
            backgroundColor="$color3"
          />
          {/* Fluid lines: use flex weights to approximate the mockup's 50% / 70%
              widths without needing percent-string casts on the typed Tamagui
              width prop. The empty trailing YStack consumes the remainder. */}
          <YStack flex={1} gap="$1.5">
            <XStack alignItems="center">
              <YStack
                flex={5}
                height={12}
                backgroundColor="$color3"
                borderRadius="$2"
              />
              <YStack flex={5} />
            </XStack>
            <XStack alignItems="center">
              <YStack
                flex={7}
                height={10}
                backgroundColor="$color3"
                borderRadius="$2"
              />
              <YStack flex={3} />
            </XStack>
          </YStack>
          <YStack
            width={44}
            height={32}
            backgroundColor="$color3"
            borderRadius="$2"
          />
        </XStack>
      ))}
    </Card>
  );
}

function SkeletonBar({
  fixedWidth,
  height = 12,
}: {
  fixedWidth: number;
  height?: number;
}) {
  return (
    <YStack
      width={fixedWidth}
      height={height}
      backgroundColor="$color3"
      borderRadius="$2"
    />
  );
}

// ─── Game bucketing ────────────────────────────────────────────────────────

/**
 * Bucket scoreboard games by status. Postponed games are split out so they
 * never appear under "Upcoming" — they will not be played that day.
 */
export function partitionScoreboardGames(games: ScoreboardGame[]): {
  liveGames: ScoreboardGame[];
  upcomingGames: ScoreboardGame[];
  finalGames: ScoreboardGame[];
  postponedGames: ScoreboardGame[];
} {
  const liveGames: ScoreboardGame[] = [];
  const upcomingGames: ScoreboardGame[] = [];
  const finalGames: ScoreboardGame[] = [];
  const postponedGames: ScoreboardGame[] = [];
  for (const game of games) {
    switch (game.status) {
      case 'Live':
        liveGames.push(game);
        break;
      case 'Final':
        finalGames.push(game);
        break;
      case 'Postponed':
        postponedGames.push(game);
        break;
      default:
        upcomingGames.push(game);
    }
  }
  return { liveGames, upcomingGames, finalGames, postponedGames };
}

// ─── Main component ────────────────────────────────────────────────────────

export function Scoreboard() {
  const [date, setDate] = useState(todayISO());
  const [sport, setSport] = useState<SportKey>('all');

  const { data, loading, error, startPolling, stopPolling } =
    useGetScoreboardQuery({
      variables: { date },
      fetchPolicy: 'cache-and-network',
      // Skip the network round-trip while NFL is selected — there is no NFL
      // backend yet, and reusing MLB data under an "NFL" label would be
      // misleading.
      skip: sport === 'nfl',
    });

  // The generated `GetScoreboardQuery` shape is structurally compatible with
  // the shared `ScoreboardGame` type — both mirror the same GraphQL fields,
  // so a direct assignment works without a runtime mapping step.
  const games: ScoreboardGame[] = data?.scoreboard?.games ?? [];
  const lastUpdated = data?.scoreboard?.lastUpdated;

  const { liveGames, upcomingGames, finalGames, postponedGames } =
    partitionScoreboardGames(games);
  const isAnyGameLive = liveGames.length > 0;
  // Also poll while upcoming games exist for today — games can transition
  // from Upcoming → Live without triggering a re-fetch otherwise.
  const shouldPoll =
    isAnyGameLive || (upcomingGames.length > 0 && date === todayISO());

  useEffect(() => {
    if (shouldPoll) startPolling(LIVE_POLL_MS);
    else stopPolling();
    return () => stopPolling();
  }, [shouldPoll, startPolling, stopPolling]);

  return (
    <YStack
      flex={1}
      paddingHorizontal="$5"
      paddingTop="$5"
      paddingBottom="$8"
      maxWidth={1280}
      width="100%"
      alignSelf="center"
    >
      <Header
        date={date}
        onDateChange={setDate}
        sport={sport}
        onSportChange={setSport}
        liveCount={liveGames.length}
        upcomingCount={upcomingGames.length}
        finalCount={finalGames.length}
        lastUpdated={lastUpdated}
        isAnyGameLive={isAnyGameLive}
      />

      {sport === 'nfl' ? (
        <NflComingSoonView />
      ) : (
        <>
          {loading && !data && <LoadingState />}

          {error && <ErrorView />}

          {!loading && !error && data && data.scoreboard === null && (
            <NoDataView />
          )}

          {!loading &&
            !error &&
            data?.scoreboard != null &&
            games.length === 0 && <EmptyView date={date} />}

          {games.length > 0 && (
            <YStack gap="$6" marginTop="$5">
              {liveGames.length > 0 && (
                <SectionGrid kind="live" label="Live Now" games={liveGames} />
              )}
              {upcomingGames.length > 0 && (
                <SectionGrid
                  kind="upcoming"
                  label="Upcoming"
                  games={upcomingGames}
                />
              )}
              {finalGames.length > 0 && (
                <SectionGrid kind="final" label="Final" games={finalGames} />
              )}
              {postponedGames.length > 0 && (
                <SectionGrid
                  kind="postponed"
                  label="Postponed"
                  games={postponedGames}
                />
              )}
            </YStack>
          )}
        </>
      )}
    </YStack>
  );
}

// ─── Header block ──────────────────────────────────────────────────────────

function Header({
  date,
  onDateChange,
  sport,
  onSportChange,
  liveCount,
  upcomingCount,
  finalCount,
  lastUpdated,
  isAnyGameLive,
}: {
  date: string;
  onDateChange: (d: string) => void;
  sport: SportKey;
  onSportChange: (s: SportKey) => void;
  liveCount: number;
  upcomingCount: number;
  finalCount: number;
  lastUpdated: string | null | undefined;
  isAnyGameLive: boolean;
}) {
  const counters: React.ReactNode[] = [];
  if (liveCount > 0)
    counters.push(
      <Counter
        key="live"
        count={liveCount}
        label="Live"
        color="$green11"
        pulseLamp
      />,
    );
  if (upcomingCount > 0) {
    if (counters.length > 0) counters.push(<CounterDot key="d1" />);
    counters.push(
      <Counter
        key="upcoming"
        count={upcomingCount}
        label="Upcoming"
        color="$brandNavyLight"
      />,
    );
  }
  if (finalCount > 0) {
    if (counters.length > 0) counters.push(<CounterDot key="d2" />);
    counters.push(
      <Counter key="final" count={finalCount} label="Final" color="$color11" />,
    );
  }

  const lastUpdatedText = formatLastUpdated(lastUpdated);

  return (
    <YStack gap="$3" marginBottom="$3">
      <XStack
        justifyContent="space-between"
        alignItems="flex-end"
        flexWrap="wrap"
        gap="$4"
        paddingBottom="$3"
        borderBottomWidth={1}
        borderBottomColor="$borderColor"
      >
        <YStack gap="$1">
          <XStack alignItems="center" gap="$2">
            <LiveLamp color="$brandGold" size={4} />
            <Text
              fontSize={11}
              fontWeight="700"
              letterSpacing={2.5}
              textTransform="uppercase"
              color="$brandGoldLight"
              fontFamily={FONT_DISPLAY}
            >
              {date === todayISO() ? 'Today · ' : ''}Major League Baseball
            </Text>
          </XStack>
          <H1
            data-testid="scoreboard-heading"
            fontFamily={FONT_DISPLAY}
            fontWeight="800"
            letterSpacing={-1}
            color="$color12"
            // Tamagui's $size tokens map to the heading scale; use a fluid override.
            $gtSm={{ fontSize: 64, lineHeight: 60 }}
            fontSize={40}
            lineHeight={40}
          >
            {sport === 'nfl' ? 'NFL Scoreboard' : 'MLB Scoreboard'}
          </H1>
          <Text
            fontStyle="italic"
            fontSize={16}
            color="$color9"
            fontFamily={FONT_BODY}
          >
            {formatDisplayDate(date)}
          </Text>
        </YStack>

        <YStack alignItems="flex-end" gap="$2">
          <SportFilter value={sport} onChange={onSportChange} />
          <DateNav date={date} onChange={onDateChange} />
        </YStack>
      </XStack>

      {counters.length > 0 && (
        <XStack alignItems="center" gap="$3" flexWrap="wrap">
          {counters}
        </XStack>
      )}

      {(lastUpdatedText || isAnyGameLive) && (
        <XStack
          alignItems="center"
          gap="$3"
          flexWrap="wrap"
          data-testid="scoreboard-last-updated"
        >
          {lastUpdatedText && (
            <Text fontSize={13} color="$color9" fontFamily={FONT_BODY}>
              Updated{' '}
              <Text fontSize={13} color="$color11" fontFamily="$mono">
                {lastUpdatedText}
              </Text>
            </Text>
          )}
          {isAnyGameLive && (
            <XStack alignItems="center" gap="$2">
              <LiveLamp size={6} pulse color="$green11" />
              <Text
                fontSize={11}
                fontWeight="700"
                letterSpacing={1.4}
                textTransform="uppercase"
                color="$green11"
                fontFamily={FONT_DISPLAY}
              >
                Auto-refreshing every 15s
              </Text>
            </XStack>
          )}
        </XStack>
      )}
    </YStack>
  );
}

// ─── Section grid ──────────────────────────────────────────────────────────

function SectionGrid({
  kind,
  label,
  games,
}: {
  kind: 'live' | 'upcoming' | 'final' | 'postponed';
  label: string;
  games: ScoreboardGame[];
}) {
  return (
    <YStack gap="$3">
      <SectionHead kind={kind} label={label} count={games.length} />
      <XStack
        flexWrap="wrap"
        gap="$3"
        // Tamagui XStack with flexWrap; each card sets its own min/max width.
      >
        {games.map((g) => (
          <YStack
            key={g.gamePk}
            // Match the mockup grid: ~360px min, fills available space.
            flexBasis={340}
            flexGrow={1}
            minWidth={300}
            maxWidth={520}
          >
            <GameCard game={g} />
          </YStack>
        ))}
      </XStack>
    </YStack>
  );
}

// ─── Loading / error / empty / no-data states ──────────────────────────────

function LoadingState() {
  return (
    <YStack gap="$5" marginTop="$5">
      {(['Live Now', 'Upcoming'] as const).map((label) => (
        <YStack key={label} gap="$3">
          <XStack alignItems="center" gap="$3" paddingBottom="$2">
            <YStack
              width={120}
              height={14}
              backgroundColor="$color3"
              borderRadius="$2"
            />
            <YStack flex={1} height={1} backgroundColor="$borderColor" />
          </XStack>
          <XStack flexWrap="wrap" gap="$3">
            {[0, 1, 2].map((i) => (
              <YStack
                key={i}
                flexBasis={340}
                flexGrow={1}
                minWidth={300}
                maxWidth={520}
              >
                <SkeletonCard />
              </YStack>
            ))}
          </XStack>
        </YStack>
      ))}
    </YStack>
  );
}

function ErrorView() {
  return (
    <Card
      bordered
      backgroundColor="$surfaceCard"
      borderColor="$red8"
      padding="$5"
      marginTop="$4"
      role="alert"
      data-testid="scoreboard-error"
    >
      <XStack gap="$4" alignItems="flex-start">
        <YStack
          width={48}
          height={48}
          borderRadius={24}
          backgroundColor="$red3"
          borderWidth={1}
          borderColor="$red8"
          alignItems="center"
          justifyContent="center"
          flexShrink={0}
        >
          <Text fontSize={22} color="$red10" aria-hidden>
            !
          </Text>
        </YStack>
        <YStack flex={1} gap="$2">
          <Text
            fontSize={22}
            fontWeight="800"
            color="$color12"
            fontFamily={FONT_DISPLAY}
          >
            Unable to load the scoreboard
          </Text>
          <Text fontSize={15} color="$color11" fontFamily={FONT_BODY}>
            We can’t reach the live data feed right now. Your connection may be
            offline, or the upstream service is having a moment. Try refreshing
            the page in a few seconds.
          </Text>
        </YStack>
      </XStack>
    </Card>
  );
}

function EmptyView({ date }: { date: string }) {
  return (
    <Card
      bordered
      backgroundColor="$surfaceCard"
      borderColor="$borderColor"
      padding="$8"
      marginTop="$5"
      data-testid="scoreboard-empty"
    >
      <YStack alignItems="center" gap="$3">
        <Text
          fontSize={28}
          fontWeight="800"
          color="$color12"
          fontFamily={FONT_DISPLAY}
        >
          No games scheduled
        </Text>
        <Text
          fontSize={16}
          color="$color11"
          fontFamily={FONT_BODY}
          textAlign="center"
          maxWidth={520}
        >
          The league is dark on {formatDisplayDate(date)}. Try yesterday’s
          finals or jump ahead to tomorrow’s slate.
        </Text>
      </YStack>
    </Card>
  );
}

function NflComingSoonView() {
  return (
    <Card
      bordered
      backgroundColor="$surfaceCard"
      borderColor="$borderColor"
      padding="$8"
      marginTop="$5"
      data-testid="scoreboard-nfl-coming-soon"
    >
      <YStack alignItems="center" gap="$3">
        <Text
          fontSize={11}
          fontWeight="700"
          letterSpacing={2.5}
          textTransform="uppercase"
          color="$brandGoldLight"
          fontFamily={FONT_DISPLAY}
        >
          National Football League
        </Text>
        <Text
          fontSize={28}
          fontWeight="800"
          color="$color12"
          fontFamily={FONT_DISPLAY}
          textAlign="center"
        >
          NFL scoreboard coming soon
        </Text>
        <Text
          fontSize={16}
          color="$color11"
          fontFamily={FONT_BODY}
          textAlign="center"
          maxWidth={520}
        >
          Live football scores and linescores will land here once the NFL feed
          is wired up. In the meantime, switch back to MLB for live baseball.
        </Text>
      </YStack>
    </Card>
  );
}

function NoDataView() {
  return (
    <Card
      bordered
      backgroundColor="$surfaceCard"
      borderColor="$borderColor"
      padding="$8"
      marginTop="$5"
      data-testid="scoreboard-unavailable"
    >
      <YStack alignItems="center" gap="$3">
        <Text
          fontSize={28}
          fontWeight="800"
          color="$color12"
          fontFamily={FONT_DISPLAY}
        >
          Scoreboard isn’t available yet
        </Text>
        <Text
          fontSize={16}
          color="$color11"
          fontFamily={FONT_BODY}
          textAlign="center"
          maxWidth={520}
        >
          Today’s schedule hasn’t been published. Check back closer to first
          pitch.
        </Text>
      </YStack>
    </Card>
  );
}
