import React, { useMemo, useState } from 'react';
import type { RefreshControlProps } from 'react-native';
import { Alert, ScrollView } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import {
  BrandIcon,
  type BrandIconName,
  Chip,
  getDraftStatusChipDef,
  LeagueActivityFeed,
  PanelCard,
} from '@legacy-sports/shared-components';
// Design-system MatchupCard (LS-4719) is intentionally not re-exported from
// the root barrel (name collision with features/matchup's raw-fragment
// MatchupCard) — its only public export path is the `/ui` entry.
import { MatchupCard } from '@legacy-sports/shared-components/ui';
import {
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  GRADIENT_NAVY,
  withAlpha,
} from '@legacy-sports/shared-components/utils';
import type { AppMatchupFragment } from '@legacy-sports/graphql';
import { MatchupStatus } from '@legacy-sports/graphql';
import { LeagueDuesPaymentStatus } from '../commissioner/LeagueDuesPaymentStatus';

export interface RankedStanding {
  rank: number;
  teamId: number | null;
  name: string;
  record: string;
  isMine: boolean;
}

export interface NextAction {
  headline: string;
  body: string;
  ctaLabel: string;
  trailingNote?: string;
  onPress: () => void;
}

interface GuidedHomeLeague {
  name: string;
  scoringLabel: string;
  draftStatus?: string | null;
  currentWeekNumber?: number | null;
  totalMatchups?: number | null;
}

interface NavTileDef {
  id: string;
  label: string;
  icon: BrandIconName;
  badge?: number;
}

export interface LeagueGuidedHomeTabProps {
  league: GuidedHomeLeague;
  leagueId: number;
  teamCount: number;
  isCommissioner: boolean;
  waiverEnabled?: boolean | null;
  /**
   * Neither the compact header nor the commissioner-only Settings screen
   * (`CommissionerScreen`) has an invite affordance today — retaining this
   * panel (commissioner-only, same as the pre-redesign Overview tab) is the
   * only way commissioners can still invite new members from League Home.
   */
  inviteCode: string;
  onInviteShare: () => void;
  rankedStandings: RankedStanding[];
  userTeamId: number | null | undefined;
  /** Already fetched by the parent screen; user's matchup sorted first. */
  matchups: readonly AppMatchupFragment[];
  pendingTradeCount: number;
  chatUnreadCount: number;
  /** Highest-priority action, or `null` to hide the "Up next" card entirely. */
  nextAction: NextAction | null;
  /**
   * Dues are unpaid for the viewer and the "Up next" CTA has been pressed —
   * surfaces the (removed-from-home) League Dues panel inline, per the design
   * doc's "surfaces via Up next when action needed" rule.
   */
  showDuesPanel: boolean;
  onNavigateTab: (tabId: string) => void;
  onMatchupPress: (matchupId: number) => void;
  /** Pull-to-refresh control for the tab's `ScrollView` (LS-8847). */
  refreshControl?: React.ReactElement<RefreshControlProps>;
}

// ─── Matchup mapping ──────────────────────────────────────────────────────────

function statusToCardStatus(
  status: MatchupStatus | null | undefined,
): 'live' | 'pre' | 'final' {
  switch (status) {
    case MatchupStatus.InProgress:
      return 'live';
    case MatchupStatus.Completed:
      return 'final';
    default:
      return 'pre';
  }
}

interface MatchupCardData {
  away: { name: string; record?: string; score?: number };
  home: { name: string; record?: string; score?: number };
  status: 'live' | 'pre' | 'final' | 'bye';
  week?: string;
  footerRight?: string;
  footerRightSuccess?: boolean;
  noOpponent?: boolean;
  matchupId: number | null;
}

function teamLookup(
  rankedStandings: readonly RankedStanding[],
  teamId: number | null,
) {
  if (teamId == null) return undefined;
  return rankedStandings.find((s) => s.teamId === teamId);
}

/**
 * Finds the user's current-week matchup and maps it to the design-system
 * `MatchupCard`'s props. Team names/records come from `rankedStandings`
 * (already fetched by the parent) — `AppMatchupFragment` only carries team
 * ids, not names, so no new GraphQL is needed. Returns `null` when the viewer
 * has no team (spectator) — the whole matchup section is hidden in that case.
 */
function buildMatchupCardData(
  matchups: readonly AppMatchupFragment[],
  userTeamId: number | null | undefined,
  currentWeekNumber: number | null | undefined,
  rankedStandings: readonly RankedStanding[],
): MatchupCardData | null {
  if (userTeamId == null) return null;

  const current = matchups.find(
    (m) =>
      m.weekNumber === currentWeekNumber &&
      (m.team1Id === userTeamId || m.team2Id === userTeamId),
  );

  const weekLabel =
    currentWeekNumber != null ? `WK ${currentWeekNumber}` : undefined;
  const me = teamLookup(rankedStandings, userTeamId);

  if (!current) {
    // No matchup this week for the viewer's team — bye.
    return {
      away: { name: me?.name ?? 'Your team', record: me?.record },
      home: { name: '' },
      status: 'bye',
      week: weekLabel,
      noOpponent: true,
      matchupId: null,
    };
  }

  const userIsTeam1 = current.team1Id === userTeamId;
  const oppTeamId = userIsTeam1 ? current.team2Id : current.team1Id;
  const userScore = userIsTeam1 ? current.team1Score : current.team2Score;
  const oppScore = userIsTeam1 ? current.team2Score : current.team1Score;
  const opponent = teamLookup(rankedStandings, oppTeamId ?? null);

  const status = statusToCardStatus(current.status);
  let footerRight: string | undefined;
  let footerRightSuccess = false;
  if (
    (status === 'live' || status === 'final') &&
    userScore != null &&
    oppScore != null
  ) {
    const diff = userScore - oppScore;
    footerRightSuccess = diff > 0;
    footerRight =
      diff === 0
        ? 'Tied'
        : `You ${diff > 0 ? 'lead' : 'trail'} by ${Math.abs(diff).toFixed(1)}`;
  }

  return {
    away: {
      name: me?.name ?? 'Your team',
      record: me?.record,
      score: userScore ?? undefined,
    },
    home: {
      name: opponent?.name ?? 'Opponent',
      record: opponent?.record,
      score: oppScore ?? undefined,
    },
    status,
    week: weekLabel,
    footerRight,
    footerRightSuccess,
    matchupId: current.id != null ? Number(current.id) : null,
  };
}

// ─── Standings window ─────────────────────────────────────────────────────────

/**
 * Windows `rankedStandings` down to at most 3 rows for the peek: the leader
 * (always included), the viewer's row, and the team behind — clamped at the
 * top/bottom of the table. Falls back to the top 3 rows for a spectator with
 * no team of their own.
 */
export function computeStandingsWindow(
  rankedStandings: readonly RankedStanding[],
): RankedStanding[] {
  const n = rankedStandings.length;
  if (n === 0) return [];
  const myIndex = rankedStandings.findIndex((r) => r.isMine);
  const size = Math.min(3, n);
  if (myIndex === -1) return rankedStandings.slice(0, size);

  // [rank-1, you, rank+1], clamped so the window never runs past either edge
  // of the table.
  const start = Math.max(0, Math.min(myIndex - 1, n - size));
  const window = rankedStandings.slice(start, start + size);

  // Leader must always be visible. If it's not already in the window, swap
  // it into the first slot — replacing "team ahead" with the leader, which
  // is exactly the [leader, you, team behind] shape the design calls for
  // once the viewer is more than one rank from the top.
  if (window[0]?.rank !== 1) {
    window[0] = rankedStandings[0];
  }
  return window;
}

// ─── Header ───────────────────────────────────────────────────────────────────

function CompactHeader({
  league,
  teamCount,
}: {
  league: GuidedHomeLeague;
  teamCount: number;
}): React.JSX.Element {
  const chipDef = getDraftStatusChipDef(league.draftStatus);
  const subLine = [
    league.currentWeekNumber != null && league.totalMatchups != null
      ? `Week ${league.currentWeekNumber} of ${league.totalMatchups}`
      : null,
    teamCount > 0 ? `${teamCount} teams` : null,
    league.scoringLabel,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <XStack alignItems="center" gap={12}>
      <YStack
        width={44}
        height={44}
        borderRadius={12}
        backgroundColor="$brandNavy"
        borderWidth={1}
        borderColor={withAlpha(BRAND_GOLD, 0.45)}
        alignItems="center"
        justifyContent="center"
        flexShrink={0}
        style={{ backgroundImage: GRADIENT_NAVY }}
      >
        <BrandIcon name="baseball" size={24} color={BRAND_GOLD_LIGHT} />
      </YStack>
      <YStack flex={1} minWidth={0} gap={2}>
        <Text
          fontFamily="$heading"
          fontWeight="800"
          fontSize={22}
          lineHeight={24}
          color="$color"
          numberOfLines={1}
        >
          {league.name}
        </Text>
        {subLine ? (
          <Text fontFamily="$body" fontSize={12} color="$textMuted">
            {subLine}
          </Text>
        ) : null}
      </YStack>
      {chipDef ? (
        <Chip
          tone={chipDef.tone}
          label={chipDef.tone === 'active' ? 'Active' : chipDef.label}
        />
      ) : null}
    </XStack>
  );
}

// ─── Up next card ─────────────────────────────────────────────────────────────

function UpNextCard({ action }: { action: NextAction }): React.JSX.Element {
  return (
    <YStack
      backgroundColor={withAlpha(BRAND_GOLD, 0.08)}
      borderWidth={1}
      borderColor={withAlpha(BRAND_GOLD, 0.4)}
      borderRadius={16}
      padding={16}
      gap={10}
    >
      <Text
        fontFamily="$heading"
        fontWeight="700"
        fontSize={11}
        letterSpacing={1.4}
        textTransform="uppercase"
        color={BRAND_GOLD_LIGHT}
      >
        Up next for you
      </Text>
      <Text
        fontFamily="$body"
        fontWeight="600"
        fontSize={15}
        lineHeight={22}
        color="$color"
      >
        {action.headline}
      </Text>
      <Text
        fontFamily="$body"
        fontSize={13}
        lineHeight={19.5}
        color="$textMuted"
      >
        {action.body}
      </Text>
      <XStack alignItems="center" gap={10} marginTop={2}>
        <XStack
          tag="button"
          role="button"
          tabIndex={0}
          accessibilityRole="button"
          accessibilityLabel={action.ctaLabel}
          backgroundColor={BRAND_GOLD}
          borderRadius={12}
          paddingVertical={11}
          paddingHorizontal={18}
          pressStyle={{ scale: 0.97 }}
          animation="quick"
          onPress={action.onPress}
        >
          <Text
            fontFamily="$heading"
            fontWeight="700"
            fontSize={12}
            letterSpacing={0.96}
            textTransform="uppercase"
            color="$textOnGold"
          >
            {action.ctaLabel}
          </Text>
        </XStack>
        {action.trailingNote ? (
          <Text fontSize={12} color="$fg4">
            {action.trailingNote}
          </Text>
        ) : null}
      </XStack>
    </YStack>
  );
}

// ─── Nav tile grid ────────────────────────────────────────────────────────────

function NavTile({
  tile,
  onPress,
}: {
  tile: NavTileDef;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <YStack
      flex={1}
      backgroundColor="$surfacePanel"
      borderWidth={1}
      borderColor="$surfacePanelBorder"
      borderRadius={16}
      paddingVertical={14}
      paddingHorizontal={8}
      alignItems="center"
      gap={8}
      position="relative"
      minHeight={44}
      role="button"
      tabIndex={0}
      accessibilityRole="button"
      accessibilityLabel={tile.label}
      pressStyle={{
        borderColor: '$brandNavyLight',
        backgroundColor: '$backgroundHover',
      }}
      animation="quick"
      onPress={onPress}
    >
      <BrandIcon name={tile.icon} size={24} color={BRAND_GOLD_LIGHT} />
      <Text
        fontFamily="$heading"
        fontWeight="700"
        fontSize={11}
        letterSpacing={1.1}
        textTransform="uppercase"
        color="$fg2"
      >
        {tile.label}
      </Text>
      {tile.badge != null && tile.badge > 0 ? (
        <XStack
          position="absolute"
          top={8}
          right={10}
          minWidth={16}
          height={16}
          paddingHorizontal={4}
          borderRadius={9999}
          backgroundColor={tile.id === 'chat' ? BRAND_GOLD : '$brandSeamRed'}
          alignItems="center"
          justifyContent="center"
        >
          <Text
            fontFamily="$mono"
            fontSize={10}
            fontWeight="700"
            color={tile.id === 'chat' ? '$textOnGold' : 'white'}
          >
            {tile.badge}
          </Text>
        </XStack>
      ) : null}
    </YStack>
  );
}

function NavTileGrid({
  tiles,
  onNavigateTab,
}: {
  tiles: NavTileDef[];
  onNavigateTab: (tabId: string) => void;
}): React.JSX.Element {
  const rows: NavTileDef[][] = [];
  for (let i = 0; i < tiles.length; i += 3) rows.push(tiles.slice(i, i + 3));

  return (
    <YStack gap={10}>
      {rows.map((row) => (
        <XStack key={row[0]?.id ?? 'row'} gap={10}>
          {row.map((tile) => (
            <NavTile
              key={tile.id}
              tile={tile}
              onPress={() => onNavigateTab(tile.id)}
            />
          ))}
        </XStack>
      ))}
    </YStack>
  );
}

// ─── Standings peek ───────────────────────────────────────────────────────────

function StandingsPeek({
  rankedStandings,
  teamCount,
  onViewAllStandings,
}: {
  rankedStandings: RankedStanding[];
  teamCount: number;
  onViewAllStandings: () => void;
}): React.JSX.Element | null {
  const windowRows = useMemo(
    () => computeStandingsWindow(rankedStandings),
    [rankedStandings],
  );
  if (windowRows.length === 0) return null;

  const myRow = rankedStandings.find((r) => r.isMine);

  return (
    <PanelCard borderRadius={16} padding={16}>
      <YStack gap={10}>
        <XStack justifyContent="space-between" alignItems="baseline">
          <Text
            fontFamily="$heading"
            fontWeight="800"
            fontSize={16}
            color="$color"
          >
            {myRow
              ? `You're ${myRow.rank}${ordinalSuffix(myRow.rank)} of ${teamCount}`
              : 'Standings'}
          </Text>
          <Text
            fontSize={12}
            color="$brandGoldLight"
            onPress={onViewAllStandings}
            role="button"
            tabIndex={0}
          >
            Standings →
          </Text>
        </XStack>
        <YStack gap={2}>
          {windowRows.map((row) => (
            <XStack
              key={row.teamId ?? row.rank}
              alignItems="center"
              gap={8}
              paddingVertical={6}
              paddingHorizontal={8}
              backgroundColor={
                row.isMine ? '$surfaceInteractive' : 'transparent'
              }
              borderRadius={10}
            >
              <Text
                fontSize={12}
                fontWeight="700"
                color={row.isMine ? '$brandGoldLight' : '$fg4'}
                width={18}
                textAlign="center"
              >
                {row.rank}
              </Text>
              <Text
                fontSize={13}
                fontWeight={row.isMine ? '600' : '400'}
                color={row.isMine ? '$color' : '$fg2'}
                flex={1}
              >
                {row.name}
              </Text>
              <Text
                fontSize={12}
                color="$textMuted"
                fontVariant={['tabular-nums']}
              >
                {row.record}
              </Text>
            </XStack>
          ))}
        </YStack>
      </YStack>
    </PanelCard>
  );
}

function ordinalSuffix(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return 'th';
  switch (n % 10) {
    case 1:
      return 'st';
    case 2:
      return 'nd';
    case 3:
      return 'rd';
    default:
      return 'th';
  }
}

// ─── Invite Friends (commissioner only) ──────────────────────────────────────

function InviteFriendsPanel({
  inviteCode,
  onInviteShare,
}: {
  inviteCode: string;
  onInviteShare: () => void;
}): React.JSX.Element | null {
  if (!inviteCode) return null;
  return (
    <PanelCard borderRadius={16} padding={16}>
      <YStack gap={12}>
        <XStack justifyContent="space-between" alignItems="flex-start" gap={12}>
          <YStack flex={1} gap={4} minWidth={0}>
            <Text
              fontFamily="$heading"
              fontWeight="800"
              fontSize={17}
              color="$color"
            >
              Invite Friends
            </Text>
            <Text fontSize={13} color="$textMuted">
              Share your league with new managers
            </Text>
          </YStack>
          <XStack
            tag="button"
            role="button"
            tabIndex={0}
            accessibilityRole="button"
            accessibilityLabel="Share"
            backgroundColor="$brandNavyLight"
            borderRadius={10}
            paddingVertical={9}
            paddingHorizontal={16}
            onPress={onInviteShare}
          >
            <Text color="white" fontWeight="600" fontSize={13}>
              Share
            </Text>
          </XStack>
        </XStack>
        <YStack
          backgroundColor="$surfaceCard"
          borderWidth={1}
          borderColor="$glassBorder"
          borderRadius={12}
          padding={12}
          alignItems="center"
        >
          <Text
            fontFamily="$mono"
            fontSize={20}
            fontWeight="800"
            letterSpacing={4}
            color="$color"
          >
            {inviteCode}
          </Text>
        </YStack>
      </YStack>
    </PanelCard>
  );
}

// ─── Activity condensed ───────────────────────────────────────────────────────

function ActivityCondensed({
  leagueId,
}: {
  leagueId: number;
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);
  return (
    <PanelCard borderRadius={16} padding={16}>
      <YStack gap={8}>
        <XStack justifyContent="space-between" alignItems="baseline">
          <Text
            fontFamily="$heading"
            fontWeight="800"
            fontSize={16}
            color="$color"
          >
            Around the league
          </Text>
          <Text
            fontSize={12}
            color="$brandGoldLight"
            role="button"
            tabIndex={0}
            onPress={() => setExpanded((v) => !v)}
          >
            {expanded ? 'Show less' : 'See all →'}
          </Text>
        </XStack>
        <LeagueActivityFeed leagueId={leagueId} limit={expanded ? 15 : 3} />
      </YStack>
    </PanelCard>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

const BASE_TILES: NavTileDef[] = [
  { id: 'roster', label: 'Roster', icon: 'roster' },
  { id: 'matchups', label: 'Matchups', icon: 'matchup' },
  { id: 'standings', label: 'Standings', icon: 'standings' },
  { id: 'trades', label: 'Trades', icon: 'zap' },
  { id: 'chat', label: 'Chat', icon: 'message' },
  { id: 'history', label: 'History', icon: 'award' },
];

export function LeagueGuidedHomeTab({
  league,
  leagueId,
  teamCount,
  isCommissioner,
  waiverEnabled,
  inviteCode,
  onInviteShare,
  rankedStandings,
  userTeamId,
  matchups,
  pendingTradeCount,
  chatUnreadCount,
  nextAction,
  showDuesPanel,
  onNavigateTab,
  onMatchupPress,
  refreshControl,
}: LeagueGuidedHomeTabProps): React.JSX.Element {
  const matchupData = useMemo(
    () =>
      buildMatchupCardData(
        matchups,
        userTeamId,
        league.currentWeekNumber,
        rankedStandings,
      ),
    [matchups, userTeamId, league.currentWeekNumber, rankedStandings],
  );
  // Hoisted so the JSX below can narrow to `number` without a cast — a
  // property access (`matchupData.matchupId`) doesn't narrow across the
  // closure passed to `onPress`, but a local `const` does.
  const matchupIdToOpen = matchupData?.matchupId ?? null;

  const tiles = useMemo(() => {
    const withBadges = BASE_TILES.map((t) => {
      if (t.id === 'trades') return { ...t, badge: pendingTradeCount };
      if (t.id === 'chat') return { ...t, badge: chatUnreadCount };
      return t;
    });
    const list = [...withBadges];
    if (waiverEnabled) {
      const tradesIdx = list.findIndex((t) => t.id === 'trades');
      list.splice(tradesIdx + 1, 0, {
        id: 'waivers',
        label: 'Waivers',
        icon: 'zap',
      });
    }
    if (isCommissioner) {
      list.push({ id: 'commissioner', label: 'Settings', icon: 'settings' });
    }
    return list;
  }, [pendingTradeCount, chatUnreadCount, waiverEnabled, isCommissioner]);

  return (
    <ScrollView refreshControl={refreshControl}>
      <YStack padding={16} paddingTop={20} gap={18}>
        <CompactHeader league={league} teamCount={teamCount} />

        {nextAction ? <UpNextCard action={nextAction} /> : null}

        {showDuesPanel ? (
          <LeagueDuesPaymentStatus
            leagueId={leagueId}
            isCommissioner={isCommissioner}
            onSuccess={(msg) => Alert.alert('Success', msg)}
            onError={(err) => Alert.alert('Error', err.message)}
          />
        ) : null}

        {matchupData ? (
          <MatchupCard
            away={matchupData.away}
            home={matchupData.home}
            status={matchupData.status}
            week={matchupData.week}
            noOpponent={matchupData.noOpponent}
            footerRight={matchupData.footerRight}
            footerRightSuccess={matchupData.footerRightSuccess}
            onPress={
              matchupIdToOpen != null
                ? () => onMatchupPress(matchupIdToOpen)
                : undefined
            }
          />
        ) : null}

        <NavTileGrid tiles={tiles} onNavigateTab={onNavigateTab} />

        <StandingsPeek
          rankedStandings={rankedStandings}
          teamCount={teamCount}
          onViewAllStandings={() => onNavigateTab('standings')}
        />

        <ActivityCondensed leagueId={leagueId} />

        {isCommissioner ? (
          <InviteFriendsPanel
            inviteCode={inviteCode}
            onInviteShare={onInviteShare}
          />
        ) : null}
      </YStack>
    </ScrollView>
  );
}
