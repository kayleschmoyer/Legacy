import React, { useEffect, useState } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import {
  type BrowseFilters,
  defaultBrowseFilters,
  ROSTER_SIZE_RANGES,
  type Sport,
} from './joinLeagueTypes';
import { keyboardPressProps } from './pressable';
import { Chip } from '../../../components/Chip';
import { Sheet } from '../../../components/Sheet';
import { ERA_FILTERS_BY_SPORT } from '../../../config/sports';
import { ERA_LABELS } from '../../home/homeSummaryFormatters';
import {
  BG_DARK,
  BRAND_GOLD,
  OUTLINE_STRONG,
  PANEL_BORDER,
  SURFACE_CARD,
  TEXT_PRIMARY,
  TEXT_TERTIARY,
  withAlpha,
} from '../../../utils/colors';

/** Minimum tap target (AC15). */
const TAP_TARGET = 44;

/**
 * Eras offered by the sheet, scoped to the sport being browsed.
 *
 * Sourced from the canonical `ERA_FILTERS_BY_SPORT` config so the sheet cannot
 * drift from the create-league wizard's options. `all` and `custom` are dropped:
 * "all" is the absence of a filter, and a custom range has no single enum value
 * to filter on.
 */
function erasFor(sport: BrowseFilters['sport']): readonly string[] {
  const key = sport === 'football' ? 'football' : 'baseball';
  return ERA_FILTERS_BY_SPORT[key]
    .map((era) => era.value)
    .filter((value) => value !== 'all' && value !== 'custom');
}

/** Era name without the year-range suffix — the chips have no room for it. */
function eraChipLabel(era: string): string {
  const label = ERA_LABELS[era];
  if (!label) return era;
  const idx = label.lastIndexOf('·');
  return idx >= 0 ? label.slice(0, idx).trim() : label;
}

function GroupLabel({ children }: { children: string }) {
  return (
    <Text
      fontFamily="$heading"
      fontWeight="700"
      fontSize={11}
      letterSpacing={1.5}
      color={TEXT_TERTIARY}
    >
      {children}
    </Text>
  );
}

function OptionChip({
  label,
  selected,
  onPress,
  testID,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Chip
      label={label}
      tone="neutral"
      selected={selected}
      onPress={onPress}
      {...keyboardPressProps(onPress)}
      testID={testID}
      labelTestID={`${testID}-label`}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      minHeight={TAP_TARGET}
      paddingVertical={10}
      backgroundColor={selected ? withAlpha(BRAND_GOLD, 0.16) : SURFACE_CARD}
      borderColor={selected ? BRAND_GOLD : PANEL_BORDER}
      pressStyle={{ opacity: 0.8 }}
    />
  );
}

export interface BrowseFilterSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The sport the screen was entered on — the "clear all" baseline (AC8). */
  entrySport: Sport;
  filters: BrowseFilters;
  onApply: (filters: BrowseFilters) => void;
}

/**
 * Filter bottom sheet for the Browse Public tab (LS-8812, AC9).
 *
 * Edits a local draft so dismissing the sheet discards changes; only Apply
 * lifts them. Every group here maps to a `publicLeagues` argument that exists
 * server-side — sport, spots-open, era, and roster-size range.
 */
export function BrowseFilterSheet({
  open,
  onOpenChange,
  entrySport,
  filters,
  onApply,
}: BrowseFilterSheetProps) {
  const [draft, setDraft] = useState<BrowseFilters>(filters);

  // Re-seed the draft each time the sheet opens so it always reflects the
  // filters currently in force rather than a stale edit.
  useEffect(() => {
    if (open) setDraft(filters);
  }, [open, filters]);

  const eras = erasFor(draft.sport);

  const applyDraft = () => {
    onApply(draft);
    onOpenChange(false);
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Filters"
      snapPoints={[70, 92]}
    >
      <YStack gap={18} testID="browse-filter-sheet">
        <YStack gap={8}>
          <GroupLabel>SPORT</GroupLabel>
          <XStack gap={8} flexWrap="wrap">
            <OptionChip
              label="Baseball"
              selected={draft.sport === 'baseball'}
              onPress={() => setDraft({ ...draft, sport: 'baseball' })}
              testID="browse-filter-sport-baseball"
            />
            <OptionChip
              label="Football"
              selected={draft.sport === 'football'}
              onPress={() => setDraft({ ...draft, sport: 'football' })}
              testID="browse-filter-sport-football"
            />
            <OptionChip
              label="Any"
              selected={draft.sport === 'any'}
              onPress={() => setDraft({ ...draft, sport: 'any' })}
              testID="browse-filter-sport-any"
            />
          </XStack>
        </YStack>

        <YStack gap={8}>
          <GroupLabel>AVAILABILITY</GroupLabel>
          <XStack gap={8}>
            <OptionChip
              label="Spots open"
              selected={draft.hasOpenSpots}
              onPress={() =>
                setDraft({ ...draft, hasOpenSpots: !draft.hasOpenSpots })
              }
              testID="browse-filter-open-spots"
            />
          </XStack>
        </YStack>

        <YStack gap={8}>
          <GroupLabel>ERA</GroupLabel>
          <XStack gap={8} flexWrap="wrap">
            {eras.map((era) => (
              <OptionChip
                key={era}
                label={eraChipLabel(era)}
                selected={draft.eraFilter === era}
                onPress={() =>
                  setDraft({
                    ...draft,
                    eraFilter: draft.eraFilter === era ? null : era,
                  })
                }
                testID={`browse-filter-era-${era}`}
              />
            ))}
          </XStack>
        </YStack>

        <YStack gap={8}>
          <GroupLabel>ROSTER SIZE</GroupLabel>
          <XStack gap={8} flexWrap="wrap">
            {ROSTER_SIZE_RANGES.map((range) => (
              <OptionChip
                key={range.id}
                label={range.label}
                selected={draft.rosterSizeId === range.id}
                onPress={() =>
                  setDraft({
                    ...draft,
                    rosterSizeId:
                      draft.rosterSizeId === range.id ? null : range.id,
                  })
                }
                testID={`browse-filter-roster-${range.id}`}
              />
            ))}
          </XStack>
        </YStack>

        <XStack gap={8} marginTop={4}>
          <XStack
            testID="browse-filter-clear"
            flex={1}
            minHeight={TAP_TARGET}
            alignItems="center"
            justifyContent="center"
            borderWidth={1}
            borderColor={OUTLINE_STRONG}
            borderRadius={10}
            cursor="pointer"
            pressStyle={{ opacity: 0.8 }}
            onPress={() => setDraft(defaultBrowseFilters(entrySport))}
            {...keyboardPressProps(() =>
              setDraft(defaultBrowseFilters(entrySport)),
            )}
            accessibilityRole="button"
            accessibilityLabel="Clear all filters"
          >
            <Text
              fontFamily="$heading"
              fontWeight="800"
              fontSize={13}
              letterSpacing={1.3}
              color={TEXT_PRIMARY}
            >
              CLEAR ALL
            </Text>
          </XStack>
          <XStack
            testID="browse-filter-apply"
            flex={1}
            minHeight={TAP_TARGET}
            alignItems="center"
            justifyContent="center"
            backgroundColor={BRAND_GOLD}
            borderRadius={10}
            cursor="pointer"
            pressStyle={{ opacity: 0.8 }}
            onPress={applyDraft}
            {...keyboardPressProps(applyDraft)}
            accessibilityRole="button"
            accessibilityLabel="Apply filters"
          >
            {/* Ink on gold is theme-invariant. */}
            <Text
              fontFamily="$heading"
              fontWeight="800"
              fontSize={13}
              letterSpacing={1.3}
              color={BG_DARK}
            >
              APPLY
            </Text>
          </XStack>
        </XStack>
      </YStack>
    </Sheet>
  );
}
