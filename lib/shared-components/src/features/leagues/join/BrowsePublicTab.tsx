import React, { useState } from 'react';
import { Input, ScrollView, Text, XStack, YStack } from 'tamagui';
// The handoff names `SlidersHorizontal`, which the installed
// @tamagui/lucide-icons barrel does not re-export; `Filter` is the closest
// available glyph and needs no new asset.
import { Filter, Search, X } from '@tamagui/lucide-icons';
import { formatLeagueMetaLine, formatSpotsFraction } from './joinLeagueFormat';
import { keyboardPressProps } from './pressable';
import { onTextChange } from './textInputEvent';
import {
  activeFilterCount,
  BROWSE_SORT_LABELS,
  type BrowseFilters,
  type BrowseSort,
  defaultBrowseFilters,
  type PublicLeagueRow,
  ROSTER_SIZE_RANGES,
  type Sport,
} from './joinLeagueTypes';
import {
  BG_DARK,
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  FIELD_GREEN,
  PANEL_BORDER,
  SURFACE_CARD,
  SURFACE_PANEL,
  TEXT_MUTED,
  TEXT_PRIMARY,
  TEXT_TERTIARY,
  withAlpha,
} from '../../../utils/colors';
import { ERA_LABELS } from '../../home/homeSummaryFormatters';
import { Chip } from '../../../components/Chip';

/** Minimum tap target (AC15). */
const TAP_TARGET = 44;
const SORT_ORDER: readonly BrowseSort[] = [
  'spotsLeft',
  'draftDate',
  'createdAt',
];

/* ─── Ledger row ─── */

function JoinModeBadge({ isFull }: { isFull: boolean }) {
  // REQ / commissioner-approval is out of v1 — there is no `joinMode` field to
  // drive it, so every joinable public league reads as OPEN (LS-8812).
  return (
    <Text
      testID={`browse-badge-${isFull ? 'full' : 'open'}`}
      fontFamily="$heading"
      fontWeight="700"
      fontSize={10}
      letterSpacing={1}
      borderRadius={4}
      paddingVertical={4}
      paddingHorizontal={7}
      backgroundColor={isFull ? PANEL_BORDER : BG_DARK}
      color={isFull ? TEXT_MUTED : FIELD_GREEN}
    >
      {isFull ? 'FULL' : 'OPEN'}
    </Text>
  );
}

function LedgerRow({
  league,
  isLast,
  onPress,
}: {
  league: PublicLeagueRow;
  isLast: boolean;
  onPress: () => void;
}) {
  const isFull = Boolean(league.isFull);
  const name = league.name ?? 'Unnamed League';
  const meta = formatLeagueMetaLine(league);

  return (
    <XStack
      testID={`browse-row-${league.id}`}
      alignItems="center"
      gap={12}
      minHeight={TAP_TARGET}
      paddingVertical={13}
      paddingHorizontal={16}
      backgroundColor={SURFACE_PANEL}
      borderBottomWidth={isLast ? 0 : 1}
      borderBottomColor={PANEL_BORDER}
      // Full leagues are inert — dimmed and not tappable (AC7).
      opacity={isFull ? 0.55 : 1}
      cursor={isFull ? 'default' : 'pointer'}
      pressStyle={isFull ? undefined : { opacity: 0.8 }}
      onPress={isFull ? undefined : onPress}
      {...keyboardPressProps(onPress, isFull)}
      accessibilityRole="button"
      accessibilityState={{ disabled: isFull }}
      accessibilityLabel={
        isFull ? `${name} — league full` : `Open ${name} to join`
      }
    >
      <YStack flex={1} minWidth={0} gap={2}>
        <Text
          fontFamily="$heading"
          fontWeight="800"
          fontSize={14}
          color={TEXT_PRIMARY}
          numberOfLines={1}
        >
          {name}
        </Text>
        {meta ? (
          <Text fontSize={11.5} color={TEXT_MUTED} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
      </YStack>

      <YStack alignItems="flex-end" gap={1}>
        <Text
          fontFamily="$heading"
          fontWeight="800"
          fontSize={16}
          color={BRAND_GOLD_LIGHT}
          fontVariant={['tabular-nums']}
        >
          {formatSpotsFraction(league)}
        </Text>
        <Text
          fontFamily="$heading"
          fontWeight="700"
          fontSize={9}
          letterSpacing={1}
          color={TEXT_TERTIARY}
        >
          SPOTS
        </Text>
      </YStack>

      <JoinModeBadge isFull={isFull} />
    </XStack>
  );
}

function SkeletonRow({ index, isLast }: { index: number; isLast: boolean }) {
  return (
    <XStack
      testID={`browse-skeleton-row-${index}`}
      alignItems="center"
      gap={12}
      minHeight={TAP_TARGET}
      paddingVertical={13}
      paddingHorizontal={16}
      backgroundColor={SURFACE_PANEL}
      borderBottomWidth={isLast ? 0 : 1}
      borderBottomColor={PANEL_BORDER}
    >
      <YStack flex={1} gap={6}>
        <YStack
          height={12}
          width="55%"
          borderRadius={3}
          backgroundColor={PANEL_BORDER}
        />
        <YStack
          height={9}
          width="75%"
          borderRadius={3}
          backgroundColor={PANEL_BORDER}
        />
      </YStack>
      <YStack
        height={20}
        width={38}
        borderRadius={3}
        backgroundColor={PANEL_BORDER}
      />
    </XStack>
  );
}

/* ─── Applied filter chips ─── */

interface AppliedChip {
  id: string;
  label: string;
  clear: (filters: BrowseFilters) => BrowseFilters;
}

function appliedChipsFor(
  filters: BrowseFilters,
  entrySport: Sport,
): AppliedChip[] {
  const chips: AppliedChip[] = [];

  if (filters.sport !== entrySport) {
    chips.push({
      id: 'sport',
      label: filters.sport === 'any' ? 'Any sport' : `Sport: ${filters.sport}`,
      clear: (f) => ({ ...f, sport: entrySport }),
    });
  }
  if (filters.hasOpenSpots) {
    chips.push({
      id: 'openSpots',
      label: 'Spots open',
      clear: (f) => ({ ...f, hasOpenSpots: false }),
    });
  }
  if (filters.eraFilter) {
    const label = ERA_LABELS[filters.eraFilter];
    const idx = label?.lastIndexOf('·') ?? -1;
    chips.push({
      id: 'era',
      label:
        idx >= 0 ? label.slice(0, idx).trim() : (label ?? filters.eraFilter),
      clear: (f) => ({ ...f, eraFilter: null }),
    });
  }
  if (filters.rosterSizeId) {
    const range = ROSTER_SIZE_RANGES.find((r) => r.id === filters.rosterSizeId);
    chips.push({
      id: 'roster',
      label: `Roster ${range?.label ?? filters.rosterSizeId}`,
      clear: (f) => ({ ...f, rosterSizeId: null }),
    });
  }

  return chips;
}

/* ─── Tab ─── */

export interface BrowsePublicTabProps {
  entrySport: Sport;
  search: string;
  onSearchChange: (search: string) => void;
  filters: BrowseFilters;
  onFiltersChange: (filters: BrowseFilters) => void;
  sortBy: BrowseSort;
  onSortChange: (sort: BrowseSort) => void;
  leagues: PublicLeagueRow[];
  /** Server-side total across all pages; falls back to the page length. */
  totalCount?: number | null;
  loading: boolean;
  onOpenFilters: () => void;
  onSelectLeague: (league: PublicLeagueRow) => void;
}

export function BrowsePublicTab({
  entrySport,
  search,
  onSearchChange,
  filters,
  onFiltersChange,
  sortBy,
  onSortChange,
  leagues,
  totalCount,
  loading,
  onOpenFilters,
  onSelectLeague,
}: BrowsePublicTabProps) {
  const [searchFocused, setSearchFocused] = useState(false);

  const filterCount = activeFilterCount(filters, entrySport);
  const chips = appliedChipsFor(filters, entrySport);
  const total = totalCount ?? leagues.length;

  const cycleSort = () => {
    const idx = SORT_ORDER.indexOf(sortBy);
    onSortChange(SORT_ORDER[(idx + 1) % SORT_ORDER.length]);
  };

  const clearFilters = () => {
    onSearchChange('');
    onFiltersChange(defaultBrowseFilters(entrySport));
  };

  return (
    <YStack gap={14} testID="join-browse-tab">
      <XStack gap={8}>
        <XStack flex={1} alignItems="center" position="relative">
          <YStack position="absolute" left={12} zIndex={1} pointerEvents="none">
            <Search size={16} color={TEXT_TERTIARY} />
          </YStack>
          <Input
            testID="browse-search-input"
            flex={1}
            placeholder="Search leagues…"
            value={search}
            onChange={onTextChange(onSearchChange)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            backgroundColor={SURFACE_PANEL}
            borderWidth={1}
            borderColor={searchFocused ? BRAND_GOLD : PANEL_BORDER}
            borderRadius={10}
            paddingVertical={12}
            paddingLeft={34}
            paddingRight={14}
            minHeight={TAP_TARGET}
            color={TEXT_PRIMARY}
            placeholderTextColor={TEXT_TERTIARY}
            accessibilityLabel="Search public leagues"
          />
        </XStack>

        <XStack
          testID="browse-filter-button"
          alignItems="center"
          justifyContent="center"
          gap={6}
          minHeight={TAP_TARGET}
          minWidth={TAP_TARGET}
          paddingHorizontal={14}
          backgroundColor={SURFACE_PANEL}
          borderWidth={1}
          borderColor={filterCount > 0 ? BRAND_GOLD : PANEL_BORDER}
          borderRadius={10}
          cursor="pointer"
          pressStyle={{ opacity: 0.8 }}
          onPress={onOpenFilters}
          {...keyboardPressProps(onOpenFilters)}
          accessibilityRole="button"
          accessibilityLabel={
            filterCount > 0 ? `Filters, ${filterCount} active` : 'Filters'
          }
        >
          <Filter
            size={16}
            color={filterCount > 0 ? BRAND_GOLD_LIGHT : TEXT_TERTIARY}
          />
          {filterCount > 0 ? (
            <Text
              testID="browse-filter-count"
              fontFamily="$heading"
              fontWeight="800"
              fontSize={13}
              color={BRAND_GOLD_LIGHT}
              fontVariant={['tabular-nums']}
            >
              {filterCount}
            </Text>
          ) : null}
        </XStack>
      </XStack>

      {chips.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          testID="browse-applied-filters"
        >
          <XStack gap={6}>
            {chips.map((chip) => (
              <Chip
                key={chip.id}
                label={chip.label}
                tone="neutral"
                testID={`browse-applied-${chip.id}`}
                labelTestID={`browse-applied-${chip.id}-label`}
                trailing={<X size={11} color={TEXT_TERTIARY} />}
                onPress={() => onFiltersChange(chip.clear(filters))}
                {...keyboardPressProps(() =>
                  onFiltersChange(chip.clear(filters)),
                )}
                accessibilityRole="button"
                accessibilityLabel={`Remove filter ${chip.label}`}
                minHeight={TAP_TARGET}
                backgroundColor={SURFACE_CARD}
                borderColor={withAlpha(BRAND_GOLD, 0.4)}
                selected
                pressStyle={{ opacity: 0.8 }}
              />
            ))}
          </XStack>
        </ScrollView>
      ) : null}

      <XStack alignItems="center" justifyContent="space-between" gap={12}>
        <Text
          testID="browse-results-count"
          fontFamily="$heading"
          fontWeight="700"
          fontSize={11}
          letterSpacing={1.6}
          color={BRAND_GOLD_LIGHT}
          fontVariant={['tabular-nums']}
        >
          {total} {total === 1 ? 'LEAGUE' : 'LEAGUES'}
        </Text>
        <XStack
          testID="browse-sort-control"
          alignItems="center"
          minHeight={TAP_TARGET}
          paddingHorizontal={4}
          cursor="pointer"
          pressStyle={{ opacity: 0.8 }}
          onPress={cycleSort}
          {...keyboardPressProps(cycleSort)}
          accessibilityRole="button"
          accessibilityLabel={`Sort by ${BROWSE_SORT_LABELS[sortBy]}. Tap to change.`}
        >
          <Text fontSize={11} fontWeight="700" color={TEXT_TERTIARY}>
            {BROWSE_SORT_LABELS[sortBy]} ▾
          </Text>
        </XStack>
      </XStack>

      <YStack
        borderWidth={1}
        borderColor={PANEL_BORDER}
        borderRadius={14}
        overflow="hidden"
        testID="browse-ledger"
      >
        {loading && leagues.length === 0 ? (
          <>
            <SkeletonRow index={0} isLast={false} />
            <SkeletonRow index={1} isLast={false} />
            <SkeletonRow index={2} isLast />
          </>
        ) : leagues.length === 0 ? (
          <YStack
            testID="browse-empty-state"
            alignItems="center"
            gap={10}
            paddingVertical={40}
            paddingHorizontal={20}
            backgroundColor={SURFACE_PANEL}
          >
            <Text fontSize={14} color={TEXT_MUTED} textAlign="center">
              No public leagues match
            </Text>
            <XStack
              testID="browse-clear-filters"
              minHeight={TAP_TARGET}
              alignItems="center"
              paddingHorizontal={12}
              cursor="pointer"
              pressStyle={{ opacity: 0.8 }}
              onPress={clearFilters}
              {...keyboardPressProps(clearFilters)}
              accessibilityRole="button"
              accessibilityLabel="Clear filters"
            >
              <Text
                fontFamily="$heading"
                fontWeight="800"
                fontSize={12}
                letterSpacing={1.3}
                color={BRAND_GOLD_LIGHT}
              >
                CLEAR FILTERS
              </Text>
            </XStack>
          </YStack>
        ) : (
          leagues.map((league, index) => (
            <LedgerRow
              key={league.id ?? `league-${index}`}
              league={league}
              isLast={index === leagues.length - 1}
              onPress={() => onSelectLeague(league)}
            />
          ))
        )}
      </YStack>

      {leagues.length > 0 ? (
        <Text fontSize={11} color={TEXT_TERTIARY} textAlign="center">
          Tap a row for details &amp; join
        </Text>
      ) : null}
    </YStack>
  );
}
