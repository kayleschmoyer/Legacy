import React from 'react';
import { Text, XStack } from 'tamagui';
import { ArrowDown, ArrowUp } from '@tamagui/lucide-icons';
import {
  BRAND_NAVY,
  BRAND_NAVY_LIGHT,
  OUTLINE_SUBTLE,
  SURFACE_CARD,
  TEXT_MUTED,
  TEXT_PRIMARY,
  withAlpha,
} from '../../constants/colors';
import { FONT_BODY } from '../../constants/typography';

export type FootballPlayerSortField = 'name' | 'position' | 'team';
export type SortDir = 'asc' | 'desc';

export interface FootballPlayerSortValue {
  // Unset field means the default (server-side id) order.
  field?: FootballPlayerSortField;
  dir: SortDir;
}

const SORT_OPTIONS: { field: FootballPlayerSortField; label: string }[] = [
  { field: 'name', label: 'Name' },
  { field: 'position', label: 'Position' },
  { field: 'team', label: 'Team' },
];

interface Props {
  value: FootballPlayerSortValue;
  onChange: (next: FootballPlayerSortValue) => void;
}

// Clicking a sort field cycles it through asc → desc → off (default order),
// so users can reach every state — including clearing the sort — from one pill.
export function nextValue(
  current: FootballPlayerSortValue,
  field: FootballPlayerSortField,
): FootballPlayerSortValue {
  if (current.field !== field) {
    return { field, dir: 'asc' };
  }
  if (current.dir === 'asc') {
    return { field, dir: 'desc' };
  }
  return { field: undefined, dir: 'asc' };
}

export function FootballPlayerSort({ value, onChange }: Props) {
  return (
    <XStack
      alignItems="center"
      gap={8}
      flexWrap="wrap"
      role="group"
      aria-label="Sort players"
    >
      <Text fontSize={13} color={TEXT_MUTED} fontFamily={FONT_BODY}>
        Sort:
      </Text>
      {SORT_OPTIONS.map(({ field, label }) => {
        const isActive = value.field === field;
        const activate = () => onChange(nextValue(value, field));
        return (
          <XStack
            key={field}
            alignItems="center"
            gap={4}
            paddingHorizontal={14}
            paddingVertical={7}
            borderRadius={20}
            borderWidth={1}
            cursor="pointer"
            userSelect="none"
            backgroundColor={
              isActive ? withAlpha(BRAND_NAVY, 0.15) : SURFACE_CARD
            }
            borderColor={isActive ? BRAND_NAVY : OUTLINE_SUBTLE}
            hoverStyle={{ borderColor: BRAND_NAVY_LIGHT }}
            focusStyle={{ borderColor: BRAND_NAVY_LIGHT }}
            pressStyle={{ opacity: 0.8 }}
            onPress={activate}
            // Keyboard accessibility: the pill is a focusable toggle button.
            // Enter/Space activate it (cycling asc → desc → off), matching the
            // pointer onPress. aria-pressed exposes the active state and the
            // label announces the current direction for screen-reader users.
            role="button"
            tabIndex={0}
            aria-pressed={isActive}
            onKeyDown={(e: React.KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
                e.preventDefault();
                activate();
              }
            }}
            aria-label={
              isActive
                ? `Sort by ${label}, ${
                    value.dir === 'asc' ? 'ascending' : 'descending'
                  }`
                : `Sort by ${label}`
            }
          >
            <Text
              fontSize={13}
              fontWeight="600"
              letterSpacing={0.3}
              fontFamily={FONT_BODY}
              color={isActive ? TEXT_PRIMARY : TEXT_MUTED}
            >
              {label}
            </Text>
            {isActive &&
              (value.dir === 'asc' ? (
                <ArrowUp size={14} color={TEXT_PRIMARY} />
              ) : (
                <ArrowDown size={14} color={TEXT_PRIMARY} />
              ))}
          </XStack>
        );
      })}
    </XStack>
  );
}
