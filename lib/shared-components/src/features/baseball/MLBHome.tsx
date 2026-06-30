import React from 'react';
import {
  Button,
  H1,
  H2,
  H3,
  Input,
  Paragraph,
  ScrollView,
  Separator,
  Spinner,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import {
  CreateLeagueDialog,
  type QuickCreateLeagueInput,
} from './CreateLeagueDialog';
import {
  AMBER_LIGHT,
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  BRAND_NAVY,
  BRAND_NAVY_LIGHT,
  BRAND_SEAM_RED,
  GREEN,
  INJURY_OUT,
  SLATE_400,
  withAlpha,
  YELLOW,
} from '../../utils/colors';

export interface MLBHomeLeague {
  id: number | string;
  name?: string | null;
  draftStatus?: string | null;
  currentWeekNumber?: number | null;
  weekAdvanceStatus?: string | null;
  maxRosterSize?: number | null;
  tierFrozenAt?: string | null;
  frozenAt?: string | null;
  /** The current user's permission level in this league (e.g. 'commissioner', 'general_manager'). */
  permissionLevel?: string | null;
}

/**
 * Free-tier league-cap context. Supplied only by platforms that gate league
 * creation (mobile, LS-5182); when omitted the cap UI is hidden and the create
 * action is always enabled.
 */
export interface MLBHomeLeagueCap {
  count: number;
  limit: number;
  atLimit: boolean;
  onUpgrade: () => void;
}

export interface MLBHomeProps {
  leagues?: MLBHomeLeague[];
  /** Show the full-screen loading spinner (initial league fetch). */
  loading?: boolean;
  /** The leagues query failed — show the error notice, not the empty state. */
  error?: boolean;
  /** Display name shown in the hero ("Welcome back, …"). */
  userName?: string;
  /** When false, render the sign-in notice. Defaults to true. */
  isAuthenticated?: boolean;
  /**
   * Create a league from the quick-create dialog. Resolving closes the dialog;
   * rejecting surfaces the error inline. This is the only data-bound callback —
   * the component itself performs no fetching (LS-7716, AC1).
   */
  onCreateLeague: (input: QuickCreateLeagueInput) => Promise<void>;
  onJoinLeague: () => void;
  onMockDraft?: () => void;
  /** When provided, renders a "Live Scores" action linking to the scoreboard. */
  onScoreboard?: () => void;
  onViewLeague: (leagueId: number | string) => void;
  /** Retry the leagues query from the error notice. */
  onRetry?: () => void;
  /** Navigate to sign-in from the unauthenticated notice. */
  onSignIn?: () => void;
  /** When provided, renders an "Invite Friends" action (mobile, LS-5203). */
  onInviteFriends?: () => void;
  /** When provided, the dialog shows an "Advanced settings" link. */
  onAdvancedCreate?: (leagueName: string) => void;
  /** When provided, renders a "Browse Players" action linking to the players directory (LS-5812). */
  onBrowsePlayers?: () => void;
  /** Free-tier league-cap context (mobile, LS-5182). */
  leagueCap?: MLBHomeLeagueCap;
  /** When true, renders an "Unlimited leagues" badge instead of the free-tier cap indicator (LS-5870). */
  isPremium?: boolean;
}

interface LeagueBadge {
  label: string;
  bg: string;
  border: string;
  text: string;
}

function getLeagueBadge(
  draftStatus?: string | null,
  weekNumber?: number | null,
  tierFrozenAt?: string | null,
  frozenAt?: string | null,
): LeagueBadge {
  if (tierFrozenAt || frozenAt) {
    return {
      label: 'Archived',
      bg: withAlpha(SLATE_400, 0.12),
      border: withAlpha(SLATE_400, 0.3),
      text: '$gray11',
    };
  }
  switch (draftStatus) {
    case 'in-progress':
      return {
        label: 'Drafting',
        bg: withAlpha(BRAND_NAVY, 0.18),
        border: withAlpha(BRAND_NAVY, 0.45),
        text: BRAND_GOLD_LIGHT,
      };
    case 'completed':
      return {
        label: weekNumber ? `Week ${weekNumber}` : 'In Season',
        bg: withAlpha(GREEN, 0.14),
        border: withAlpha(GREEN, 0.36),
        text: '$green11',
      };
    case 'queued':
    case 'not-started':
      return {
        label: 'Draft Scheduled',
        bg: withAlpha(AMBER_LIGHT, 0.12),
        border: withAlpha(AMBER_LIGHT, 0.3),
        text: '$orange11',
      };
    default:
      return {
        label: draftStatus
          ? draftStatus
              .replace('-', ' ')
              .replace(/\b\w/g, (l) => l.toUpperCase())
          : 'Unknown',
        bg: withAlpha(SLATE_400, 0.12),
        border: withAlpha(SLATE_400, 0.3),
        text: '$gray11',
      };
  }
}

const LEAGUES_PAGE_SIZE = 20;

type RoleFilter = 'all' | 'commissioner' | 'general_manager' | 'member';

interface RoleChip {
  label: string;
  bg: string;
  border: string;
  text: string;
}

function getRoleChip(permissionLevel?: string | null): RoleChip | null {
  switch (permissionLevel) {
    case 'commissioner':
      return {
        label: 'Commish',
        bg: withAlpha(BRAND_NAVY, 0.22),
        border: withAlpha(BRAND_NAVY, 0.55),
        text: BRAND_GOLD_LIGHT,
      };
    case 'general_manager':
      return {
        label: 'GM',
        bg: withAlpha(BRAND_GOLD, 0.16),
        border: withAlpha(BRAND_GOLD, 0.4),
        text: BRAND_GOLD,
      };
    case 'assistant_manager':
      return {
        label: 'Asst GM',
        bg: withAlpha(SLATE_400, 0.14),
        border: withAlpha(SLATE_400, 0.35),
        text: '$gray11',
      };
    default:
      if (!permissionLevel) return null;
      return {
        label: 'Member',
        bg: withAlpha(SLATE_400, 0.1),
        border: withAlpha(SLATE_400, 0.28),
        text: '$gray10',
      };
  }
}

function matchesRoleFilter(
  permissionLevel: string | null | undefined,
  filter: RoleFilter,
): boolean {
  if (filter === 'all') return true;
  if (filter === 'commissioner') return permissionLevel === 'commissioner';
  if (filter === 'general_manager')
    return permissionLevel === 'general_manager';
  // 'member' bucket: everything that isn't commissioner/GM (including assistant_manager, null)
  return (
    permissionLevel !== 'commissioner' && permissionLevel !== 'general_manager'
  );
}
/**
 * Shared, presentational baseball home (LS-7716). Mirrors the `NFLHome` pattern:
 * leagues array + callbacks, no data fetching. Consumed by the web
 * `BaseballScreen` wrapper and the mobile `baseball/index` wrapper.
 */
export function MLBHome({
  leagues = [],
  loading = false,
  error = false,
  userName = 'Manager',
  isAuthenticated = true,
  onCreateLeague,
  onJoinLeague,
  onMockDraft,
  onScoreboard,
  onViewLeague,
  onRetry,
  onSignIn,
  onInviteFriends,
  onAdvancedCreate,
  onBrowsePlayers,
  leagueCap,
  isPremium,
}: MLBHomeProps) {
  const [showCreateDialog, setShowCreateDialog] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const [showArchived, setShowArchived] = React.useState(false);
  const [roleFilter, setRoleFilter] = React.useState<RoleFilter>('all');

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 200);
    return () => clearTimeout(timer);
  }, [search]);

  const activeLeagues = leagues.filter((l) => !l.tierFrozenAt && !l.frozenAt);
  const archivedLeagues = leagues.filter(
    (l) => !!(l.tierFrozenAt || l.frozenAt),
  );

  const leaguesCount = activeLeagues.length;
  const hasLeagues = leaguesCount > 0;
  const currentYear = new Date().getFullYear();

  const averageRosterSize =
    leaguesCount > 0
      ? Math.round(
          activeLeagues.reduce(
            (total, l) => total + (l.maxRosterSize || 0),
            0,
          ) / leaguesCount,
        )
      : 0;
  const currentWeek =
    activeLeagues.reduce(
      (maxWeek, l) =>
        l.currentWeekNumber && l.currentWeekNumber > maxWeek
          ? l.currentWeekNumber
          : maxWeek,
      1,
    ) || 1;
  const safeCurrentWeek = currentWeek > 0 ? currentWeek : 1;

  const heroSubtitleCopy = hasLeagues
    ? `You're managing ${leaguesCount} league${
        leaguesCount === 1 ? '' : 's'
      }. Keep building momentum with streamlined tools and insights.`
    : 'Launch your first fantasy baseball league in minutes and lead your team from draft day to the trophy presentation.';

  const quickWins = hasLeagues
    ? [
        `Monitor week ${safeCurrentWeek} matchups and finalize starters.`,
        `Average rosters hold ${averageRosterSize} players — adjust slots as needed.`,
        'Share invite codes to bring new managers into the action.',
      ]
    : [
        'Decide how many teams you want in your new league.',
        'Lock in a draft date that fits every manager.',
        'Use invite codes to bring your league together in seconds.',
      ];

  const hasRoleData = leagues.some((l) => l.permissionLevel != null);

  const filteredLeagues = activeLeagues.filter(
    (l) =>
      (l?.name || '')
        .toLowerCase()
        .includes(debouncedSearch.trim().toLowerCase()) &&
      matchesRoleFilter(l.permissionLevel, roleFilter),
  );
  const filteredArchived = archivedLeagues.filter((l) =>
    (l?.name || '')
      .toLowerCase()
      .includes(debouncedSearch.trim().toLowerCase()),
  );

  const [visibleCount, setVisibleCount] = React.useState(LEAGUES_PAGE_SIZE);

  React.useEffect(() => {
    setVisibleCount(LEAGUES_PAGE_SIZE);
  }, [search]);

  const visibleLeagues = filteredLeagues.slice(0, visibleCount);
  const hiddenCount = filteredLeagues.length - visibleLeagues.length;

  const atCap = !!leagueCap?.atLimit;

  const handleCreatePress = () => {
    if (atCap) {
      leagueCap?.onUpgrade();
      return;
    }
    setShowCreateDialog(true);
  };

  if (loading) {
    return (
      <YStack
        flex={1}
        backgroundColor="$background"
        alignItems="center"
        justifyContent="center"
        minHeight={320}
      >
        <Spinner size="large" color={BRAND_NAVY_LIGHT} />
      </YStack>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
      <YStack
        backgroundColor="$background"
        flexGrow={1}
        paddingHorizontal="$4"
        paddingVertical="$5"
        gap="$6"
        // Mobile-first padding: tighter on phones, roomier once the viewport
        // can afford it. Restores the responsive padding the web-only
        // BaseballLandingPage had before the LS-7716 extraction (LS-7799).
        $gtSm={{ paddingHorizontal: '$6', paddingVertical: '$7' }}
      >
        {/* Hero — compact for returning managers, full for first-timers */}
        {hasLeagues ? (
          <XStack
            backgroundColor="$glassSurface"
            borderRadius="$7"
            borderWidth={1}
            borderColor="$glassBorder"
            flexDirection="column"
            alignItems="flex-start"
            padding="$4"
            gap="$4"
            // Compact returning-user hero: stacks on phones, reflows to a
            // side-by-side banner on wider viewports (LS-7799).
            $gtSm={{ padding: '$5' }}
            $gtMd={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <YStack gap="$1" flex={1} minWidth={200}>
              <H2 color="$color" fontSize="$8" fontWeight="800">
                Baseball Fantasy
              </H2>
              <Paragraph color="$glassTextSubdued" fontSize="$3">
                Welcome back, {userName}
              </Paragraph>
            </YStack>
            <XStack gap="$2" flexWrap="wrap">
              <Button
                backgroundColor={BRAND_NAVY_LIGHT}
                borderRadius="$5"
                disabled={atCap}
                opacity={atCap ? 0.5 : 1}
                onPress={handleCreatePress}
                accessibilityLabel="Create a new baseball league"
              >
                <Text color="$color1" fontWeight="700">
                  + Create
                </Text>
              </Button>
              <Button
                backgroundColor={withAlpha(BRAND_NAVY, 0.14)}
                borderColor={withAlpha(BRAND_NAVY, 0.42)}
                borderWidth={1}
                borderRadius="$5"
                onPress={onJoinLeague}
                accessibilityLabel="Join an existing baseball league"
              >
                <Text color={BRAND_GOLD_LIGHT} fontWeight="700">
                  Join
                </Text>
              </Button>
              {onMockDraft ? (
                <Button
                  backgroundColor={withAlpha(BRAND_NAVY, 0.14)}
                  borderColor={withAlpha(BRAND_NAVY, 0.42)}
                  borderWidth={1}
                  borderRadius="$5"
                  onPress={onMockDraft}
                  accessibilityLabel="Practice with a mock draft simulator"
                >
                  <Text color={BRAND_GOLD_LIGHT} fontWeight="700">
                    Mock Draft
                  </Text>
                </Button>
              ) : null}
              {onScoreboard ? (
                <Button
                  backgroundColor={withAlpha(BRAND_NAVY, 0.14)}
                  borderColor={withAlpha(BRAND_NAVY, 0.42)}
                  borderWidth={1}
                  borderRadius="$5"
                  onPress={onScoreboard}
                  accessibilityLabel="View the live scoreboard"
                >
                  <Text color={BRAND_GOLD_LIGHT} fontWeight="700">
                    Live Scores
                  </Text>
                </Button>
              ) : null}
              {onBrowsePlayers ? (
                <Button
                  backgroundColor={withAlpha(BRAND_NAVY, 0.14)}
                  borderColor={withAlpha(BRAND_NAVY, 0.42)}
                  borderWidth={1}
                  borderRadius="$5"
                  onPress={onBrowsePlayers}
                  accessibilityLabel="Browse baseball players"
                >
                  <Text color={BRAND_GOLD_LIGHT} fontWeight="700">
                    Players
                  </Text>
                </Button>
              ) : null}
            </XStack>
          </XStack>
        ) : (
          <XStack
            backgroundColor="$glassSurface"
            borderRadius="$8"
            borderWidth={1}
            borderColor="$glassBorder"
            flexDirection="column"
            padding="$6"
            gap="$6"
            // First-timer hero: stacked copy + side panel on phones, reflows to
            // side-by-side on desktop, with padding scaling up by tier. Mirrors
            // the deleted web BaseballLandingPage hero breakpoints (LS-7799).
            $gtSm={{ padding: '$7' }}
            $gtMd={{ flexDirection: 'row', padding: '$9' }}
          >
            <YStack flex={1} minWidth={280} gap="$4">
              <XStack
                alignSelf="flex-start"
                backgroundColor="$surfaceInteractive"
                borderRadius="$10"
                borderWidth={1}
                borderColor="$accentMuted"
                paddingHorizontal="$4"
                paddingVertical="$1.5"
              >
                <Text fontSize="$2" fontWeight="600" color={BRAND_GOLD_LIGHT}>
                  {currentYear} Season Hub
                </Text>
              </XStack>
              <H1
                color="$color"
                fontSize="$10"
                fontWeight="800"
                $gtSm={{ fontSize: '$12' }}
              >
                Baseball Fantasy
              </H1>
              <Paragraph
                color="$glassTextSubdued"
                fontSize="$4"
                $gtSm={{ fontSize: '$5' }}
              >
                {`Welcome back, ${userName}. ${heroSubtitleCopy}`}
              </Paragraph>
              <XStack gap="$3" flexWrap="wrap" marginTop="$2">
                {atCap ? (
                  <Button
                    backgroundColor={BRAND_GOLD}
                    borderRadius="$6"
                    onPress={() => leagueCap?.onUpgrade()}
                    accessibilityLabel="Upgrade to add more leagues"
                  >
                    <Text color={BRAND_NAVY} fontWeight="700">
                      Upgrade to add more leagues
                    </Text>
                  </Button>
                ) : (
                  <Button
                    backgroundColor={BRAND_NAVY_LIGHT}
                    borderRadius="$6"
                    onPress={handleCreatePress}
                    accessibilityLabel="Create a new baseball league"
                  >
                    <Text color="$color1" fontWeight="700">
                      Create League
                    </Text>
                  </Button>
                )}
                <Button
                  backgroundColor={withAlpha(BRAND_NAVY, 0.12)}
                  borderColor={withAlpha(BRAND_NAVY, 0.42)}
                  borderWidth={1}
                  borderRadius="$6"
                  onPress={onJoinLeague}
                  accessibilityLabel="Join an existing baseball league"
                >
                  <Text color={BRAND_GOLD_LIGHT} fontWeight="700">
                    Join League
                  </Text>
                </Button>
                {onMockDraft ? (
                  <Button
                    backgroundColor={withAlpha(BRAND_NAVY, 0.12)}
                    borderColor={withAlpha(BRAND_NAVY, 0.42)}
                    borderWidth={1}
                    borderRadius="$6"
                    onPress={onMockDraft}
                    accessibilityLabel="Practice with a mock draft simulator"
                  >
                    <Text color={BRAND_GOLD_LIGHT} fontWeight="700">
                      Mock Draft
                    </Text>
                  </Button>
                ) : null}
                {onScoreboard ? (
                  <Button
                    backgroundColor={withAlpha(BRAND_NAVY, 0.12)}
                    borderColor={withAlpha(BRAND_NAVY, 0.42)}
                    borderWidth={1}
                    borderRadius="$6"
                    onPress={onScoreboard}
                    accessibilityLabel="View the live scoreboard"
                  >
                    <Text color={BRAND_GOLD_LIGHT} fontWeight="700">
                      Live Scores
                    </Text>
                  </Button>
                ) : null}
                {onBrowsePlayers ? (
                  <Button
                    backgroundColor={withAlpha(BRAND_NAVY, 0.12)}
                    borderColor={withAlpha(BRAND_NAVY, 0.42)}
                    borderWidth={1}
                    borderRadius="$6"
                    onPress={onBrowsePlayers}
                    accessibilityLabel="Browse baseball players"
                  >
                    <Text color={BRAND_GOLD_LIGHT} fontWeight="700">
                      Players
                    </Text>
                  </Button>
                ) : null}
              </XStack>
              <Paragraph fontSize="$3" color="$glassTextMuted" maxWidth={440}>
                Draft-ready controls, transparent roster limits, and secure
                invitations built for competitive fantasy managers.
              </Paragraph>
            </YStack>

            <YStack width="100%" maxWidth={380} gap="$4">
              <YStack
                backgroundColor="$glassSurfaceLight"
                borderRadius="$7"
                padding="$6"
                borderWidth={1}
                borderColor="$glassBorder"
                gap="$4"
              >
                <YStack gap="$1">
                  <Paragraph
                    fontSize="$3"
                    color="$glassTextMuted"
                    textTransform="uppercase"
                    letterSpacing={1}
                  >
                    Getting Started
                  </Paragraph>
                  <H3 fontSize="$7" color="$color">
                    Build your first roster
                  </H3>
                </YStack>
                <Separator backgroundColor="$glassBorder" />
                <Paragraph fontSize="$3" color="$glassTextSubdued">
                  Create or join a league to start tracking your season — weekly
                  matchups, roster stats, and draft countdowns will appear here.
                </Paragraph>
              </YStack>

              <YStack
                backgroundColor="$glassSurfaceLight"
                borderRadius="$7"
                padding="$5"
                borderWidth={1}
                borderColor="$glassBorder"
                gap="$3"
              >
                <Paragraph
                  fontSize="$3"
                  color="$glassTextMuted"
                  textTransform="uppercase"
                  letterSpacing={1}
                >
                  Quick Wins
                </Paragraph>
                <Paragraph fontSize="$4" color="$color">
                  Make sure your league is ready before first pitch.
                </Paragraph>
                {quickWins.map((item, index) => (
                  <XStack key={index} alignItems="center" gap="$3">
                    <YStack
                      width={10}
                      height={10}
                      borderRadius={9999}
                      backgroundColor={BRAND_NAVY_LIGHT}
                    />
                    <Paragraph fontSize="$3" color="$glassTextSubdued" flex={1}>
                      {item}
                    </Paragraph>
                  </XStack>
                ))}
              </YStack>
            </YStack>
          </XStack>
        )}

        {/* Error notice */}
        {error ? (
          <YStack
            backgroundColor={withAlpha(BRAND_SEAM_RED, 0.08)}
            borderColor={withAlpha(BRAND_SEAM_RED, 0.4)}
            borderWidth={1}
            borderRadius="$6"
            padding="$5"
            gap="$3"
            role="alert"
          >
            <Paragraph fontSize="$4" color="$red10" fontWeight="600">
              Could not load your leagues
            </Paragraph>
            <Paragraph fontSize="$3" color="$glassTextSubdued">
              There was a problem fetching your league data. You can still
              create or join a league below.
            </Paragraph>
            {onRetry ? (
              <Button
                alignSelf="flex-start"
                backgroundColor={withAlpha(BRAND_NAVY, 0.12)}
                borderColor={withAlpha(BRAND_NAVY, 0.42)}
                borderWidth={1}
                onPress={onRetry}
                accessibilityLabel="Retry loading leagues"
              >
                <Text color={BRAND_GOLD_LIGHT} fontWeight="700">
                  Retry
                </Text>
              </Button>
            ) : null}
          </YStack>
        ) : null}

        {/* Unauthenticated notice */}
        {!isAuthenticated ? (
          <YStack
            backgroundColor={withAlpha(BRAND_NAVY, 0.14)}
            borderColor={withAlpha(BRAND_NAVY, 0.35)}
            borderWidth={1}
            borderRadius="$6"
            padding="$5"
            gap="$3"
          >
            <Paragraph fontSize="$4" color={BRAND_GOLD_LIGHT} fontWeight="600">
              Sign in to manage your fantasy baseball leagues
            </Paragraph>
            <Paragraph fontSize="$3" color={BRAND_GOLD_LIGHT}>
              Authentication is required to access drafts, invite codes, and
              lineup management.
            </Paragraph>
            {onSignIn ? (
              <Button
                alignSelf="flex-start"
                backgroundColor={BRAND_NAVY_LIGHT}
                onPress={onSignIn}
                accessibilityLabel="Get started free"
              >
                <Text color="$color1" fontWeight="700">
                  Get Started Free
                </Text>
              </Button>
            ) : null}
          </YStack>
        ) : null}

        {/* League-cap indicator: free-tier count/limit, or premium unlimited badge (LS-5870) */}
        {isPremium ? (
          <XStack alignItems="center" gap="$2">
            <Text
              color={BRAND_GOLD}
              fontSize="$4"
              fontWeight="bold"
              accessibilityLabel="You have unlimited leagues"
            >
              Unlimited leagues
            </Text>
          </XStack>
        ) : leagueCap ? (
          <XStack alignItems="center" flexWrap="wrap" gap="$2">
            <Text color="$gray11" fontSize="$4">
              Your leagues: {leagueCap.count}/{leagueCap.limit}
            </Text>
            {leagueCap.atLimit ? (
              <Text
                color={BRAND_GOLD}
                fontSize="$4"
                fontWeight="bold"
                onPress={leagueCap.onUpgrade}
                accessibilityLabel="Upgrade to add more leagues"
              >
                — Upgrade to add more
              </Text>
            ) : null}
          </XStack>
        ) : null}

        {onInviteFriends ? (
          <Button
            backgroundColor={withAlpha(BRAND_NAVY, 0.14)}
            borderColor={withAlpha(BRAND_NAVY, 0.42)}
            borderWidth={1}
            borderRadius="$5"
            alignSelf="flex-start"
            onPress={onInviteFriends}
            accessibilityLabel="Invite friends to a league"
          >
            <Text color={BRAND_GOLD_LIGHT} fontWeight="700">
              Invite Friends
            </Text>
          </Button>
        ) : null}

        {/* Your leagues */}
        <YStack gap="$4">
          <XStack
            flexDirection="column"
            alignItems="flex-start"
            gap="$3"
            // Section header stacks title over the search box on phones and
            // reflows to a single row with the search pinned right on desktop
            // (LS-7799).
            $gtMd={{
              flexDirection: 'row',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
            }}
          >
            <YStack gap="$1">
              <H2 color="$color" fontSize="$8" fontWeight="700">
                Your Leagues
              </H2>
              <Paragraph fontSize="$3" color="$glassTextMuted">
                {hasLeagues
                  ? 'Select a league to review rosters, matchups, and draft plans.'
                  : 'Create or join a league to unlock your personalized season dashboard.'}
              </Paragraph>
            </YStack>
            {hasLeagues ? (
              <XStack
                alignItems="center"
                backgroundColor="$glassSurface"
                borderRadius="$5"
                borderWidth={1}
                borderColor="$glassBorder"
                paddingHorizontal="$3"
                width="100%"
                maxWidth={340}
              >
                <Input
                  size="$4"
                  placeholder="Search leagues..."
                  value={search}
                  onChangeText={setSearch}
                  backgroundColor="transparent"
                  borderWidth={0}
                  flex={1}
                  accessibilityLabel="Search leagues"
                  aria-label="Search leagues"
                />
              </XStack>
            ) : null}
          </XStack>

          {hasRoleData && hasLeagues ? (
            <XStack gap="$2" flexWrap="wrap" testID="role-filter-bar">
              {(
                [
                  { key: 'all', label: 'All' },
                  { key: 'commissioner', label: 'Commish' },
                  { key: 'general_manager', label: 'GM' },
                  { key: 'member', label: 'Member' },
                ] as { key: RoleFilter; label: string }[]
              ).map(({ key, label }) => {
                const active = roleFilter === key;
                return (
                  <Button
                    key={key}
                    size="$2"
                    backgroundColor={
                      active
                        ? withAlpha(BRAND_NAVY, 0.8)
                        : withAlpha(BRAND_NAVY, 0.1)
                    }
                    borderColor={
                      active
                        ? withAlpha(BRAND_NAVY, 0.9)
                        : withAlpha(BRAND_NAVY, 0.3)
                    }
                    borderWidth={1}
                    borderRadius="$5"
                    onPress={() => setRoleFilter(key)}
                    accessibilityLabel={`Filter by ${label}`}
                  >
                    <Text
                      fontSize={12}
                      fontWeight={active ? '700' : '500'}
                      color={active ? BRAND_GOLD_LIGHT : '$gray11'}
                    >
                      {label}
                    </Text>
                  </Button>
                );
              })}
            </XStack>
          ) : null}

          {error ? null : filteredLeagues.length > 0 ? (
            <YStack gap="$3" testID="leagues-grid">
              {visibleLeagues.map((league) => {
                const badge = getLeagueBadge(
                  league.draftStatus,
                  league.currentWeekNumber,
                  league.tierFrozenAt,
                  league.frozenAt,
                );
                const roleChip = getRoleChip(league.permissionLevel);
                return (
                  <XStack
                    key={league.id}
                    backgroundColor="$glassSurface"
                    borderRadius="$6"
                    borderWidth={1}
                    borderColor="$glassBorder"
                    padding="$4"
                    paddingHorizontal="$5"
                    flexDirection="column"
                    alignItems="flex-start"
                    gap="$4"
                    cursor="pointer"
                    pressStyle={{ scale: 0.995 }}
                    onPress={() => onViewLeague(league.id)}
                    accessibilityLabel={`View ${league.name || 'league'}`}
                    role="link"
                    // League rows stack their name/badges/action vertically on
                    // phones and lay out in a single centered row on desktop
                    // (LS-7799).
                    $gtSm={{ flexDirection: 'row', alignItems: 'center' }}
                  >
                    <YStack gap="$1" flex={1} minWidth={160}>
                      <H3 fontSize="$6" fontWeight="700" color="$color">
                        {league.name || 'Unnamed League'}
                      </H3>
                      <Paragraph fontSize="$2" color="$textMuted">
                        {league.maxRosterSize
                          ? `${league.maxRosterSize}-slot roster`
                          : 'Season dashboard'}
                      </Paragraph>
                    </YStack>

                    <XStack alignItems="center" gap="$3" flexWrap="wrap">
                      <XStack
                        backgroundColor={badge.bg}
                        borderColor={badge.border}
                        borderWidth={1}
                        borderRadius="$5"
                        paddingHorizontal="$3"
                        paddingVertical="$1"
                      >
                        <Text
                          fontSize={11}
                          fontWeight="700"
                          color={badge.text}
                          textTransform="uppercase"
                          letterSpacing={0.5}
                        >
                          {badge.label}
                        </Text>
                      </XStack>
                      {roleChip ? (
                        <XStack
                          backgroundColor={roleChip.bg}
                          borderColor={roleChip.border}
                          borderWidth={1}
                          borderRadius="$5"
                          paddingHorizontal="$3"
                          paddingVertical="$1"
                          testID={`role-chip-${league.id}`}
                        >
                          <Text
                            fontSize={11}
                            fontWeight="600"
                            color={roleChip.text}
                            textTransform="uppercase"
                            letterSpacing={0.5}
                          >
                            {roleChip.label}
                          </Text>
                        </XStack>
                      ) : null}
                      {league.weekAdvanceStatus === 'processing' ||
                      league.weekAdvanceStatus === 'queued' ? (
                        <XStack
                          backgroundColor={withAlpha(YELLOW, 0.12)}
                          borderColor={withAlpha(YELLOW, 0.35)}
                          borderWidth={1}
                          borderRadius="$5"
                          paddingHorizontal="$3"
                          paddingVertical="$1"
                        >
                          <Text
                            fontSize={11}
                            fontWeight="600"
                            color="$yellow10"
                          >
                            Advancing
                          </Text>
                        </XStack>
                      ) : league.weekAdvanceStatus === 'failed' ? (
                        <XStack
                          backgroundColor={withAlpha(INJURY_OUT, 0.12)}
                          borderColor={withAlpha(INJURY_OUT, 0.35)}
                          borderWidth={1}
                          borderRadius="$5"
                          paddingHorizontal="$3"
                          paddingVertical="$1"
                        >
                          <Text fontSize={11} fontWeight="600" color="$red10">
                            Advance failed
                          </Text>
                        </XStack>
                      ) : null}
                    </XStack>

                    <Button
                      backgroundColor={withAlpha(BRAND_NAVY, 0.16)}
                      borderColor={withAlpha(BRAND_NAVY, 0.45)}
                      borderWidth={1}
                      borderRadius="$5"
                      onPress={() => onViewLeague(league.id)}
                      accessibilityLabel={`View ${league.name || 'league'}`}
                    >
                      <Text
                        fontWeight="700"
                        color={BRAND_GOLD_LIGHT}
                        fontSize="$2"
                      >
                        View
                      </Text>
                    </Button>
                  </XStack>
                );
              })}
              {hiddenCount > 0 ? (
                <Button
                  alignSelf="flex-start"
                  backgroundColor={withAlpha(BRAND_NAVY, 0.12)}
                  borderColor={withAlpha(BRAND_NAVY, 0.42)}
                  borderWidth={1}
                  borderRadius="$5"
                  onPress={() => setVisibleCount((c) => c + LEAGUES_PAGE_SIZE)}
                  accessibilityLabel={`Show ${hiddenCount} more league${hiddenCount === 1 ? '' : 's'}`}
                >
                  <Text color={BRAND_GOLD_LIGHT} fontWeight="700">
                    Show {hiddenCount} more league{hiddenCount === 1 ? '' : 's'}
                  </Text>
                </Button>
              ) : null}
            </YStack>
          ) : (
            <YStack
              alignItems="center"
              justifyContent="center"
              backgroundColor="$glassSurface"
              borderRadius="$7"
              borderWidth={1}
              borderColor="$glassBorder"
              padding="$10"
              gap="$5"
              minHeight={280}
            >
              {debouncedSearch.trim() ? (
                <>
                  <H2 fontSize="$8" fontWeight="700" color="$color">
                    No leagues match your search
                  </H2>
                  <Paragraph
                    fontSize="$4"
                    color="$glassTextMuted"
                    maxWidth={440}
                    textAlign="center"
                  >
                    Try a different search term or clear the search field.
                  </Paragraph>
                </>
              ) : (
                <>
                  <H2 fontSize="$8" fontWeight="700" color="$color">
                    No baseball leagues yet
                  </H2>
                  <Paragraph
                    fontSize="$4"
                    color="$glassTextMuted"
                    maxWidth={440}
                    textAlign="center"
                  >
                    Build a private competition or join friends to unlock live
                    matchups, draft tools, and performance tracking.
                    {leagueCap && !isPremium
                      ? ` Free plan includes ${leagueCap.limit} league${leagueCap.limit === 1 ? '' : 's'}.`
                      : null}
                  </Paragraph>
                  <XStack gap="$3" flexWrap="wrap" justifyContent="center">
                    {atCap ? (
                      <Button
                        backgroundColor={BRAND_GOLD}
                        borderRadius="$6"
                        onPress={() => leagueCap?.onUpgrade()}
                        accessibilityLabel="Upgrade to add more leagues"
                      >
                        <Text color={BRAND_NAVY} fontWeight="700">
                          Upgrade to add more leagues
                        </Text>
                      </Button>
                    ) : (
                      <Button
                        backgroundColor={BRAND_NAVY_LIGHT}
                        borderRadius="$6"
                        onPress={handleCreatePress}
                        accessibilityLabel="Create your first baseball league"
                      >
                        <Text color="$color1" fontWeight="700">
                          Create your first league
                        </Text>
                      </Button>
                    )}
                    <Button
                      backgroundColor={withAlpha(BRAND_NAVY, 0.12)}
                      borderColor={withAlpha(BRAND_NAVY, 0.42)}
                      borderWidth={1}
                      borderRadius="$6"
                      onPress={onJoinLeague}
                      accessibilityLabel="Join a baseball league with a code"
                    >
                      <Text color={BRAND_GOLD_LIGHT} fontWeight="700">
                        Join with a code
                      </Text>
                    </Button>
                  </XStack>
                </>
              )}
            </YStack>
          )}

          {/* Archived leagues — collapsed by default */}
          {archivedLeagues.length > 0 ? (
            <YStack gap="$3" marginTop="$2">
              <XStack
                alignItems="center"
                gap="$2"
                cursor="pointer"
                onPress={() => setShowArchived((v) => !v)}
                accessibilityRole="button"
                accessibilityLabel={
                  showArchived
                    ? 'Hide archived leagues'
                    : 'Show archived leagues'
                }
              >
                <Text
                  fontSize="$3"
                  color="$glassTextMuted"
                  textTransform="uppercase"
                  letterSpacing={1}
                  fontWeight="600"
                >
                  {showArchived ? '▾' : '▸'} Archived leagues (
                  {filteredArchived.length})
                </Text>
              </XStack>
              {showArchived
                ? filteredArchived.map((league) => {
                    const badge = getLeagueBadge(
                      league.draftStatus,
                      league.currentWeekNumber,
                      league.tierFrozenAt,
                      league.frozenAt,
                    );
                    return (
                      <XStack
                        key={league.id}
                        backgroundColor="$glassSurface"
                        borderRadius="$6"
                        borderWidth={1}
                        borderColor="$glassBorder"
                        padding="$4"
                        paddingHorizontal="$5"
                        flexDirection="column"
                        alignItems="flex-start"
                        gap="$4"
                        opacity={0.65}
                        $gtSm={{ flexDirection: 'row', alignItems: 'center' }}
                      >
                        <YStack gap="$1" flex={1} minWidth={160}>
                          <H3 fontSize="$6" fontWeight="700" color="$color">
                            {league.name || 'Unnamed League'}
                          </H3>
                          <Paragraph fontSize="$2" color="$textMuted">
                            {league.maxRosterSize
                              ? `${league.maxRosterSize}-slot roster`
                              : 'Season dashboard'}
                          </Paragraph>
                        </YStack>
                        <XStack alignItems="center" gap="$3">
                          <XStack
                            backgroundColor={badge.bg}
                            borderColor={badge.border}
                            borderWidth={1}
                            borderRadius="$5"
                            paddingHorizontal="$3"
                            paddingVertical="$1"
                          >
                            <Text
                              fontSize={11}
                              fontWeight="700"
                              color={badge.text}
                              textTransform="uppercase"
                              letterSpacing={0.5}
                            >
                              {badge.label}
                            </Text>
                          </XStack>
                        </XStack>
                        <Button
                          backgroundColor={withAlpha(BRAND_NAVY, 0.16)}
                          borderColor={withAlpha(BRAND_NAVY, 0.45)}
                          borderWidth={1}
                          borderRadius="$5"
                          onPress={() => onViewLeague(league.id)}
                          accessibilityLabel={`View ${league.name || 'league'}`}
                        >
                          <Text
                            fontWeight="700"
                            color={BRAND_GOLD_LIGHT}
                            fontSize="$2"
                          >
                            View
                          </Text>
                        </Button>
                      </XStack>
                    );
                  })
                : null}
            </YStack>
          ) : null}
        </YStack>
      </YStack>

      <CreateLeagueDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onSubmit={onCreateLeague}
        onAdvanced={onAdvancedCreate}
      />
    </ScrollView>
  );
}

export default MLBHome;
