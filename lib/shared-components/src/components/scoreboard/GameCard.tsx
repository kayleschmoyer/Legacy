/**
 * GameCard — single MLB game display with status, scores, and an
 * expandable linescore. Designed to be fed directly with the shape
 * returned by the `GetScoreboard` GraphQL query.
 *
 * Score colour semantics:
 *   - Upcoming: muted; runs render as "–"
 *   - Live tied: high-contrast text
 *   - Live leading: turf green
 *   - Live trailing: muted gray
 *   - Final winner: heritage gold; loser muted
 */
import React, { useState } from 'react';
import { Card, ScrollView, Separator, Text, XStack, YStack } from 'tamagui';
import { Linescore } from './Linescore';
import { OutsPips } from './OutsPips';
import type { ScoreboardGame } from './types';
import { OVERLAY_WHITE_05 } from '../../utils/colors';

export interface GameCardProps {
  game: ScoreboardGame;
  /**
   * Initial expansion state of the linescore. Defaults to false.
   * The card always controls the expanded state internally after mount.
   */
  defaultExpanded?: boolean;
  testID?: string;
}

const TABULAR_NUMS = ['tabular-nums'] as 'tabular-nums'[];

function formatStartTime(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

interface ScoreColor {
  abbr: string;
  score: string;
}

function rowColors(args: {
  isUpcoming: boolean;
  isFinal: boolean;
  isLive: boolean;
  tied: boolean;
  isLeader: boolean;
  isWinner: boolean;
  isLoser: boolean;
}): ScoreColor {
  const { isUpcoming, isFinal, isLive, tied, isLeader, isWinner, isLoser } =
    args;
  if (isUpcoming) return { abbr: '$color11', score: '$color9' };
  if (isFinal) {
    if (isWinner) return { abbr: '$brandGoldLight', score: '$brandGoldLight' };
    if (isLoser) return { abbr: '$color9', score: '$color11' };
    return { abbr: '$color12', score: '$color12' };
  }
  if (isLive && tied) return { abbr: '$color12', score: '$color12' };
  if (isLive && isLeader) return { abbr: '$color12', score: '$green11' };
  if (isLive) return { abbr: '$color11', score: '$color9' };
  return { abbr: '$color12', score: '$color12' };
}

function StatusBadge({
  status,
  isLive,
  isFinal,
  inningHalf,
  inning,
}: {
  status: string;
  isLive: boolean;
  isFinal: boolean;
  inningHalf?: string | null;
  inning?: number | null;
}) {
  // Live games show the half-inning instead of the literal status word so
  // the card carries useful in-progress context. For everything else
  // (Preview / Final / Postponed / Suspended / future values) we show the
  // raw status string so the API stays the source of truth.
  const label = isLive
    ? `▶ ${inningHalf ?? ''} ${inning ?? ''}`.trim()
    : status;
  const color = isLive ? '$green11' : isFinal ? '$color9' : '$brandNavyLight';
  return (
    <Text
      fontSize={11}
      fontWeight="700"
      letterSpacing={1.4}
      textTransform="uppercase"
      color={color}
    >
      {label}
    </Text>
  );
}

function TeamLogo({ abbr }: { abbr: string }) {
  return (
    <YStack
      width={38}
      height={38}
      borderRadius={19}
      backgroundColor="$brandNavy"
      borderWidth={1}
      borderColor="$brandNavyLight"
      alignItems="center"
      justifyContent="center"
      aria-hidden
    >
      <Text fontSize={12} fontWeight="800" color="white" letterSpacing={0.5}>
        {abbr.slice(0, 3)}
      </Text>
    </YStack>
  );
}

export function GameCard({
  game,
  defaultExpanded = false,
  testID,
}: GameCardProps): React.JSX.Element {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const { status, startTime, inning, inningHalf, outs, awayTeam, homeTeam } =
    game;

  const isLive = status === 'Live';
  const isFinal = status === 'Final';
  // Only Preview / Postponed are "no score yet" — Suspended games have a
  // recorded score and (often) a linescore, so they should display real
  // numbers and remain expandable instead of being lumped in with previews.
  const isUpcoming = status === 'Preview' || status === 'Postponed';

  const awayRuns = awayTeam.runs;
  const homeRuns = homeTeam.runs;
  const tied = isLive && awayRuns === homeRuns;
  const awayLeads = !isUpcoming && awayRuns > homeRuns;
  const homeLeads = !isUpcoming && homeRuns > awayRuns;

  const awayWins = isFinal && awayLeads;
  const homeWins = isFinal && homeLeads;
  const awayLoses = isFinal && homeLeads;
  const homeLoses = isFinal && awayLeads;

  const awayColors = rowColors({
    isUpcoming,
    isFinal,
    isLive,
    tied,
    isLeader: awayLeads,
    isWinner: awayWins,
    isLoser: awayLoses,
  });
  const homeColors = rowColors({
    isUpcoming,
    isFinal,
    isLive,
    tied,
    isLeader: homeLeads,
    isWinner: homeWins,
    isLoser: homeLoses,
  });

  const hasLinescore =
    (awayTeam.linescoreInnings?.length ?? 0) > 0 ||
    (homeTeam.linescoreInnings?.length ?? 0) > 0;

  const togglable = hasLinescore && !isUpcoming;

  return (
    <Card
      bordered
      padded={false}
      backgroundColor="$surfaceCard"
      borderColor={isLive ? '$brandSeamRed' : '$borderColor'}
      pressStyle={togglable ? { scale: 0.99 } : undefined}
      onPress={togglable ? () => setExpanded((v) => !v) : undefined}
      hoverStyle={togglable ? { borderColor: '$brandGold' } : undefined}
      testID={testID ?? `game-card-${game.gamePk}`}
      aria-expanded={togglable ? expanded : undefined}
    >
      {/* Top strip: status | outs (live) | start time (upcoming) */}
      <XStack
        paddingHorizontal="$4"
        paddingTop="$3"
        paddingBottom="$2"
        alignItems="center"
        justifyContent="space-between"
        gap="$2"
      >
        <StatusBadge
          status={status}
          isLive={isLive}
          isFinal={isFinal}
          inningHalf={inningHalf}
          inning={inning}
        />
        {isLive && outs != null && <OutsPips outs={outs} />}
        {isUpcoming && startTime && (
          <Text
            fontSize={12}
            color="$color11"
            letterSpacing={0.5}
            fontVariant={TABULAR_NUMS}
          >
            {formatStartTime(startTime)}
          </Text>
        )}
      </XStack>

      {/* Team rows */}
      <YStack
        paddingHorizontal="$4"
        paddingTop="$1"
        paddingBottom="$3"
        gap="$2"
      >
        {(
          [
            {
              team: awayTeam,
              colors: awayColors,
              isWinner: awayWins,
              isLeader: !isFinal && awayLeads,
            },
            {
              team: homeTeam,
              colors: homeColors,
              isWinner: homeWins,
              isLeader: !isFinal && homeLeads,
            },
          ] as const
        ).map(({ team, colors, isWinner, isLeader }, i) => {
          // Screen-reader announcement for live leaders + final winners.
          // Uses aria-label on the score (the loudest visual element) so
          // assistive tech reads "Winner — 7 runs" / "Leading — 4 runs"
          // instead of just the bare number. Restored after the previous
          // sr-only pattern was lost in the redesign (LS-4130 review).
          const scoreAria = isUpcoming
            ? undefined
            : isWinner
              ? `Winner — ${team.runs} ${team.runs === 1 ? 'run' : 'runs'}`
              : isLeader
                ? `Leading — ${team.runs} ${team.runs === 1 ? 'run' : 'runs'}`
                : undefined;
          return (
            <XStack
              key={i}
              alignItems="center"
              gap="$3"
              backgroundColor={OVERLAY_WHITE_05}
              borderRadius="$2"
              paddingVertical="$2"
              paddingHorizontal="$2"
            >
              <TeamLogo abbr={team.abbreviation} />
              <YStack flex={1} minWidth={0}>
                <Text
                  fontSize={17}
                  fontWeight="700"
                  letterSpacing={0.5}
                  color={colors.abbr}
                  lineHeight={20}
                >
                  {team.abbreviation}
                  {isWinner && (
                    <Text
                      fontSize={11}
                      color="$brandGoldLight"
                      letterSpacing={1}
                      aria-hidden
                    >
                      {'  '}WIN
                    </Text>
                  )}
                </Text>
                <Text fontSize={12} color="$color9" numberOfLines={1}>
                  {team.teamName}
                </Text>
              </YStack>
              <Text
                fontSize={36}
                fontWeight="800"
                lineHeight={36}
                letterSpacing={-0.5}
                color={colors.score}
                minWidth={42}
                textAlign="right"
                fontVariant={TABULAR_NUMS}
                aria-label={scoreAria}
              >
                {isUpcoming ? '–' : team.runs}
              </Text>
            </XStack>
          );
        })}
      </YStack>

      {/* Footer (Live + Final only): R/H/E summary + linescore toggle hint */}
      {!isUpcoming && (
        <XStack
          paddingHorizontal="$4"
          paddingVertical="$2"
          alignItems="center"
          justifyContent="space-between"
          gap="$3"
          borderTopWidth={1}
          borderColor="$borderColor"
        >
          <XStack gap="$3">
            <Text fontSize={12} color="$color11" fontVariant={TABULAR_NUMS}>
              <Text
                fontSize={11}
                fontWeight="700"
                letterSpacing={1.2}
                color="$color9"
              >
                H{' '}
              </Text>
              {awayTeam.hits}/{homeTeam.hits}
            </Text>
            <Text fontSize={12} color="$color11" fontVariant={TABULAR_NUMS}>
              <Text
                fontSize={11}
                fontWeight="700"
                letterSpacing={1.2}
                color="$color9"
              >
                E{' '}
              </Text>
              {awayTeam.errors}/{homeTeam.errors}
            </Text>
          </XStack>
          {togglable && (
            <Text
              fontSize={11}
              fontWeight="700"
              letterSpacing={1.2}
              textTransform="uppercase"
              color="$brandNavyLight"
            >
              {expanded ? 'Hide ▲' : 'Linescore ▼'}
            </Text>
          )}
        </XStack>
      )}

      {/* Expanded linescore */}
      {togglable && expanded && (
        <>
          <Separator borderColor="$borderColor" />
          {/* Wide linescores (extra innings) need horizontal scroll on both
              web and native — Tamagui's ScrollView is a thin wrapper around
              RN's ScrollView so the same component works on both platforms. */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            backgroundColor="$surfacePanel"
            padding="$3"
          >
            <Linescore
              awayAbbr={awayTeam.abbreviation}
              homeAbbr={homeTeam.abbreviation}
              awayInnings={awayTeam.linescoreInnings ?? []}
              homeInnings={homeTeam.linescoreInnings ?? []}
              awayHits={awayTeam.hits}
              homeHits={homeTeam.hits}
              awayErrors={awayTeam.errors}
              homeErrors={homeTeam.errors}
              currentInningIndex={isLive && inning != null ? inning - 1 : null}
              currentInningHalf={
                isLive
                  ? inningHalf === 'Top' || inningHalf === 'Bot'
                    ? inningHalf
                    : null
                  : null
              }
            />
          </ScrollView>
        </>
      )}
    </Card>
  );
}
