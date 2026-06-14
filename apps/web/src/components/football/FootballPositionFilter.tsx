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

/** Selectable positions, in display order. `All` is rendered separately. */
export const POSITIONS: FootballPosition[] = [
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

// Pills (including the leading "All" pill) for roving-tabindex navigation.
const PILL_COUNT = POSITIONS.length + 1;

interface Props {
  /** Currently-selected positions. Empty means "All" (no position filter). */
  selected: FootballPosition[];
  /**
   * Toggle a single position on/off. Intent-based (rather than emitting a full
   * array) so the parent can resolve the new set against its authoritative
   * state — this keeps rapid successive toggles from racing on a stale
   * `selected` snapshot (LS-6464).
   */
  onToggle: (pos: FootballPosition) => void;
  /** Clear the whole selection ("All"). */
  onClear: () => void;
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

export function FootballPositionFilter({ selected, onToggle, onClear }: Props) {
  const pillRefs = React.useRef<(HTMLElement | null)[]>([]);
  // Roving tabindex: only one pill is in the tab order at a time. Index 0 is
  // the "All" pill; positions follow at index 1..N. Defaults to "All".
  const [focusIndex, setFocusIndex] = React.useState(0);

  // Activating a pill: index 0 clears the filter ("All"), others toggle.
  const activate = (index: number) => {
    if (index === 0) {
      onClear();
    } else {
      onToggle(POSITIONS[index - 1]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    let nextIndex: number | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      nextIndex = (index + 1) % PILL_COUNT;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      nextIndex = (index - 1 + PILL_COUNT) % PILL_COUNT;
    } else if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault();
      activate(index);
      return;
    }
    if (nextIndex !== null) {
      setFocusIndex(nextIndex);
      pillRefs.current[nextIndex]?.focus();
    }
  };

  const renderPill = (
    label: string,
    index: number,
    isActive: boolean,
    accentColor: string,
  ) => (
    <Pill
      key={label}
      ref={(el: HTMLElement | null) => {
        pillRefs.current[index] = el;
      }}
      active={isActive}
      onPress={() => {
        setFocusIndex(index);
        activate(index);
      }}
      role="button"
      aria-pressed={isActive}
      tabIndex={focusIndex === index ? 0 : -1}
      onKeyDown={(e: React.KeyboardEvent) => handleKeyDown(e, index)}
      style={
        isActive
          ? {
              backgroundColor: withAlpha(accentColor, 0.15),
              borderColor: accentColor,
              color: label === 'All' ? TEXT_PRIMARY : accentColor,
            }
          : undefined
      }
    >
      {label}
    </Pill>
  );

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 4 }}
    >
      <XStack
        gap={8}
        paddingVertical={4}
        role="group"
        aria-label="Filter by position"
      >
        {/* "All" clears the multi-select; active when nothing is selected. */}
        {renderPill('All', 0, selected.length === 0, BRAND_NAVY)}
        {POSITIONS.map((pos, i) =>
          renderPill(
            pos,
            i + 1,
            selected.includes(pos),
            FOOTBALL_POSITION_COLORS[pos],
          ),
        )}
      </XStack>
    </ScrollView>
  );
}
