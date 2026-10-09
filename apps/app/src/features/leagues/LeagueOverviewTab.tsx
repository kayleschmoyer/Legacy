import React, { useCallback } from 'react';
import {
  Alert,
  Pressable,
  type RefreshControlProps,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Text, XStack, YStack } from 'tamagui';
import {
  Chip,
  LeagueActivityFeed,
  LeagueScoringSummary,
  OnThisDayFeed,
  type OnThisDayPlayerPress,
  PanelCard,
} from '@legacy-sports/shared-components';
import {
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  BRAND_SEAM_RED,
  BRAND_SEAM_RED_LIGHT,
  withAlpha,
} from '@legacy-sports/shared-components/utils';
import { DefensiveFormat, Sport } from '@legacy-sports/graphql';
import { LeagueDuesPaymentStatus } from '../commissioner/LeagueDuesPaymentStatus';
import type { ScoringSettings } from '../../common/scoring';
import { LeagueScoringReadOnly } from '../scoring/LeagueScoringReadOnly';
import type { LeagueScoringProfile } from '../scoring/LeagueScoringEditor';

interface RankedStanding {
  rank: number;
  teamId: number | null;
  name: string;
  record: string;
  isMine: boolean;
}

interface OverviewLeague {
  lmNotes?: string | null;
  maxRosterSize?: number | null;
  gamesPerMatchup?: number | null;
  totalMatchups?: number | null;
  currentWeekNumber?: number | null;
  inviteCode?: string | null;
  sport?: string | null;
  waiverEnabled?: boolean | null;
  waiverType?: string | null;
  salaryCapEnabled?: boolean | null;
  playoffFormat?: string | null;
  defensiveFormat?: string | null;
  /** Draft selection method: 'standard' | 'auction' | 'random'. Auction is a
   *  paid-tier draft setting (LS-9617), same tier signal as IDP below. */
  selectionMethod?: string | null;
}

/**
 * Premium league-configuration chips (FLD-007) — the Overview tab otherwise
 * gives a premium user no visual anchor for which paid features are active
 * on the league (FAAB waivers, salary cap, an advanced playoff bracket, IDP
 * defense). Returns an empty array for a plain/free-tier league so the card
 * stays hidden rather than rendering an empty shell.
 */
function buildLeagueConfigChips(league: OverviewLeague): string[] {
  const chips: string[] = [];
  if (league.waiverEnabled && league.waiverType === 'faab') {
    chips.push('FAAB');
  }
  if (league.salaryCapEnabled) {
    chips.push('Salary Cap');
  }
  if (league.playoffFormat === '6-team' || league.playoffFormat === '8-team') {
    chips.push(`${league.playoffFormat === '6-team' ? '6' : '8'}-Team Playoff`);
  }
  if (league.sport === Sport.Football && league.defensiveFormat === 'idp') {
    chips.push('IDP');
  }
  return chips;
}

interface LeagueOverviewTabProps {
  league: OverviewLeague;
  leagueId: number;
  isCommissioner: boolean;
  /** True when the viewer is a league member (or commissioner) rather than a
   *  spectator — gates member-only billing UI like the dues panel (LS-6325). */
  isMember: boolean;
  isDrafting: boolean;
  /** True when the reachable draft room is currently paused rather than
   *  actively live — swaps the join-banner copy and action label (LS-8843). */
  isPaused?: boolean;
  /** True when the viewer's subscription is premium — gates the "Premium
   *  Draft Settings" indicator on the join-draft banner (LS-6304/FLD-052). */
  isPremium: boolean;
  rankedStandings: RankedStanding[];
  startersCount: number;
  inviteCode: string;
  /**
   * Scoring profile state from `useLeagueScoringSettings`. When provided, the
   * shared {@link LeagueScoringSummary} is rendered at parity with web v2.
   * Baseball only — the summary is a baseball-specific (batting/fielding/
   * pitching) view, so the football screen does not pass these props.
   */
  scoringLoading?: boolean;
  scoringError?: Error | null;
  scoringProfileName?: string;
  scoringSettings?: ScoringSettings;
  /**
   * Football-only read-only scoring rules card (LS-6327). Football's
   * multiplier groups (passing/rushing/receiving/etc.) don't fit the
   * baseball-shaped `ScoringSettings` above, so football passes the raw
   * profile through to {@link LeagueScoringReadOnly} instead.
   */
  footballScoringProfile?: LeagueScoringProfile | null;
  footballScoringLoading?: boolean;
  footballScoringError?: Error | null;
  footballDefensiveFormat?: DefensiveFormat | string | null;
  onJoinDraft: () => void;
  onViewAllStandings: () => void;
  onInviteShare: () => void;
  onPlayerPress: (params: OnThisDayPlayerPress) => void;
  /**
   * Navigates to a team's Team Detail page (LS-5446). Optional — a caller
   * that doesn't supply it (or a row with no `teamId`) renders the Quick
   * Standings row as plain, non-interactive text, matching prior behavior.
   */
  onTeamPress?: (teamId: number) => void;
  /** Pull-to-refresh control for the tab's `ScrollView` (LS-8847). */
  refreshControl?: React.ReactElement<RefreshControlProps>;
}

// ─── Section — a single bordered "glass" surface with a title/sub header,
// matching the panel language already established by LeagueDetailShell and
// HomeScreen (PanelCard). Every overview block renders through this so the
// tab reads as one coherent page instead of a stack of mismatched cards
// (LS-8439). ─────────────────────────────────────────────────────────────
function OverviewSection({
  title,
  sub,
  right,
  children,
}: {
  title: string;
  sub?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <PanelCard>
      <YStack gap="$3">
        <XStack justifyContent="space-between" alignItems="flex-start" gap="$3">
          <YStack flex={1} gap="$1" minWidth={0}>
            <Text
              fontFamily="$heading"
              fontWeight="800"
              fontSize={17}
              color="$color"
            >
              {title}
            </Text>
            {sub ? (
              <Text fontFamily="$body" fontSize={13} color="$textMuted">
                {sub}
              </Text>
            ) : null}
          </YStack>
          {right}
        </XStack>
        {children}
      </YStack>
    </PanelCard>
  );
}

// ─── Banner — accent-colored strip for time-sensitive callouts (draft live,
// commissioner announcements). Uses the brand seam-red / gold tokens instead
// of generic Tamagui `$yellow*` scale so it reads as part of the same design
// system as the rest of the shell, not a disconnected default-theme alert. ──
function OverviewBanner({
  kind,
  title,
  sub,
  actions,
}: {
  kind: 'live' | 'gold';
  title: string;
  sub: string;
  actions?: React.ReactNode;
}): React.JSX.Element {
  const accent = kind === 'live' ? BRAND_SEAM_RED : BRAND_GOLD;
  const accentLight = kind === 'live' ? BRAND_SEAM_RED_LIGHT : BRAND_GOLD_LIGHT;
  return (
    <XStack
      backgroundColor={withAlpha(accent, 0.1)}
      borderWidth={1}
      borderColor={withAlpha(accent, 0.4)}
      borderRadius="$5"
      padding="$3"
      gap="$3"
      alignItems="center"
    >
      <YStack flex={1} gap="$1" minWidth={0}>
        <Text
          fontFamily="$heading"
          fontWeight="700"
          fontSize={13}
          letterSpacing={0.8}
          textTransform="uppercase"
          color={accentLight}
        >
          {title}
        </Text>
        <Text fontFamily="$body" fontSize={13} color="$textMuted">
          {sub}
        </Text>
      </YStack>
      {actions}
    </XStack>
  );
}

export function LeagueOverviewTab({
  league,
  leagueId,
  isCommissioner,
  isMember,
  isDrafting,
  isPaused = false,
  isPremium,
  rankedStandings,
  startersCount,
  inviteCode,
  scoringLoading,
  scoringError,
  scoringProfileName,
  scoringSettings,
  footballScoringProfile,
  footballScoringLoading,
  footballScoringError,
  footballDefensiveFormat,
  onJoinDraft,
  onViewAllStandings,
  onInviteShare,
  onPlayerPress,
  onTeamPress,
  refreshControl,
}: LeagueOverviewTabProps): React.JSX.Element {
  const { bottom: bottomInset } = useSafeAreaInsets();
  const router = useRouter();
  const isFootball = league.sport === Sport.Football;

  // LS-10015 — deep-link straight to the game an On This Day entry is about
  // (matching web's HomePage, LS-9763), rather than the player's generic
  // profile page. Falls back to the caller's `onPlayerPress` (generic profile
  // navigation) when the identifier can't be resolved to a game date.
  const handleOnThisDayPress = useCallback(
    (params: OnThisDayPlayerPress) => {
      if (params.brefId && params.gameDate) {
        router.push({
          pathname: '/ViewGameLogs',
          params: {
            playerId: params.brefId,
            startDate: params.gameDate,
            endDate: params.gameDate,
          },
        });
        return;
      }
      onPlayerPress(params);
    },
    [router, onPlayerPress],
  );
  const configChips = buildLeagueConfigChips(league);
  // IDP is a paid-tier draft setting (see the "IDP" Premium Configuration
  // chip below) that directly changes the player pool at draft time, so a
  // free viewer joining an IDP draft gets no client-side signal that the
  // draft they're entering uses a premium format (FLD-052 / LS-6304).
  // Auction drafts are the same kind of paid-tier signal (ENTITLEMENTS.
  // auction_draft) and get the same treatment (LS-9617).
  const draftHasPremiumSettings =
    (isFootball && league.defensiveFormat === 'idp') ||
    league.selectionMethod === 'auction';

  const stats = [
    { label: 'Teams', value: String(rankedStandings.length || '—') },
    { label: 'Roster Size', value: String(league.maxRosterSize ?? '—') },
    ...(isFootball
      ? [
          {
            label: 'Weeks / Season',
            value: String(league.totalMatchups ?? '—'),
          },
        ]
      : []),
    {
      label: 'Games / Matchup',
      value: String(league.gamesPerMatchup ?? '—'),
    },
    isFootball
      ? { label: 'Format', value: 'H2H' }
      : { label: 'Matchup', value: '7 days' },
    { label: 'My Starters', value: String(startersCount) },
  ];

  return (
    <ScrollView
      refreshControl={refreshControl}
      contentContainerStyle={{ paddingBottom: bottomInset + 24 }}
    >
      <YStack padding="$3" gap="$5">
        {/* Draft Live / Paused Banner */}
        {isDrafting ? (
          <OverviewBanner
            kind={isPaused ? 'gold' : 'live'}
            title={isPaused ? 'Draft Paused' : 'Draft Is Live'}
            sub={
              isPaused
                ? 'The draft is paused. Return to the draft room when you’re ready to resume.'
                : 'Join the draft room to make your picks.'
            }
            actions={
              <YStack alignItems="flex-end" gap="$2">
                {!isPremium && draftHasPremiumSettings ? (
                  <Chip label="Premium Draft Settings" tone="gold" size="sm" />
                ) : null}
                <Button
                  size="$3"
                  backgroundColor={isPaused ? BRAND_GOLD : BRAND_SEAM_RED}
                  color="white"
                  onPress={onJoinDraft}
                >
                  {isPaused ? 'Return to Draft Room' : 'Join Draft'}
                </Button>
              </YStack>
            }
          />
        ) : null}

        {/* Commissioner Announcement */}
        {league.lmNotes ? (
          <OverviewBanner
            kind="gold"
            title="Commissioner Announcement"
            sub={league.lmNotes}
          />
        ) : null}

        {/* Snapshot Stats — one unified stat strip (hairline-divided columns)
            instead of a standalone gray card, matching the web `ls-snapshot`
            treatment. */}
        <PanelCard padding="$0" overflow="hidden">
          <XStack flexWrap="wrap">
            {stats.map((stat, idx) => (
              <YStack
                key={stat.label}
                width="33.33%"
                paddingVertical="$4"
                paddingHorizontal="$2"
                alignItems="center"
                gap="$1"
                borderRightWidth={
                  idx % 3 === 2 || idx === stats.length - 1 ? 0 : 1
                }
                borderColor="$surfacePanelBorder"
              >
                <Text
                  fontFamily="$heading"
                  fontWeight="800"
                  fontSize={22}
                  color="$color"
                  fontVariant={['tabular-nums']}
                >
                  {stat.value}
                </Text>
                <Text
                  fontFamily="$heading"
                  fontWeight="700"
                  fontSize={10}
                  letterSpacing={1.1}
                  textTransform="uppercase"
                  color="$textMuted"
                  textAlign="center"
                >
                  {stat.label}
                </Text>
              </YStack>
            ))}
          </XStack>
        </PanelCard>

        {/* Quick Standings */}
        {rankedStandings.length > 0 ? (
          <OverviewSection
            title="Standings"
            sub={`Top ${Math.min(6, rankedStandings.length)}${
              league.currentWeekNumber
                ? ` · Week ${league.currentWeekNumber}`
                : ''
            }`}
            right={
              <Button size="$2" chromeless onPress={onViewAllStandings}>
                <Text fontSize="$2" color="$brandGoldLight">
                  View All →
                </Text>
              </Button>
            }
          >
            <YStack gap="$1">
              {rankedStandings.slice(0, 6).map((row) => {
                const canPress = row.teamId != null && onTeamPress != null;
                const rowContent = (
                  <XStack
                    paddingVertical="$2"
                    paddingHorizontal="$2"
                    alignItems="center"
                    gap="$2"
                    backgroundColor={
                      row.isMine ? '$surfaceInteractive' : 'transparent'
                    }
                    borderRadius="$3"
                    pressStyle={canPress ? { opacity: 0.7 } : undefined}
                  >
                    <Text
                      fontSize="$2"
                      fontWeight="700"
                      color="$gray10"
                      width={20}
                      textAlign="center"
                    >
                      {row.rank}
                    </Text>
                    <Text
                      fontSize="$3"
                      flex={1}
                      fontWeight={row.isMine ? '700' : '400'}
                      color="$color"
                    >
                      {row.name}
                    </Text>
                    <Text
                      fontSize="$2"
                      color="$gray11"
                      fontVariant={['tabular-nums']}
                    >
                      {row.record}
                    </Text>
                  </XStack>
                );
                // Interaction lives on a plain RN Pressable, not the Tamagui
                // XStack — matching the row-press pattern already
                // established elsewhere in this app (LS-5446): onPress/
                // testID/accessibility props on a bare styled Stack aren't
                // reliably forwarded to the underlying host element.
                return canPress ? (
                  <Pressable
                    key={row.teamId}
                    testID={`overview-standings-row-${row.teamId}`}
                    onPress={() => onTeamPress?.(row.teamId as number)}
                    accessibilityRole="button"
                    accessibilityLabel={`View team ${row.name}`}
                  >
                    {rowContent}
                  </Pressable>
                ) : (
                  <React.Fragment key={row.teamId ?? row.rank}>
                    {rowContent}
                  </React.Fragment>
                );
              })}
            </YStack>
            {rankedStandings.length > 6 ? (
              <Text fontSize="$2" color="$textMuted" textAlign="center">
                + {rankedStandings.length - 6} more teams
              </Text>
            ) : null}
          </OverviewSection>
        ) : null}

        {/* Scoring Summary — parity with web v2 Overview. Baseball only; the
            football screen omits the (baseball-specific) scoring props. */}
        {scoringSettings ? (
          <OverviewSection
            title="Scoring Rules"
            sub="How points are calculated"
          >
            <LeagueScoringSummary
              loading={scoringLoading ?? false}
              error={scoringError ?? null}
              profileName={scoringProfileName ?? 'Default'}
              settings={scoringSettings}
            />
          </OverviewSection>
        ) : null}

        {/* Scoring Rules (football) — read-only card for every member, not
            just the commissioner (LS-6327). Football's scoring editor was
            previously commissioner-only, leaving non-commissioner members
            with no way to see how points are calculated on native. */}
        {isFootball && footballScoringProfile !== undefined ? (
          <OverviewSection
            title="Scoring Rules"
            sub="How points are calculated"
          >
            <LeagueScoringReadOnly
              profile={footballScoringProfile}
              loading={footballScoringLoading ?? false}
              error={footballScoringError ?? null}
              sport={Sport.Football}
              defensiveFormat={footballDefensiveFormat}
            />
          </OverviewSection>
        ) : null}

        {/* League Chat is intentionally retained as its own native full-screen
            tab rather than embedded here. The native LeagueChatTab is a
            KeyboardAvoidingView with its own ScrollView and a sticky composer
            (a different contract from web's embeddable chat variant); nesting
            it inside this Overview ScrollView would break message scrolling and
            keyboard handling. Web embeds chat because it has no separate tab;
            native already exposes Chat from the league tab bar. (LS-7812) */}

        {/* League Dues Payment Status — already renders its own bordered
            surface, so it is not re-wrapped in an OverviewSection here.
            Members-only: dues totals and payment CTAs are billing data that
            spectators (non-members) must not see (LS-6325). */}
        {isMember ? (
          <LeagueDuesPaymentStatus
            leagueId={leagueId}
            isCommissioner={isCommissioner}
            onSuccess={(msg) => Alert.alert('Success', msg)}
            onError={(err) => Alert.alert('Error', err.message)}
          />
        ) : null}

        {/* Activity Feed */}
        <OverviewSection
          title="Recent Activity"
          sub="Trades, waivers, matchups, commissioner actions"
        >
          <LeagueActivityFeed leagueId={leagueId} limit={15} />
        </OverviewSection>

        {/* On This Day — baseball-only content (game-log stats keyed to MLB
            player rows in the shared `players` table); omitted on football
            leagues so a football player never gets routed to a mismatched
            baseball player id (LS-6326). Already renders its own bordered
            surface + header, so it is not re-wrapped in an OverviewSection
            here. */}
        {!isFootball && <OnThisDayFeed onPlayerPress={handleOnThisDayPress} />}

        {/* Premium Configuration — chip summary of active paid features so a
            premium league has a visible anchor for its "what I'm paying for"
            value prop (FLD-007). Placed alongside Invite Friends since both
            are ownership-flavored, low-frequency-interaction cards. */}
        {configChips.length > 0 ? (
          <OverviewSection
            title="Premium Configuration"
            sub="Paid features active in this league"
          >
            <XStack flexWrap="wrap" gap="$2">
              {configChips.map((label) => (
                <Chip key={label} label={label} tone="gold" />
              ))}
            </XStack>
          </OverviewSection>
        ) : null}

        {/* Invite (commissioner only) */}
        {isCommissioner ? (
          <OverviewSection
            title="Invite Friends"
            sub="Share your league with new managers"
            right={
              <Button
                size="$3"
                backgroundColor="$brandNavyLight"
                color="white"
                onPress={onInviteShare}
              >
                Share
              </Button>
            }
          >
            {inviteCode ? (
              <YStack gap="$2">
                <Text
                  fontFamily="$heading"
                  fontWeight="700"
                  fontSize={10}
                  textTransform="uppercase"
                  letterSpacing={1.1}
                  color="$textMuted"
                >
                  Invite Code
                </Text>
                <YStack
                  backgroundColor="$surfaceCard"
                  borderWidth={1}
                  borderColor="$glassBorder"
                  borderRadius="$4"
                  padding="$3"
                  alignItems="center"
                >
                  <Text
                    fontSize="$6"
                    fontWeight="800"
                    letterSpacing={4}
                    fontFamily="$mono"
                    color="$color"
                  >
                    {inviteCode}
                  </Text>
                </YStack>
              </YStack>
            ) : null}
          </OverviewSection>
        ) : null}
      </YStack>
    </ScrollView>
  );
}
