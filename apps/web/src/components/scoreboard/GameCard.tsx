import React, { useState } from 'react';
import { Card, Separator, Text, XStack, YStack } from 'tamagui';
import { Linescore } from './Linescore';
import type { ScoreboardGame } from './Scoreboard';
import { FONT_BODY, FONT_DISPLAY } from '../../constants/typography';

export interface GameCardProps {
  game: ScoreboardGame;
}

function statusColor(status: string): string {
  if (status === 'Live') return '$green10';
  if (status === 'Final') return '$gray10';
  return '$blue10';
}

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

/**
 * GameCard — displays a single MLB game score.
 * Shows team abbreviations, runs, and game status. Expands to show the
 * inning-by-inning linescore when tapped.
 *
 * Typography:
 *  - Score numbers: Big Shoulders Display 30px/800 — the dominant element
 *  - Team abbreviations: Big Shoulders Display 16px/700 — secondary anchor
 *  - Team full names: Literata 13px — editorial caption treatment
 *  - Status badge: Big Shoulders Display — sporty label character
 */
export function GameCard({ game }: GameCardProps) {
  const [expanded, setExpanded] = useState(false);
  const { status, startTime, inning, inningHalf, outs, homeTeam, awayTeam } =
    game;

  const isLive = status === 'Live';
  const isFinal = status === 'Final';
  const isPreview = !isLive && !isFinal;

  const hasLinescore =
    (homeTeam.linescoreInnings?.length ?? 0) > 0 ||
    (awayTeam.linescoreInnings?.length ?? 0) > 0;

  const awayLeads = !isPreview && awayTeam.runs > homeTeam.runs;
  const homeLeads = !isPreview && homeTeam.runs > awayTeam.runs;
  // "Winner" sr-only label is only accurate once a game is final.
  // For live/in-progress games use "Leading" to avoid a false announcement.
  const awayWins = isFinal && awayLeads;
  const homeWins = isFinal && homeLeads;

  const awayScoreColor = awayLeads
    ? '$green11'
    : homeLeads
      ? '$color9'
      : '$color12';
  const homeScoreColor = homeLeads
    ? '$green11'
    : awayLeads
      ? '$color9'
      : '$color12';

  return (
    <Card
      elevate
      bordered
      size="$3"
      pressStyle={{ scale: 0.99 }}
      onPress={() => hasLinescore && setExpanded((v) => !v)}
      data-testid={`game-card-${game.gamePk}`}
    >
      <Card.Header padded paddingBottom="$2">
        <XStack justifyContent="space-between" alignItems="center">
          {/* Status badge — Big Shoulders Display for sporty label feel */}
          <Text
            fontSize="$3"
            fontWeight="700"
            fontFamily={FONT_DISPLAY}
            letterSpacing={0.5}
            color={statusColor(status)}
            backgroundColor={isFinal ? '$color2' : '$backgroundPress'}
            paddingHorizontal="$2"
            paddingVertical="$1"
            borderRadius="$2"
          >
            {isLive ? `▶ ${inningHalf ?? ''} ${inning ?? ''}` : status}
          </Text>

          {isLive && outs !== undefined && outs !== null && (
            <Text fontSize="$2" color="$gray10" fontFamily={FONT_BODY}>
              {outs} out{outs !== 1 ? 's' : ''}
            </Text>
          )}

          {isPreview && startTime && (
            <Text
              fontSize="$3"
              fontWeight="600"
              color="$gray10"
              fontFamily={FONT_DISPLAY}
              letterSpacing={0.5}
            >
              {formatStartTime(startTime)}
            </Text>
          )}
        </XStack>
      </Card.Header>

      <YStack paddingHorizontal="$4" paddingBottom="$3" gap="$3">
        {/* Away team row */}
        <XStack justifyContent="space-between" alignItems="center" gap="$2">
          {/* Team identity — abbreviation anchors, name is caption */}
          <XStack alignItems="baseline" gap="$2" flex={1} minWidth={0}>
            <Text
              fontSize="$5"
              fontWeight="700"
              fontFamily={FONT_DISPLAY}
              letterSpacing={0.5}
              color="$color12"
            >
              {awayTeam.abbreviation}
            </Text>
            <Text
              fontSize="$3"
              color="$gray10"
              fontFamily={FONT_BODY}
              numberOfLines={1}
            >
              {awayTeam.teamName}
            </Text>
          </XStack>

          {/* Score — the dominant element on the card */}
          <XStack alignItems="center" gap="$1">
            {awayWins && <span className="sr-only">Winner</span>}
            {!awayWins && awayLeads && <span className="sr-only">Leading</span>}
            <Text
              fontSize="$9"
              fontWeight="800"
              fontFamily={FONT_DISPLAY}
              color={awayScoreColor}
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {isPreview ? '–' : awayTeam.runs}
            </Text>
          </XStack>
        </XStack>

        {/* Home team row */}
        <XStack justifyContent="space-between" alignItems="center" gap="$2">
          <XStack alignItems="baseline" gap="$2" flex={1} minWidth={0}>
            <Text
              fontSize="$5"
              fontWeight="700"
              fontFamily={FONT_DISPLAY}
              letterSpacing={0.5}
              color="$color12"
            >
              {homeTeam.abbreviation}
            </Text>
            <Text
              fontSize="$3"
              color="$gray10"
              fontFamily={FONT_BODY}
              numberOfLines={1}
            >
              {homeTeam.teamName}
            </Text>
          </XStack>

          <XStack alignItems="center" gap="$1">
            {homeWins && <span className="sr-only">Winner</span>}
            {!homeWins && homeLeads && <span className="sr-only">Leading</span>}
            <Text
              fontSize="$9"
              fontWeight="800"
              fontFamily={FONT_DISPLAY}
              color={homeScoreColor}
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {isPreview ? '–' : homeTeam.runs}
            </Text>
          </XStack>
        </XStack>

        {/* R/H/E footer for final/live games */}
        {!isPreview && (
          <XStack justifyContent="flex-end" gap="$4" marginTop="$0">
            <Text
              fontSize="$2"
              color="$gray10"
              fontFamily={FONT_BODY}
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              H: {awayTeam.hits}/{homeTeam.hits}
            </Text>
            <Text
              fontSize="$2"
              color="$gray10"
              fontFamily={FONT_BODY}
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              E: {awayTeam.errors}/{homeTeam.errors}
            </Text>
            {hasLinescore && (
              <Text
                fontSize="$2"
                color="$blue10"
                fontFamily={FONT_DISPLAY}
                letterSpacing={0.3}
              >
                {expanded ? 'Hide ▲' : 'Linescore ▼'}
              </Text>
            )}
          </XStack>
        )}
      </YStack>

      {/* Expandable linescore */}
      {expanded && hasLinescore && (
        <>
          <Separator />
          <YStack padding="$3">
            {/* Custom thin scrollbar where supported */}
            <div
              style={{
                overflowX: 'auto',
                scrollbarWidth: 'thin',
                scrollbarColor: 'var(--borderColor, #2F3B53) transparent',
              }}
            >
              <Linescore
                homeInnings={homeTeam.linescoreInnings ?? []}
                awayInnings={awayTeam.linescoreInnings ?? []}
                homeAbbr={homeTeam.abbreviation}
                awayAbbr={awayTeam.abbreviation}
              />
            </div>
          </YStack>
        </>
      )}
    </Card>
  );
}
