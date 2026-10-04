import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, XStack, YStack } from 'tamagui';
import { X } from '@tamagui/lucide-icons';
import { BrowseFilterSheet } from './BrowseFilterSheet';
import { BrowsePublicTab } from './BrowsePublicTab';
import { InviteCodeTab } from './InviteCodeTab';
import { LeagueJoinSheet } from './LeagueJoinSheet';
import { keyboardPressProps } from './pressable';
import { useInviteCodeValidation } from './useInviteCodeValidation';
import {
  type BrowseFilters,
  type BrowseQuery,
  type BrowseSort,
  defaultBrowseFilters,
  type InviteCodeLeague,
  type JoinLeagueTab,
  type PublicLeagueRow,
  type Sport,
  toBrowseQuery,
} from './joinLeagueTypes';
import {
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  PANEL_BORDER,
  TEXT_MUTED,
  TEXT_PRIMARY,
  TEXT_TERTIARY,
} from '../../../utils/colors';

/** Debounce before a search term is pushed to the server (AC9). */
const SEARCH_DEBOUNCE_MS = 300;
/** Minimum tap target (AC15). */
const TAP_TARGET = 44;

const TAB_LABELS: Record<JoinLeagueTab, string> = {
  invite: 'INVITE CODE',
  browse: 'BROWSE PUBLIC',
};

function TabBar({
  activeTab,
  onChange,
}: {
  activeTab: JoinLeagueTab;
  onChange: (tab: JoinLeagueTab) => void;
}) {
  return (
    <XStack borderBottomWidth={1} borderBottomColor={PANEL_BORDER}>
      {(['invite', 'browse'] as const).map((tab) => {
        const active = tab === activeTab;
        return (
          <XStack
            key={tab}
            testID={`join-tab-${tab}`}
            flex={1}
            minHeight={TAP_TARGET}
            alignItems="center"
            justifyContent="center"
            // The 2px active underline sits on top of the 1px bar rule.
            borderBottomWidth={active ? 2 : 0}
            borderBottomColor={active ? BRAND_GOLD : 'transparent'}
            marginBottom={active ? -1 : 0}
            cursor="pointer"
            pressStyle={{ opacity: 0.8 }}
            onPress={() => onChange(tab)}
            {...keyboardPressProps(() => onChange(tab))}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={TAB_LABELS[tab]}
          >
            <Text
              fontFamily="$heading"
              fontWeight={active ? '800' : '700'}
              fontSize={13}
              letterSpacing={1.3}
              color={active ? BRAND_GOLD_LIGHT : TEXT_TERTIARY}
            >
              {TAB_LABELS[tab]}
            </Text>
          </XStack>
        );
      })}
    </XStack>
  );
}

export interface JoinLeagueScreenProps {
  /** Sport derived from the entry route — there is no in-form selector (AC2). */
  sport: Sport;
  /** Top safe-area inset, applied as padding so content clears the status bar. */
  topInset?: number;
  /** Invite code carried in by a deep link, pre-filled on the invite tab (AC3). */
  initialInviteCode?: string;
  initialTab?: JoinLeagueTab;
  onTabChange?: (tab: JoinLeagueTab) => void;
  onClose: () => void;

  /* Invite Code tab */
  validateInviteCode: (code: string) => Promise<InviteCodeLeague | null>;
  onJoinByCode: (code: string, teamName: string) => void;
  joiningByCode?: boolean;
  inviteError?: string | null;
  onGoToLeague: (leagueId: number) => void;

  /* Browse Public tab */
  onBrowseQueryChange: (query: BrowseQuery) => void;
  browseLeagues?: PublicLeagueRow[];
  browseTotalCount?: number | null;
  browseLoading?: boolean;
  onJoinPublic: (league: PublicLeagueRow, teamName: string) => void;
  joiningPublic?: boolean;
  browseJoinError?: string | null;
}

/**
 * The two-tab "Invite or Browse" Join League screen (LS-8812).
 *
 * Owns tab, form and filter state; data fetching stays in the app wrapper,
 * which supplies `validateInviteCode` / `onBrowseQueryChange` and feeds results
 * back as props. Both tabs stay mounted and are toggled with `display` so the
 * entered code, team name, search text, filters and scroll position all survive
 * switching between them (AC1).
 */
export function JoinLeagueScreen({
  sport,
  topInset = 0,
  initialInviteCode,
  initialTab = 'invite',
  onTabChange,
  onClose,
  validateInviteCode,
  onJoinByCode,
  joiningByCode = false,
  inviteError,
  onGoToLeague,
  onBrowseQueryChange,
  browseLeagues = [],
  browseTotalCount,
  browseLoading = false,
  onJoinPublic,
  joiningPublic = false,
  browseJoinError,
}: JoinLeagueScreenProps) {
  const [activeTab, setActiveTab] = useState<JoinLeagueTab>(initialTab);

  /* Invite tab state */
  const [inviteCode, setInviteCode] = useState(
    initialInviteCode?.toUpperCase() ?? '',
  );
  const [teamName, setTeamName] = useState('');

  // A deep link can resolve after first paint; adopt the code when it arrives.
  useEffect(() => {
    if (initialInviteCode) setInviteCode(initialInviteCode.toUpperCase());
  }, [initialInviteCode]);

  const validation = useInviteCodeValidation(inviteCode, validateInviteCode);

  /* Browse tab state */
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filters, setFilters] = useState<BrowseFilters>(() =>
    defaultBrowseFilters(sport),
  );
  const [sortBy, setSortBy] = useState<BrowseSort>('spotsLeft');
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [selectedLeague, setSelectedLeague] = useState<PublicLeagueRow | null>(
    null,
  );

  useEffect(() => {
    const timer = setTimeout(
      () => setDebouncedSearch(search),
      SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [search]);

  const browseQuery = useMemo(
    () => toBrowseQuery(filters, debouncedSearch, sortBy),
    [filters, debouncedSearch, sortBy],
  );

  useEffect(() => {
    onBrowseQueryChange(browseQuery);
  }, [browseQuery, onBrowseQueryChange]);

  const selectTab = (tab: JoinLeagueTab) => {
    setActiveTab(tab);
    onTabChange?.(tab);
  };

  return (
    <YStack flex={1} backgroundColor="$background" paddingTop={topInset}>
      <XStack
        alignItems="center"
        gap={12}
        paddingVertical={16}
        paddingHorizontal={20}
      >
        <XStack
          testID="join-close"
          minHeight={TAP_TARGET}
          minWidth={TAP_TARGET}
          alignItems="center"
          justifyContent="flex-start"
          cursor="pointer"
          pressStyle={{ opacity: 0.8 }}
          onPress={onClose}
          {...keyboardPressProps(onClose)}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <X size={20} color={TEXT_MUTED} />
        </XStack>
        <Text
          fontFamily="$heading"
          fontWeight="800"
          fontSize={17}
          color={TEXT_PRIMARY}
        >
          Join a League
        </Text>
      </XStack>

      <TabBar activeTab={activeTab} onChange={selectTab} />

      {/* Both tabs stay mounted so their state and scroll offsets persist. */}
      <YStack flex={1}>
        <ScrollView
          flex={1}
          display={activeTab === 'invite' ? 'flex' : 'none'}
          contentContainerStyle={{
            paddingVertical: 20,
            paddingHorizontal: 20,
          }}
        >
          <InviteCodeTab
            inviteCode={inviteCode}
            onInviteCodeChange={setInviteCode}
            teamName={teamName}
            onTeamNameChange={setTeamName}
            validation={validation}
            joining={joiningByCode}
            error={inviteError}
            onSubmit={() =>
              onJoinByCode(inviteCode.trim().toUpperCase(), teamName.trim())
            }
            onGoToLeague={onGoToLeague}
          />
        </ScrollView>

        <ScrollView
          flex={1}
          display={activeTab === 'browse' ? 'flex' : 'none'}
          contentContainerStyle={{
            paddingVertical: 20,
            paddingHorizontal: 16,
          }}
        >
          <BrowsePublicTab
            entrySport={sport}
            search={search}
            onSearchChange={setSearch}
            filters={filters}
            onFiltersChange={setFilters}
            sortBy={sortBy}
            onSortChange={setSortBy}
            leagues={browseLeagues}
            totalCount={browseTotalCount}
            loading={browseLoading}
            onOpenFilters={() => setFilterSheetOpen(true)}
            onSelectLeague={setSelectedLeague}
          />
        </ScrollView>
      </YStack>

      <BrowseFilterSheet
        open={filterSheetOpen}
        onOpenChange={setFilterSheetOpen}
        entrySport={sport}
        filters={filters}
        onApply={setFilters}
      />

      <LeagueJoinSheet
        league={selectedLeague}
        onOpenChange={(open) => {
          if (!open) setSelectedLeague(null);
        }}
        joining={joiningPublic}
        error={browseJoinError}
        onJoin={onJoinPublic}
      />
    </YStack>
  );
}
