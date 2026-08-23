import React, { useRef } from 'react';
import {
  Button,
  H1,
  H2,
  H3,
  Paragraph,
  ScrollView,
  Separator,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import { FlatList, type RefreshControlProps } from 'react-native';
import { useVirtualizer } from '@tanstack/react-virtual';
import { TrendingPlayersPreview } from './TrendingPlayersPreview';
import type { FootballPlayerCardPlayer } from './FootballPlayerCard';
import { Platform } from '../../platform-components';
import {
  formatDraftStatusForCard,
  getDraftStatusColors,
} from '../../utils/draftStatus';
import { MatchupCard } from '../../components/MatchupCard';

export interface NFLHomeLeague {
  id: string | number;
  name?: string | null;
  draftStatus?: string | null;
  currentWeekNumber?: number | null;
  weekAdvanceStatus?: string | null;
  maxRosterSize?: number | null;
}

// LS-6257 (FBH-003) — the leagues list previously rendered every league
// eagerly inside the page ScrollView: no windowing on web, no FlatList on
// native. Heavy users (commissioners across 10+ leagues) paid the full
// render cost of every heavy-styled row (gradient/shadow/badges) up front.
// Now the row list windows via @tanstack/react-virtual on web and FlatList
// on native — same established pattern as GameLogsTable (LS-7470) — inside a
// bounded-height panel so small league counts render exactly as before.
const LEAGUE_ROW_HEIGHT_PX = 92;
const LEAGUES_PANEL_MAX_HEIGHT_PX = 480;

interface LeaguesListProps {
  leagues: NFLHomeLeague[];
  onViewLeague: (leagueId: string | number) => void;
}

/**
 * A single league's highlighted matchup for this week (LS-5407). Surfaced on
 * Football Home so a manager mid-season can see who they're playing without
 * opening the league. `NFLHomeProps.matchupHighlights` carries one of these
 * per league that has an active/upcoming matchup — previously only the
 * first such league (in whatever order the API happened to return leagues)
 * was ever shown, silently hiding matchups for a multi-league user's other
 * leagues with no rule governing which one "won" (LS-6265 / FBH-011).
 */
export interface NFLHomeMatchupHighlight {
  leagueId: string | number;
  leagueName?: string | null;
  weekNumber: number;
  awayTeamName: string;
  homeTeamName: string;
  status?: 'live' | 'pre' | 'final' | 'bye';
  /**
   * Bye week (FBH-010): the highlighted team has no opponent this week.
   * Renders the "No opponent" slot instead of `homeTeamName`, matching
   * `MatchupCard`'s bye-week empty state.
   */
  noOpponent?: boolean;
  onPress?: () => void;
}

/**
 * Free-tier league-cap context, mirroring `MLBHomeLeagueCap` (LS-8928). The
 * cap is global across every sport — `count`/`limit` reflect the user's
 * total non-mock league membership, not football-only. Supplied only by
 * platforms that gate league creation; when omitted the cap indicator is
 * hidden and `onCreateLeague` is called unconditionally.
 */
export interface NFLHomeLeagueCap {
  count: number;
  limit: number;
  atLimit: boolean;
  onUpgrade: () => void;
}

/**
 * "Resume last league" shortcut wiring (LS-6294 / FBH-040). The container
 * resolves the last-visited league from existing storage (LS-6694) and its
 * display name; `NFLHome` only renders it. Omit to hide the shortcut.
 */
export interface NFLHomeResumeLeague {
  id: string | number;
  name?: string | null;
  onPress: () => void;
}

export interface NFLHomeProps {
  leagues?: NFLHomeLeague[];
  loading?: boolean;
  error?: boolean;
  /** When false, renders a sign-in CTA instead of the leagues list. Defaults to true. */
  isAuthenticated?: boolean;
  onCreateLeague: () => void;
  onJoinLeague?: () => void;
  onBrowseLeagues?: () => void;
  onBrowsePlayers?: () => void;
  onViewLeague: (leagueId: string | number) => void;
  /** Navigate to sign-in from the unauthenticated notice. */
  onSignIn?: () => void;
  /** Retry the leagues query from the error notice. Omitted → no Retry button. */
  onRetry?: () => void;
  /** Top/trending players preview (LS-5411). Omit to hide the section entirely. */
  trendingPlayers?: FootballPlayerCardPlayer[];
  trendingPlayersLoading?: boolean;
  /**
   * This week's matchup highlights (LS-5407), one per league that has an
   * active/upcoming matchup (LS-6265). Section is hidden when empty.
   */
  matchupHighlights?: NFLHomeMatchupHighlight[];
  /**
   * When provided, renders a compact in-page sport switcher (LS-5412),
   * mirroring the Baseball -> Football switcher (LS-5815). Called with the
   * sport key the user selected.
   */
  onSwitchSport?: (sport: 'baseball') => void;
  /** Ready-made pull-to-refresh element for the root `ScrollView` (LS-8862). */
  refreshControl?: React.ReactElement<RefreshControlProps>;
  /** Free-tier league-cap context (LS-8928). Mirrors `MLBHome`'s `leagueCap`. */
  leagueCap?: NFLHomeLeagueCap;
  /**
   * True for premium users, who have no league-creation cap. Surfaces a
   * subtle "Unlimited leagues unlocked" badge near the Create CTA so premium
   * users get positive reinforcement of the benefit they're already paying
   * for, mirroring the free-tier `leagueCap` indicator (LS-6270/FBH-016).
   * Omit/false to hide.
   */
  hasUnlimitedLeagues?: boolean;
  /**
   * "Resume last league" shortcut (LS-6294 / FBH-040): fast re-entry into the
   * league the user was last viewing. Omit to hide the shortcut (e.g. no
   * last-visited football league is stored, or it belongs to a league the
   * user no longer has).
   */
  resumeLeague?: NFLHomeResumeLeague;
}

function getLeagueStatusLabel(league: NFLHomeLeague): string {
  if (!league.draftStatus) return 'Setup';
  if (league.draftStatus === 'not-started' || league.draftStatus === 'queued') {
    return 'Draft Pending';
  }
  if (league.draftStatus === 'completed' && league.currentWeekNumber != null) {
    return `Week ${league.currentWeekNumber}`;
  }
  return formatDraftStatusForCard(league.draftStatus);
}

interface LeagueRowProps {
  league: NFLHomeLeague;
  onViewLeague: (leagueId: string | number) => void;
}

function LeagueRow({ league, onViewLeague }: LeagueRowProps) {
  const statusColors = getDraftStatusColors(league.draftStatus);
  const statusLabel = getLeagueStatusLabel(league);
  return (
    <XStack
      backgroundColor="$glassSurface"
      borderRadius="$3"
      padding="$3"
      borderWidth={1}
      borderColor="$glassBorder"
      marginBottom="$2"
      flexDirection="column"
      alignItems="flex-start"
      gap="$2"
      cursor="pointer"
      onPress={() => onViewLeague(league.id)}
      accessibilityLabel={`View ${league.name ?? 'league'}`}
      role="link"
      testID={`football-league-row-${league.id}`}
      pressStyle={{ opacity: 0.8, scale: 0.99 }}
      // League rows stack name over badges on phones and lay out in
      // a single centered row on wider viewports (LS-7819).
      $gtSm={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <YStack gap="$1" flex={1} minWidth={160}>
        <Text color="$color" fontSize="$6" fontWeight="600">
          {league.name ?? 'Unnamed League'}
        </Text>
        {league.maxRosterSize ? (
          <Text color="$gray10" fontSize="$2">
            {league.maxRosterSize}-slot roster
          </Text>
        ) : null}
      </YStack>
      <XStack gap="$2" flexWrap="wrap">
        <YStack
          backgroundColor="$glassSurface"
          borderRadius="$3"
          paddingHorizontal="$2"
          paddingVertical="$1"
          borderWidth={1}
          borderColor="$glassBorder"
        >
          <Text
            color="$orange9"
            fontSize="$2"
            fontWeight="700"
            textTransform="uppercase"
            letterSpacing={0.5}
          >
            Football
          </Text>
        </YStack>
        {statusLabel ? (
          <YStack
            backgroundColor={statusColors.bg}
            borderRadius="$3"
            paddingHorizontal="$2"
            paddingVertical="$1"
            borderWidth={1}
            borderColor={statusColors.border}
          >
            <Text
              color={statusColors.text}
              fontSize="$2"
              fontWeight="700"
              textTransform="uppercase"
              letterSpacing={0.5}
            >
              {statusLabel}
            </Text>
          </YStack>
        ) : null}
        {(league.weekAdvanceStatus === 'processing' ||
          league.weekAdvanceStatus === 'queued') && (
          <YStack
            backgroundColor="$yellow3"
            borderRadius="$3"
            paddingHorizontal="$2"
            paddingVertical="$1"
            borderWidth={1}
            borderColor="$yellow7"
            accessibilityLabel="League week advancing"
          >
            <Text color="$yellow11" fontSize="$2" fontWeight="600">
              Advancing
            </Text>
          </YStack>
        )}
        {league.weekAdvanceStatus === 'failed' && (
          <YStack
            backgroundColor="$red3"
            borderRadius="$3"
            paddingHorizontal="$2"
            paddingVertical="$1"
            borderWidth={1}
            borderColor="$red7"
            accessibilityLabel="League week advance failed"
          >
            <Text color="$red11" fontSize="$2" fontWeight="600">
              Advance failed
            </Text>
          </YStack>
        )}
      </XStack>
    </XStack>
  );
}

// Web: window the rows with @tanstack/react-virtual inside a bounded-height
// scroll container. Lists shorter than the panel height render with no
// scrollbar at all — visually identical to the previous unvirtualized output.
function LeaguesListWeb({ leagues, onViewLeague }: LeaguesListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: leagues.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => LEAGUE_ROW_HEIGHT_PX,
    overscan: 6,
  });

  return (
    <div
      ref={parentRef}
      data-testid="football-leagues-virtual-scroller"
      style={{ maxHeight: LEAGUES_PANEL_MAX_HEIGHT_PX, overflow: 'auto' }}
    >
      <div style={{ position: 'relative', height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const league = leagues[virtualRow.index];
          return (
            <div
              key={league.id}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <LeagueRow league={league} onViewLeague={onViewLeague} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Native: FlatList windows rows natively. Bounding its height keeps it a
// self-contained scroller inside the page's outer ScrollView instead of a
// full-bleed nested list, so small league counts render at their natural
// height exactly as before.
function LeaguesListNative({ leagues, onViewLeague }: LeaguesListProps) {
  return (
    <FlatList
      data={leagues}
      keyExtractor={(item: NFLHomeLeague) => String(item.id)}
      style={{ maxHeight: LEAGUES_PANEL_MAX_HEIGHT_PX }}
      renderItem={({ item }: { item: NFLHomeLeague }) => (
        <LeagueRow league={item} onViewLeague={onViewLeague} />
      )}
      initialNumToRender={8}
      maxToRenderPerBatch={8}
      windowSize={5}
      removeClippedSubviews
    />
  );
}

function LeaguesList(props: LeaguesListProps) {
  return Platform.OS === 'web' ? (
    <LeaguesListWeb {...props} />
  ) : (
    <LeaguesListNative {...props} />
  );
}

const SKELETON_ROW_COUNT = 3;

/**
 * Loading placeholder for the "Your Football Leagues" panel — shares
 * {@link LeagueRow}'s geometry so the swap to real rows doesn't reflow the
 * page once data resolves (LS-5410).
 */
function LeaguesListSkeleton() {
  return (
    <YStack
      testID="football-leagues-skeleton"
      gap="$2"
      role="presentation"
      aria-hidden={true}
    >
      {Array.from({ length: SKELETON_ROW_COUNT }).map((_, i) => (
        <XStack
          key={i}
          backgroundColor="$glassSurface"
          borderRadius="$3"
          padding="$3"
          borderWidth={1}
          borderColor="$glassBorder"
          alignItems="center"
          gap="$3"
        >
          <YStack flex={1} gap="$2" minWidth={160}>
            <YStack
              height={16}
              width={160}
              borderRadius="$2"
              backgroundColor="$gray5"
            />
            <YStack
              height={10}
              width={100}
              borderRadius="$2"
              backgroundColor="$gray5"
            />
          </YStack>
          <YStack
            height={20}
            width={64}
            borderRadius="$3"
            backgroundColor="$gray5"
          />
        </XStack>
      ))}
    </YStack>
  );
}

function NFLHome({
  leagues = [],
  loading = false,
  error = false,
  isAuthenticated = true,
  onCreateLeague,
  onJoinLeague,
  onBrowseLeagues,
  onBrowsePlayers,
  onViewLeague,
  onSignIn,
  onRetry,
  trendingPlayers,
  trendingPlayersLoading = false,
  matchupHighlights = [],
  onSwitchSport,
  refreshControl,
  leagueCap,
  hasUnlimitedLeagues = false,
  resumeLeague,
}: NFLHomeProps) {
  const hasLeagues = leagues.length > 0;

  // Static, football-specific "getting started" copy ported from the canonical
  // (now-retired) web FootballLandingPage side panel. Varies only by whether the
  // manager already has leagues — no user/query data is needed (LS-7819).
  const quickWins = hasLeagues
    ? [
        'Check your starting lineup before Sunday kickoff.',
        'Monitor waiver wire adds and drops mid-week.',
        'Share invite codes to fill open roster spots.',
      ]
    : [
        'Choose between D/ST or IDP (individual defensive players).',
        'Set your draft date and invite managers to lock in.',
        'Pick snake or auction — both are fully supported.',
      ];

  return (
    <ScrollView
      contentContainerStyle={{ flexGrow: 1 }}
      refreshControl={refreshControl}
    >
      <YStack
        backgroundColor="$background"
        flexGrow={1}
        paddingHorizontal="$4"
        paddingVertical="$5"
        gap="$6"
        // Mobile-first padding: tighter on phones, roomier once the viewport can
        // afford it. Restores the responsive padding the web-only
        // FootballLandingPage had before the NFLHome rewrite (LS-7819).
        $gtSm={{ paddingHorizontal: '$6', paddingVertical: '$7' }}
      >
        {/* Hero — stacked on phones, reflows to side-by-side (copy + side panel)
            on desktop, with padding scaling up by tier. Mirrors the canonical
            FootballLandingPage hero breakpoints (LS-7819).
            Fixed shape regardless of loading/hasLeagues state — only the copy
            and quick-wins text vary — so the query resolving never swaps in a
            differently-sized hero and shifts the page (LS-6277 / FBH-023). */}
        <XStack
          testID="football-hero"
          backgroundColor="$glassSurface"
          borderRadius="$8"
          borderWidth={1}
          borderColor="$glassBorder"
          flexDirection="column"
          padding="$6"
          gap="$6"
          $gtSm={{ padding: '$7' }}
          $gtMd={{ flexDirection: 'row', padding: '$9' }}
        >
          <YStack flex={1} minWidth={280} gap="$4">
            <H1
              color="$color"
              fontSize="$9"
              fontWeight="800"
              $gtSm={{ fontSize: '$11' }}
            >
              Football Fantasy
            </H1>
            <Text
              color="$glassTextSubdued"
              fontSize="$4"
              $gtSm={{ fontSize: '$5' }}
            >
              {hasLeagues
                ? 'Manage your leagues and get ready for game day.'
                : 'Launch your first fantasy football league in minutes.'}
            </Text>
            {/* Action row: natural-width buttons that wrap on narrow viewports
                instead of stretching edge-to-edge (LS-7819). */}
            <XStack gap="$3" flexWrap="wrap" marginTop="$2">
              <Button
                backgroundColor="$orange9"
                borderRadius="$3"
                paddingHorizontal="$5"
                onPress={onCreateLeague}
                accessibilityLabel="Create a new football league"
                data-testid="create-league-button"
              >
                <Text color="white" fontSize="$4" fontWeight="700">
                  Create League
                </Text>
              </Button>
              {onJoinLeague && (
                <Button
                  backgroundColor="$orange9"
                  borderRadius="$3"
                  paddingHorizontal="$5"
                  onPress={onJoinLeague}
                  accessibilityLabel="Join a football league"
                  data-testid="join-league-button"
                >
                  <Text color="white" fontSize="$4" fontWeight="700">
                    Join League
                  </Text>
                </Button>
              )}
              {onBrowseLeagues && (
                <Button
                  backgroundColor="$orange9"
                  borderRadius="$3"
                  paddingHorizontal="$5"
                  onPress={onBrowseLeagues}
                  accessibilityLabel="Browse public football leagues"
                >
                  <Text color="white" fontSize="$4" fontWeight="700">
                    Browse Leagues
                  </Text>
                </Button>
              )}
              {/* Never condition this CTA's visibility on subscription tier
                  (FBH-028 / LS-6282). If a premium-only filter (e.g.
                  historical_era_filters) is ever added to /football/players,
                  gate the filter control there — free users must still be
                  able to reach the players list with the default filter set. */}
              {onBrowsePlayers && (
                <Button
                  backgroundColor="$orange9"
                  borderRadius="$3"
                  paddingHorizontal="$5"
                  onPress={onBrowsePlayers}
                  accessibilityLabel="Browse football players"
                  data-testid="browse-players-button"
                >
                  <Text color="white" fontSize="$4" fontWeight="700">
                    Browse Players
                  </Text>
                </Button>
              )}
            </XStack>
            {/* Premium unlimited-leagues badge: positive reinforcement of the
                benefit next to the Create CTA, mirroring the free-tier
                leagueCap indicator further down the page (LS-6270/FBH-016). */}
            {hasUnlimitedLeagues ? (
              <XStack
                alignItems="center"
                testID="football-unlimited-leagues-badge"
              >
                <Text
                  backgroundColor="$green3"
                  color="$green11"
                  fontSize="$2"
                  fontWeight="700"
                  borderRadius="$10"
                  paddingHorizontal="$3"
                  paddingVertical="$1.5"
                  accessibilityLabel="Unlimited leagues unlocked"
                  aria-label="Unlimited leagues unlocked"
                >
                  ✓ Unlimited leagues unlocked
                </Text>
              </XStack>
            ) : null}
          </YStack>

          {/* Getting-started side panel: full-width above the copy on phones,
              pinned to the right on desktop via the hero's $gtMd row reflow. */}
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
                Make sure your league is ready before the first kickoff.
              </Paragraph>
              {quickWins.map((item, index) => (
                <XStack key={index} alignItems="center" gap="$3">
                  <YStack
                    width={10}
                    height={10}
                    borderRadius={9999}
                    backgroundColor="$orange9"
                  />
                  <Paragraph fontSize="$3" color="$glassTextSubdued" flex={1}>
                    {item}
                  </Paragraph>
                </XStack>
              ))}
            </YStack>
          </YStack>
        </XStack>

        {/* This week's matchup highlights (LS-5407) — one card per league
            with an active/upcoming matchup, so a multi-league manager sees
            every matchup that needs them this week instead of an
            arbitrarily-chosen single one (LS-6265 / FBH-011).
            LS-6266 / FBH-012: if a premium-only sub-feature is ever added
            here (e.g. live scoring vs. a cached score), gate it with
            `useHasEntitlement` from `../../hooks/useEntitlement` right in
            this component. Do not resolve `isPremium` per platform in
            apps/web and apps/app and pass it down as a prop — that's the
            duplication already seen with `MLBHome.isPremium`. */}
        {matchupHighlights.length > 0 ? (
          <YStack gap="$3" testID="matchup-highlight-section">
            <H2 color="$color" fontSize="$7" fontWeight="700">
              {matchupHighlights.length > 1
                ? "This Week's Matchups"
                : "This Week's Matchup"}
            </H2>
            <YStack gap="$3">
              {matchupHighlights.map((highlight) => (
                <YStack
                  key={highlight.leagueId}
                  gap="$2"
                  testID={`matchup-highlight-card-${highlight.leagueId}`}
                >
                  {matchupHighlights.length > 1 && highlight.leagueName ? (
                    <Text color="$gray10" fontSize="$3" fontWeight="600">
                      {highlight.leagueName}
                    </Text>
                  ) : null}
                  <MatchupCard
                    away={{ name: highlight.awayTeamName }}
                    home={{ name: highlight.homeTeamName }}
                    status={highlight.status ?? 'pre'}
                    week={`Week ${highlight.weekNumber}`}
                    noOpponent={highlight.noOpponent}
                    onPress={highlight.onPress}
                  />
                </YStack>
              ))}
            </YStack>
          </YStack>
        ) : null}

        {/* In-page sport switcher (LS-5412) */}
        {onSwitchSport ? (
          <XStack alignItems="center" gap="$3" flexWrap="wrap">
            <Text fontSize="$3" color="$gray10" fontWeight="600">
              Also play:
            </Text>
            <Button
              size="$2"
              backgroundColor="$gray3"
              borderColor="$gray7"
              borderWidth={1}
              borderRadius="$5"
              onPress={() => onSwitchSport('baseball')}
              accessibilityLabel="Switch to Baseball"
              aria-label="Switch to Baseball"
              testID="sport-switcher-baseball"
            >
              <Text fontSize={12} fontWeight="600" color="$gray11">
                Baseball
              </Text>
            </Button>
          </XStack>
        ) : null}

        {/* League-cap indicator: free-tier count/limit, visible before the
            user taps Create so the cross-sport cap is never a silent
            redirect (LS-8928). Mirrors MLBHome's leagueCap indicator. */}
        {leagueCap ? (
          <XStack
            alignItems="center"
            flexWrap="wrap"
            gap="$2"
            testID="football-league-cap-indicator"
          >
            <Text color="$gray11" fontSize="$4">
              Your leagues: {leagueCap.count}/{leagueCap.limit} — counts across
              every sport
            </Text>
            <Text
              color="$orange9"
              fontSize="$4"
              fontWeight="bold"
              onPress={leagueCap.onUpgrade}
              accessibilityLabel={
                leagueCap.atLimit
                  ? 'Upgrade to add more leagues'
                  : 'Upgrade to Premium'
              }
              aria-label={
                leagueCap.atLimit
                  ? 'Upgrade to add more leagues'
                  : 'Upgrade to Premium'
              }
            >
              {leagueCap.atLimit
                ? '— Upgrade to add more'
                : '— Upgrade to Premium'}
            </Text>
          </XStack>
        ) : null}

        {/* Proactive "you can still join for free" reassurance (LS-6289 /
            FBH-035). The league cap only gates creating/owning leagues — the
            Join CTA above stays enabled at the cap either way (LS-5413), but
            without this note a free user at their owned-league limit has no
            signal that joining leagues by invite code remains unlimited. */}
        {leagueCap?.atLimit ? (
          <Text
            color="$gray10"
            fontSize="$3"
            testID="football-join-still-free-notice"
          >
            You're at your owned-league limit, but you can still join leagues
            for free with an invite code.
          </Text>
        ) : null}

        {/* Resume last league shortcut (LS-6294 / FBH-040): fast re-entry
            into the league the user was last viewing, reusing the existing
            last-visited-league storage from LS-6694 rather than a new
            "recently viewed" list. */}
        {resumeLeague ? (
          <XStack
            backgroundColor="$glassSurface"
            borderRadius="$4"
            borderWidth={1}
            borderColor="$glassBorder"
            padding="$4"
            alignItems="center"
            justifyContent="space-between"
            gap="$3"
            cursor="pointer"
            onPress={resumeLeague.onPress}
            accessibilityLabel={`Resume ${resumeLeague.name ?? 'your last league'}`}
            role="link"
            testID="football-resume-league-card"
            pressStyle={{ opacity: 0.8, scale: 0.99 }}
          >
            <YStack gap="$1">
              <Text
                color="$gray10"
                fontSize="$2"
                fontWeight="600"
                textTransform="uppercase"
                letterSpacing={0.5}
              >
                Resume last league
              </Text>
              <Text color="$color" fontSize="$6" fontWeight="700">
                {resumeLeague.name ?? 'Unnamed League'}
              </Text>
            </YStack>
            <Text color="$orange9" fontSize="$4" fontWeight="700">
              Jump back in →
            </Text>
          </XStack>
        ) : null}

        {/* Your Football Leagues */}
        <YStack gap="$4">
          <H2 color="$color" fontSize="$7" fontWeight="700">
            Your Football Leagues
          </H2>
          <YStack
            backgroundColor="$gray2"
            borderRadius="$3"
            padding="$3"
            gap="$2"
          >
            {!isAuthenticated ? (
              <YStack alignItems="center" padding="$5" gap="$3">
                <Text fontSize="$5" color="$color" textAlign="center">
                  Sign in to manage your fantasy football leagues
                </Text>
                <Text color="$gray10" fontSize="$3" textAlign="center">
                  Authentication is required to access drafts, invite codes, and
                  lineup management.
                </Text>
                {onSignIn ? (
                  <Button
                    alignSelf="flex-start"
                    backgroundColor="$orange9"
                    borderRadius="$3"
                    onPress={onSignIn}
                    accessibilityLabel="Sign in to get started"
                  >
                    <Text color="white" fontWeight="700">
                      Get Started Free
                    </Text>
                  </Button>
                ) : null}
              </YStack>
            ) : loading ? (
              <LeaguesListSkeleton />
            ) : error ? (
              <YStack alignItems="center" padding="$5" gap="$3">
                <Text fontSize="$5" color="$red10" textAlign="center">
                  Could not load your leagues
                </Text>
                <Text color="$gray10" fontSize="$3" textAlign="center">
                  There was a problem fetching your league data.
                </Text>
                {onRetry ? (
                  <Button
                    backgroundColor="$orange9"
                    borderRadius="$3"
                    onPress={onRetry}
                    data-testid="football-leagues-retry-button"
                    accessibilityLabel="Retry loading leagues"
                    aria-label="Retry loading leagues"
                  >
                    <Text color="white" fontWeight="700">
                      Retry
                    </Text>
                  </Button>
                ) : null}
              </YStack>
            ) : leagues.length === 0 ? (
              <YStack alignItems="center" padding="$5" gap="$3">
                <Text color="$color" fontSize="$5" textAlign="center">
                  No football leagues yet
                </Text>
                <Text color="$gray10" fontSize="$3" textAlign="center">
                  {/* Free-tier on-ramp: name the cap and point to the upgrade
                      path instead of staying neutral about it (LS-6272). */}
                  {leagueCap
                    ? leagueCap.atLimit
                      ? `You've reached the free plan's limit of ${leagueCap.limit} league${leagueCap.limit === 1 ? '' : 's'} across every sport. Upgrade to Premium to create more.`
                      : `Create your first football league, or join one with an invite code. Free plan includes ${leagueCap.limit} league${leagueCap.limit === 1 ? '' : 's'} across every sport.`
                    : 'Create your first football league, or join one with an invite code.'}
                </Text>
                {leagueCap?.atLimit ? (
                  <Button
                    backgroundColor="$orange9"
                    borderRadius="$3"
                    onPress={leagueCap.onUpgrade}
                    data-testid="upgrade-from-empty-state-button"
                    accessibilityLabel="Upgrade to add more leagues"
                  >
                    <Text color="white" fontWeight="700">
                      Upgrade to add more leagues
                    </Text>
                  </Button>
                ) : (
                  <XStack gap="$3" flexWrap="wrap" justifyContent="center">
                    <Button
                      backgroundColor="$orange9"
                      borderRadius="$3"
                      onPress={onCreateLeague}
                      data-testid="create-first-league-button"
                      accessibilityLabel="Create your first football league"
                    >
                      <Text color="white" fontWeight="700">
                        Create your first football league
                      </Text>
                    </Button>
                    {onJoinLeague && (
                      <Button
                        backgroundColor="$glassSurface"
                        borderRadius="$3"
                        borderWidth={1}
                        borderColor="$glassBorder"
                        onPress={onJoinLeague}
                        data-testid="join-league-empty-state-button"
                        accessibilityLabel="Join an existing football league using an invite code"
                      >
                        <Text color="$color" fontWeight="700">
                          Join with invite code
                        </Text>
                      </Button>
                    )}
                  </XStack>
                )}
              </YStack>
            ) : (
              <LeaguesList leagues={leagues} onViewLeague={onViewLeague} />
            )}
          </YStack>
        </YStack>

        {trendingPlayers != null && (
          <TrendingPlayersPreview
            players={trendingPlayers}
            loading={trendingPlayersLoading}
          />
        )}
      </YStack>
    </ScrollView>
  );
}

export { NFLHome };
export default NFLHome;
