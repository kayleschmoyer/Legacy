/**
 * ScoreboardContainer — cross-platform, presentational full-page scoreboard
 * (LS-7803, web-canonical principle LS-7790).
 *
 * Layout:
 *  - Marquee header (eyebrow + title + formatted date) with the sport filter
 *    and an injected, platform-specific date-navigation control
 *  - Counter row (live / upcoming / final) using semantic colours
 *  - Last-updated row with a pulsing refresh indicator while live
 *  - Sectioned game grid (Live → Upcoming → Final → Postponed), each section
 *    headed by a labelled rule with a lamp marker
 *
 * The container is pure presentation + viewport-responsive layout: data,
 * polling, and the date picker are injected so each app supplies its own query
 * layer. Game-card visuals, linescore, and outs pips come from the shared
 * scoreboard primitives so web and native render identical building blocks.
 */
import React from 'react';
import { Card, H1, Text, XStack, YStack } from 'tamagui';
import { formatDisplayDate, formatLastUpdated, todayISO } from './dateUtils';
import { partitionScoreboardGames } from './partition';
import { SportFilter, type SportKey } from './SportFilter';
import { GameCard } from '../../components/scoreboard/GameCard';
import { LiveLamp } from '../../components/scoreboard/LiveLamp';
import type { ScoreboardGame } from '../../components/scoreboard/types';
import { FONT_BODY, FONT_DISPLAY, FONT_MONO } from '../../utils/typography';

export interface ScoreboardContainerProps {
  /** Currently selected slate date as a local `YYYY-MM-DD` string. */
  date: string;
  /** Currently selected sport filter. */
  sport: SportKey;
  onSportChange: (next: SportKey) => void;
  /** Games for the selected date (already fetched by the host app). */
  games: ScoreboardGame[];
  /** ISO timestamp of the last successful upstream refresh. */
  lastUpdated?: string | null;
  /** Show the loading skeletons (typically `loading && !data`). */
  loading?: boolean;
  /** Show the full-page error card (query errored with no cached data). */
  hasError?: boolean;
  /**
   * The error was the API rejecting the date itself (`BAD_USER_INPUT`), so the
   * error card says the date is invalid instead of blaming the connection
   * (LS-10649).
   */
  isInvalidDate?: boolean;
  /** Show the "not available yet" card (query resolved but `scoreboard` was null). */
  isUnavailable?: boolean;
  /**
   * Platform-specific date navigation control (web: date input + arrows;
   * native: a tappable picker + arrows). Rendered in the header beneath the
   * sport filter.
   */
  dateNav: React.ReactNode;
  /** Sports the filter should render as not-yet-selectable. */
  disabledSports?: SportKey[];
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
      <XStack flexWrap="wrap" gap="$3">
        {games.map((g) => (
          <YStack
            key={g.gamePk}
            // Match the mockup grid: ~340px basis, fills available space.
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

function ErrorView({ isInvalidDate }: { isInvalidDate: boolean }) {
  return (
    <Card
      bordered
      backgroundColor="$surfaceCard"
      borderColor="$red8"
      padding="$5"
      marginTop="$4"
      role="alert"
      testID="scoreboard-error"
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
            {isInvalidDate
              ? 'That date isn’t valid'
              : 'Unable to load the scoreboard'}
          </Text>
          <Text fontSize={15} color="$color11" fontFamily={FONT_BODY}>
            {isInvalidDate
              ? 'Pick a different date to see its games.'
              : 'We can’t reach the live data feed right now. Your connection may be offline, or the upstream service is having a moment. Try refreshing the page in a few seconds.'}
          </Text>
        </YStack>
      </XStack>
    </Card>
  );
}

/**
 * Empty-state body copy keyed to whether the date is past, today, or upcoming
 * (LS-10456) — a future date with no games usually means the schedule isn't
 * out yet, not that the league is dark.
 */
function emptyStateCopy(date: string): string {
  const display = formatDisplayDate(date);
  const today = todayISO();
  if (date > today) {
    return `Nothing is on the schedule for ${display} yet. Schedules can still change — check back closer to the date or browse another day.`;
  }
  if (date < today) {
    return `The league was dark on ${display}. Try the previous day’s finals or jump ahead to the next slate.`;
  }
  return `The league is dark on ${display}. Try yesterday’s finals or jump ahead to tomorrow’s slate.`;
}

function EmptyView({ date }: { date: string }) {
  return (
    <Card
      bordered
      backgroundColor="$surfaceCard"
      borderColor="$borderColor"
      padding="$8"
      marginTop="$5"
      testID="scoreboard-empty"
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
          {emptyStateCopy(date)}
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
      testID="scoreboard-nfl-coming-soon"
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

function NoDataView({ date }: { date: string }) {
  return (
    <Card
      bordered
      backgroundColor="$surfaceCard"
      borderColor="$borderColor"
      padding="$8"
      marginTop="$5"
      testID="scoreboard-unavailable"
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
          {date > todayISO()
            ? `The schedule for ${formatDisplayDate(date)} hasn’t been published yet. Check back closer to the date.`
            : 'Today’s schedule hasn’t been published. Check back closer to first pitch.'}
        </Text>
      </YStack>
    </Card>
  );
}

// ─── Header block ──────────────────────────────────────────────────────────

function Header({
  date,
  sport,
  onSportChange,
  disabledSports,
  liveCount,
  upcomingCount,
  finalCount,
  lastUpdated,
  isAnyGameLive,
  dateNav,
}: {
  date: string;
  sport: SportKey;
  onSportChange: (s: SportKey) => void;
  disabledSports?: SportKey[];
  liveCount: number;
  upcomingCount: number;
  finalCount: number;
  lastUpdated: string | null | undefined;
  isAnyGameLive: boolean;
  dateNav: React.ReactNode;
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
  const isToday = date === todayISO();

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
              data-testid="scoreboard-eyebrow"
            >
              {isToday ? 'Today · ' : ''}
              {sport === 'nfl'
                ? 'National Football League'
                : 'Major League Baseball'}
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
          <SportFilter
            value={sport}
            onChange={onSportChange}
            disabledSports={disabledSports}
          />
          {dateNav}
        </YStack>
      </XStack>

      {counters.length > 0 && (
        <XStack
          alignItems="center"
          gap="$3"
          flexWrap="wrap"
          data-testid="scoreboard-counters"
        >
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
              <Text fontSize={13} color="$color11" fontFamily={FONT_MONO}>
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

// ─── Container ─────────────────────────────────────────────────────────────

export function ScoreboardContainer({
  date,
  sport,
  onSportChange,
  games,
  lastUpdated,
  loading = false,
  hasError = false,
  isInvalidDate = false,
  isUnavailable = false,
  dateNav,
  disabledSports,
}: ScoreboardContainerProps) {
  const { liveGames, upcomingGames, finalGames, postponedGames } =
    partitionScoreboardGames(games);
  const isAnyGameLive = liveGames.length > 0;
  // There is no NFL feed yet, so any games/lastUpdated the host still holds
  // (e.g. Apollo keeps the last MLB result while the query is skipped) belong
  // to another sport — never summarise them under the NFL heading (LS-10729).
  const isNfl = sport === 'nfl';

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
        sport={sport}
        onSportChange={onSportChange}
        disabledSports={disabledSports}
        liveCount={isNfl ? 0 : liveGames.length}
        upcomingCount={isNfl ? 0 : upcomingGames.length}
        finalCount={isNfl ? 0 : finalGames.length}
        lastUpdated={isNfl ? null : lastUpdated}
        isAnyGameLive={!isNfl && isAnyGameLive}
        dateNav={dateNav}
      />

      {isNfl ? (
        <NflComingSoonView />
      ) : (
        <>
          {loading && <LoadingState />}

          {hasError && <ErrorView isInvalidDate={isInvalidDate} />}

          {isUnavailable && <NoDataView date={date} />}

          {!loading && !hasError && !isUnavailable && games.length === 0 && (
            <EmptyView date={date} />
          )}

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

export default ScoreboardContainer;
