import React, { useState } from 'react';
import { Card, Separator, Text, XStack, YStack } from 'tamagui';
import { Linescore } from './Linescore';
import type { ScoreboardGame } from './Scoreboard';

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
          {/* Status badge */}
          <Text
            fontSize="$2"
            fontWeight="700"
            color={statusColor(status)}
            backgroundColor="$backgroundPress"
            paddingHorizontal="$2"
            paddingVertical="$1"
            borderRadius="$2"
          >
            {isLive ? `▶ ${inningHalf ?? ''} ${inning ?? ''}` : status}
          </Text>

          {isLive && outs !== undefined && outs !== null && (
            <Text fontSize="$2" color="$gray10">
              {outs} out{outs !== 1 ? 's' : ''}
            </Text>
          )}

          {isPreview && startTime && (
            <Text fontSize="$2" color="$gray10">
              {formatStartTime(startTime)}
            </Text>
          )}
        </XStack>
      </Card.Header>

      <YStack paddingHorizontal="$4" paddingBottom="$3" gap="$2">
        {/* Away team */}
        <XStack justifyContent="space-between" alignItems="center">
          <Text fontSize="$4" fontWeight={isLive ? '600' : '400'}>
            {awayTeam.abbreviation}{' '}
            <Text fontSize="$3" color="$gray10">
              {awayTeam.teamName}
            </Text>
          </Text>
          <Text
            fontSize="$6"
            fontWeight="800"
            color={
              !isPreview && awayTeam.runs > homeTeam.runs
                ? '$green11'
                : '$gray12'
            }
          >
            {isPreview ? '-' : awayTeam.runs}
          </Text>
        </XStack>

        {/* Home team */}
        <XStack justifyContent="space-between" alignItems="center">
          <Text fontSize="$4" fontWeight={isLive ? '600' : '400'}>
            {homeTeam.abbreviation}{' '}
            <Text fontSize="$3" color="$gray10">
              {homeTeam.teamName}
            </Text>
          </Text>
          <Text
            fontSize="$6"
            fontWeight="800"
            color={
              !isPreview && homeTeam.runs > awayTeam.runs
                ? '$green11'
                : '$gray12'
            }
          >
            {isPreview ? '-' : homeTeam.runs}
          </Text>
        </XStack>

        {/* R/H/E footer for final/live games */}
        {!isPreview && (
          <XStack justifyContent="flex-end" gap="$4" marginTop="$1">
            <Text fontSize="$2" color="$gray10">
              H: {awayTeam.hits}/{homeTeam.hits}
            </Text>
            <Text fontSize="$2" color="$gray10">
              E: {awayTeam.errors}/{homeTeam.errors}
            </Text>
            {hasLinescore && (
              <Text fontSize="$2" color="$blue10">
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
          <YStack padding="$3" overflow="scroll">
            <Linescore
              homeInnings={homeTeam.linescoreInnings ?? []}
              awayInnings={awayTeam.linescoreInnings ?? []}
              homeAbbr={homeTeam.abbreviation}
              awayAbbr={awayTeam.abbreviation}
            />
          </YStack>
        </>
      )}
    </Card>
  );
}
