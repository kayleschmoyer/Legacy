import React from 'react';
import { ScrollView, styled, Text, XStack } from 'tamagui';
import {
  BRAND_NAVY,
  BRAND_NAVY_LIGHT,
  FOOTBALL_POSITION_COLORS,
  OUTLINE_SUBTLE,
  SURFACE_CARD,
  TEXT_MUTED,
  TEXT_PRIMARY,
  withAlpha,
} from '../../constants/colors';

export type FootballPosition =
  | 'All'
  | 'QB'
  | 'RB'
  | 'WR'
  | 'TE'
  | 'FLEX'
  | 'K'
  | 'DST'
  | 'DL'
  | 'LB'
  | 'DB';

export const POSITIONS: FootballPosition[] = [
  'All',
  'QB',
  'RB',
  'WR',
  'TE',
  'FLEX',
  'K',
  'DST',
  'DL',
  'LB',
  'DB',
];

interface Props {
  selected: FootballPosition;
  onChange: (pos: FootballPosition) => void;
}

const Pill = styled(Text, {
  paddingHorizontal: 14,
  paddingVertical: 14,
  borderRadius: 20,
  fontSize: 13,
  fontWeight: '600',
  letterSpacing: 0.3,
  cursor: 'pointer',
  userSelect: 'none',
  borderWidth: 1,
  borderColor: OUTLINE_SUBTLE,
  backgroundColor: SURFACE_CARD,
  color: TEXT_MUTED,
  hoverStyle: {
    borderColor: BRAND_NAVY_LIGHT,
    color: TEXT_PRIMARY,
  },
  pressStyle: {
    opacity: 0.8,
  },
  variants: {
    active: {
      true: {
        color: TEXT_PRIMARY,
      },
    },
  } as const,
});

export function FootballPositionFilter({ selected, onChange }: Props) {
  const pillRefs = React.useRef<(HTMLElement | null)[]>([]);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 4 }}
    >
      <XStack
        gap={8}
        paddingVertical={4}
        role="radiogroup"
        aria-label="Filter by position"
      >
        {POSITIONS.map((pos, index) => {
          const isActive = pos === selected;
          const accentColor =
            pos === 'All' ? BRAND_NAVY : FOOTBALL_POSITION_COLORS[pos];
          return (
            <Pill
              key={pos}
              ref={(el: HTMLElement | null) => {
                pillRefs.current[index] = el;
              }}
              active={isActive}
              onPress={() => onChange(pos)}
              role="radio"
              aria-checked={isActive}
              tabIndex={isActive ? 0 : -1}
              onKeyDown={(e: React.KeyboardEvent) => {
                let nextIndex: number | null = null;
                if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                  e.preventDefault();
                  nextIndex = (index + 1) % POSITIONS.length;
                } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                  e.preventDefault();
                  nextIndex = (index - 1 + POSITIONS.length) % POSITIONS.length;
                }
                if (nextIndex !== null) {
                  onChange(POSITIONS[nextIndex]);
                  pillRefs.current[nextIndex]?.focus();
                }
              }}
              style={
                isActive
                  ? {
                      backgroundColor: withAlpha(accentColor, 0.15),
                      borderColor: accentColor,
                      color: pos === 'All' ? TEXT_PRIMARY : accentColor,
                    }
                  : undefined
              }
            >
              {pos}
            </Pill>
          );
        })}
      </XStack>
    </ScrollView>
  );
}
