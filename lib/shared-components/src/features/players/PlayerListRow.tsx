import React from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { PlayerFragment } from './PlayersApi';
import { fullName, initialsOf } from './playerNameUtils';
import { Platform } from '../../platform-components';
import {
  BRAND_GOLD_LIGHT,
  OUTLINE_SUBTLE,
  POS_UTILITY,
  SURFACE_CARD,
  TEXT_MUTED,
  TEXT_NEUTRAL_FG3,
  TEXT_PRIMARY,
  withAlpha,
} from '../../utils/colors';

// Big Shoulders Display + Literata families are already loaded via tamagui-config;
// keep the family strings local so callers don't have to thread them through.
const FONT_DISPLAY = "'Big Shoulders Display', sans-serif";
const FONT_BODY = "'Literata', serif";

export interface PlayerListRowProps {
  player: PlayerFragment;
  /** 0-based position in the rendered list — surfaces as a zero-padded rank. */
  index: number;
  onPlayerClick?: (player: PlayerFragment) => void;
}

/** Pure helper — exported so the dense list view can be unit-tested without
 *  mounting the full Apollo + Tamagui surface (LS-4650). Mirrors the design's
 *  `String(idx + 1).padStart(2, '0')` rule from players-parts.jsx. */
export function rankLabel(index: number): string {
  return String(index + 1).padStart(2, '0');
}

/**
 * Dense editorial row for the Players Page list view (LS-4650). Mirrors the
 * `.pp-list-row` rules in docs/design/F89Q4j6WFCFqqsZpQ4VhlQ/legacy-sports-players-page/
 * project/players.css. The basic Player fragment doesn't yet carry per-player
 * batting/pitching stats, so the stat cells render the design's slot scaffold
 * with em-dashes — same approach as the LS-4646 Featured spotlight.
 */
export function PlayerListRow({
  player,
  index,
  onPlayerClick,
}: PlayerListRowProps) {
  const stripeColor = POS_UTILITY;
  const name = fullName(player) || 'Unknown Player';

  const isWeb = Platform.OS === 'web';

  return (
    <XStack
      role="button"
      tabIndex={0}
      aria-label={`Player ${name}, rank ${rankLabel(index)}`}
      className="pp-list-row"
      onPress={() => onPlayerClick?.(player)}
      cursor={onPlayerClick ? 'pointer' : 'default'}
      style={{
        position: 'relative',
        gap: 16,
        alignItems: 'center',
        padding: '14px 18px',
        backgroundColor: SURFACE_CARD,
        borderWidth: 1,
        borderStyle: 'solid',
        borderColor: 'rgba(255,255,255,0.05)',
        // Rounded ends + collapsed interior borders come from the parent list
        // wrapper applying first-child / last-child rules in CSS.
      }}
    >
      {/* Position color stripe — exactly 1px per design + AGENTS.md brand rules. */}
      <YStack
        aria-hidden={true}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 1,
          backgroundColor: stripeColor,
        }}
      />

      {/* Rank */}
      <Text
        className="pp-list-rank"
        style={{
          fontFamily: FONT_DISPLAY,
          fontWeight: '700',
          fontSize: 12,
          color: TEXT_MUTED,
          fontVariantNumeric: 'tabular-nums',
          minWidth: 28,
        }}
      >
        {rankLabel(index)}
      </Text>

      {/* Initials mug */}
      <YStack
        className="pp-list-mug"
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: withAlpha(stripeColor, 0.18),
          borderWidth: 1,
          borderStyle: 'solid',
          borderColor: withAlpha(stripeColor, 0.3),
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Text
          style={{
            fontFamily: FONT_DISPLAY,
            fontWeight: '800',
            fontSize: 11,
            color: TEXT_PRIMARY,
          }}
        >
          {initialsOf(player)}
        </Text>
      </YStack>

      {/* Identity */}
      <YStack className="pp-list-id" style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text
          className="pp-list-name"
          numberOfLines={1}
          style={{
            fontFamily: FONT_DISPLAY,
            fontWeight: '700',
            fontSize: 16,
            color: TEXT_PRIMARY,
          }}
        >
          {name}
        </Text>
        {player.brefId && (
          <Text
            className="pp-list-meta"
            numberOfLines={1}
            style={{
              fontFamily: FONT_BODY,
              fontStyle: 'italic',
              fontSize: 12,
              color: TEXT_NEUTRAL_FG3,
            }}
          >
            Baseball Reference · {player.brefId}
          </Text>
        )}
      </YStack>

      {/* Stat cells — scaffold; per-player batting/pitching wiring lands in
          follow-up slices. Two visible on mobile, two more revealed at >=700px.
          The hide-sm class is gated via the inline <style> block in
          PlayersGrid so we don't depend on the design bundle's CSS being
          shipped to the runtime. */}
      {(['AVG', 'HR', 'RBI', 'OPS'] as const).map((label, statIdx) => {
        const goldHighlight = label === 'AVG';
        const hideOnNarrow = statIdx >= 2;
        return (
          <YStack
            key={label}
            className={
              'pp-list-stat' + (hideOnNarrow && isWeb ? ' pp-list-stat-md' : '')
            }
            style={{
              alignItems: 'flex-end',
              minWidth: 56,
              gap: 2,
            }}
          >
            <Text
              style={{
                fontFamily: FONT_DISPLAY,
                fontWeight: '700',
                fontSize: 9,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: TEXT_MUTED,
              }}
            >
              {label}
            </Text>
            <Text
              style={{
                fontFamily: FONT_DISPLAY,
                fontWeight: '800',
                fontSize: 17,
                lineHeight:
                  Platform.OS === 'web' ? ('1.1' as unknown as number) : 19,
                color: goldHighlight ? BRAND_GOLD_LIGHT : TEXT_PRIMARY,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              —
            </Text>
          </YStack>
        );
      })}
      {/* Trailing hair-line divider (matches `.pp-list-row` 1px outline-subtle bottom in design). */}
      <YStack
        aria-hidden={true}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 1,
          backgroundColor: OUTLINE_SUBTLE,
          opacity: 0.5,
        }}
      />
    </XStack>
  );
}
