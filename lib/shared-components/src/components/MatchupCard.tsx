import React, { useEffect } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import {
  FONT_BODY,
  FONT_DISPLAY,
  FONT_MONO,
  TABULAR_NUMS,
} from '../utils/typography';

const LIVE_RED = '#e63950';
const SUCCESS_GREEN = '#4AAE7C';

let _pulseInjected = false;
function injectPulseKeyframe(): void {
  if (typeof document === 'undefined' || _pulseInjected) return;
  _pulseInjected = true;
  const el = document.createElement('style');
  el.textContent = '@keyframes ls-dot-pulse{0%,100%{opacity:1}50%{opacity:.3}}';
  document.head.appendChild(el);
}

const EYEBROW_PROPS = {
  fontFamily: FONT_DISPLAY,
  fontWeight: '700' as const,
  fontSize: 11,
  letterSpacing: 1.32,
  textTransform: 'uppercase' as const,
};

const SCORE_PROPS = {
  fontFamily: FONT_DISPLAY,
  fontWeight: '800' as const,
  fontSize: 44,
  lineHeight: 1,
};

export interface MatchupTeam {
  name: string;
  /** Win-loss record, e.g. "8-4 · W3". */
  record?: string;
  /** Points scored. Omit for pre-game / bye. */
  score?: number;
  /**
   * @deprecated The design-system redesign (LS-4719) removed the abbreviation
   * column per spec. This field is retained so existing call sites compile
   * without changes, but it is not rendered by this component.
   */
  abbr?: string;
}

export interface MatchupCardProps {
  away: MatchupTeam;
  home: MatchupTeam;
  /** Game state. Defaults to 'pre'. */
  status?: 'live' | 'pre' | 'final' | 'bye';
  /** Week label for the left eyebrow, e.g. "WK 14". */
  week?: string;
  /** Date / time for the right eyebrow, e.g. "Sun 1:05 PM" or "Apr 5". */
  dateTime?: string;
  /**
   * @deprecated Replaced by the `week` + `dateTime` props in LS-4719.
   * If provided and `dateTime` is absent, the value is shown in the right
   * eyebrow so existing callers continue to render without visual breakage.
   */
  subtitle?: string;
  /** Left footer text. */
  footerLeft?: string;
  /** Right footer text. */
  footerRight?: string;
  /** Apply success (green) color to the right footer text, e.g. for "W". */
  footerRightSuccess?: boolean;
  /** Pre-game center projection line, e.g. "PROJ 121.4 vs 118.6". */
  projection?: string;
  /** Bye week: treat home slot as "No opponent" (italic / muted styling). */
  noOpponent?: boolean;
  onPress?: () => void;
}

/**
 * Design-system matchup card (LS-4719). Four states:
 *   - `live`  — pulsing red indicator, score-proportion bar, footer with lead info
 *   - `final` — winner's score in heritage gold, footer with margin / result
 *   - `pre`   — dashes for scores, optional projection text centered between them
 *   - `bye`   — 0.7 opacity, "No opponent" slot, resume-week footer
 *
 * Layout: eyebrow header (status left, date/time right) →
 *         3-column teams row (name+record left | VS | name+record right) →
 *         3-column score row (44px tabular-nums) →
 *         win-proportion bar (live only) →
 *         footer with border-top.
 *
 * Scores use Big Shoulders Display 800 at 44px with tabular-nums per brand
 * spec. The leading team's score is highlighted in heritage gold (`$brandGold`).
 */
export function MatchupCard({
  away,
  home,
  status = 'pre',
  week,
  dateTime,
  subtitle,
  footerLeft,
  footerRight,
  footerRightSuccess = false,
  projection,
  noOpponent = false,
  onPress,
}: MatchupCardProps): React.JSX.Element {
  useEffect(() => {
    injectPulseKeyframe();
  }, []);

  const isLive = status === 'live';
  const isFinal = status === 'final';
  const isPre = status === 'pre';
  const isBye = status === 'bye';

  const awayScore = away.score;
  const homeScore = home.score;
  const awayLeading =
    awayScore !== undefined && homeScore !== undefined && awayScore > homeScore;
  const homeLeading =
    awayScore !== undefined && homeScore !== undefined && homeScore > awayScore;

  // Score-proportion bar for live state
  const total = (awayScore ?? 0) + (homeScore ?? 0);
  const awayBarPct = total > 0 ? ((awayScore ?? 0) / total) * 100 : 50;

  const hasFooter = footerLeft !== undefined || footerRight !== undefined;

  // subtitle is deprecated; fall back to it when dateTime is absent so
  // old call sites render without visual breakage.
  const rightEyebrow = dateTime ?? subtitle;

  /* ── Left eyebrow ──────────────────────────────────────────────── */
  let eyebrowLeft: React.ReactNode;
  if (isLive) {
    const weekLabel = week ? ` · ${week}` : '';
    eyebrowLeft = (
      <XStack alignItems="center">
        <YStack
          width={7}
          height={7}
          borderRadius={9999}
          backgroundColor={LIVE_RED}
          marginRight={6}
          // web-only CSS animation; React Native ignores unknown style keys
          style={
            { animation: 'ls-dot-pulse 1.4s ease-in-out infinite' } as never
          }
        />
        <Text {...EYEBROW_PROPS} color={LIVE_RED}>
          {`LIVE${weekLabel}`}
        </Text>
      </XStack>
    );
  } else if (isFinal) {
    eyebrowLeft = (
      <Text {...EYEBROW_PROPS} color="$textMuted">
        {`FINAL${week ? ` · ${week}` : ''}`}
      </Text>
    );
  } else if (isPre) {
    eyebrowLeft = (
      <Text {...EYEBROW_PROPS} color="$brandGoldLight">
        {`PRE-GAME${week ? ` · ${week}` : ''}`}
      </Text>
    );
  } else {
    eyebrowLeft = (
      <Text {...EYEBROW_PROPS} color="$textMuted">
        {`BYE${week ? ` · ${week}` : ''}`}
      </Text>
    );
  }

  /* ── Score cells ───────────────────────────────────────────────── */
  const awayScoreEl =
    awayScore === undefined ? (
      <Text {...SCORE_PROPS} color="$textMuted" {...TABULAR_NUMS}>
        {'—'}
      </Text>
    ) : (
      <Text
        {...SCORE_PROPS}
        color={awayLeading ? '$brandGold' : '$color12'}
        {...TABULAR_NUMS}
      >
        {awayScore.toFixed(1)}
      </Text>
    );

  const homeScoreEl =
    homeScore === undefined ? (
      <Text {...SCORE_PROPS} color="$textMuted" {...TABULAR_NUMS}>
        {'—'}
      </Text>
    ) : (
      <Text
        {...SCORE_PROPS}
        color={homeLeading ? '$brandGold' : '$color12'}
        {...TABULAR_NUMS}
      >
        {homeScore.toFixed(1)}
      </Text>
    );

  return (
    <YStack
      borderRadius={20}
      borderWidth={1}
      borderColor="$surfacePanelBorder"
      backgroundColor="$surfacePanel"
      padding={18}
      gap={14}
      width="100%"
      opacity={isBye ? 0.7 : 1}
      onPress={onPress}
      cursor={onPress ? 'pointer' : undefined}
      hoverStyle={onPress ? { borderColor: '$glassBorderHover' } : undefined}
      pressStyle={onPress ? { scale: 0.98 } : undefined}
      animation="medium"
      role={onPress ? 'button' : undefined}
      tabIndex={onPress ? 0 : undefined}
      onKeyDown={
        onPress
          ? (e: React.KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onPress();
              }
            }
          : undefined
      }
    >
      {/* Header */}
      <XStack alignItems="center" justifyContent="space-between">
        {eyebrowLeft}
        {rightEyebrow ? (
          <Text {...EYEBROW_PROPS} color="$textMuted">
            {rightEyebrow}
          </Text>
        ) : null}
      </XStack>

      {/* Teams: left | VS | right */}
      <XStack alignItems="center" gap={14}>
        <YStack flex={1} gap={4}>
          <Text
            fontFamily={FONT_BODY}
            fontWeight="600"
            fontSize={14}
            color="$color11"
          >
            {away.name}
          </Text>
          {away.record ? (
            <Text fontFamily={FONT_MONO} fontSize={11} color="$textMuted">
              {away.record}
            </Text>
          ) : null}
        </YStack>

        <Text {...EYEBROW_PROPS} color="$textMuted">
          {isBye ? '·' : 'VS'}
        </Text>

        <YStack flex={1} gap={4} alignItems="flex-end">
          <Text
            fontFamily={FONT_BODY}
            fontWeight="600"
            fontSize={14}
            color={noOpponent ? '$textMuted' : '$color11'}
            fontStyle={noOpponent ? 'italic' : undefined}
          >
            {noOpponent ? 'No opponent' : home.name}
          </Text>
          {(noOpponent ? '—' : home.record) ? (
            <Text fontFamily={FONT_MONO} fontSize={11} color="$textMuted">
              {noOpponent ? '—' : home.record}
            </Text>
          ) : null}
        </YStack>
      </XStack>

      {/* Scores (not shown for bye) */}
      {!isBye ? (
        <XStack alignItems="center" gap={14}>
          <YStack flex={1}>{awayScoreEl}</YStack>

          <YStack alignItems="center">
            {isPre && projection ? (
              <Text
                fontFamily={FONT_DISPLAY}
                fontWeight="700"
                fontSize={12}
                letterSpacing={1.2}
                color="$brandGold"
                textAlign="center"
              >
                {projection}
              </Text>
            ) : null}
          </YStack>

          <YStack flex={1} alignItems="flex-end">
            {homeScoreEl}
          </YStack>
        </XStack>
      ) : null}

      {/* Win-probability bar (live only) */}
      {isLive ? (
        <XStack
          height={4}
          borderRadius={9999}
          overflow="hidden"
          backgroundColor="$surfaceSubtle"
        >
          <YStack
            height={4}
            width={`${awayBarPct}%`}
            backgroundColor="$brandGold"
          />
          <YStack height={4} flex={1} backgroundColor="$brandNavyLight" />
        </XStack>
      ) : null}

      {/* Footer */}
      {hasFooter ? (
        <XStack
          justifyContent="space-between"
          alignItems="center"
          borderTopWidth={1}
          borderTopColor="$outlineSubtle"
          paddingTop={10}
        >
          <Text fontFamily={FONT_MONO} fontSize={11} color="$textMuted">
            {footerLeft ?? ''}
          </Text>
          <Text
            fontFamily={FONT_MONO}
            fontSize={11}
            color={footerRightSuccess ? SUCCESS_GREEN : '$textMuted'}
          >
            {footerRight ?? ''}
          </Text>
        </XStack>
      ) : null}
    </YStack>
  );
}
