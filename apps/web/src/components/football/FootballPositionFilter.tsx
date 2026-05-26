import React from 'react';
import { ScrollView, styled, Text, XStack } from 'tamagui';
import {
  BRAND_NAVY,
  BRAND_NAVY_LIGHT,
  OUTLINE_SUBTLE,
  POS_DEF,
  POS_K,
  POS_QB,
  POS_RB,
  POS_TE,
  POS_WR,
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
  | 'K'
  | 'DST'
  | 'DL'
  | 'LB'
  | 'DB';

const POSITIONS: FootballPosition[] = [
  'All',
  'QB',
  'RB',
  'WR',
  'TE',
  'K',
  'DST',
  'DL',
  'LB',
  'DB',
];

const POSITION_COLORS: Record<string, string> = {
  QB: POS_QB,
  RB: POS_RB,
  WR: POS_WR,
  TE: POS_TE,
  K: POS_K,
  DST: POS_DEF,
  DL: POS_DEF,
  LB: POS_DEF,
  DB: POS_DEF,
};

interface Props {
  selected: FootballPosition;
  onChange: (pos: FootballPosition) => void;
}

const Pill = styled(Text, {
  paddingHorizontal: 14,
  paddingVertical: 7,
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
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 4 }}
    >
      <XStack gap={8} paddingVertical={4}>
        {POSITIONS.map((pos) => {
          const isActive = pos === selected;
          const accentColor = pos === 'All' ? BRAND_NAVY : POSITION_COLORS[pos];
          return (
            <Pill
              key={pos}
              active={isActive}
              onPress={() => onChange(pos)}
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
