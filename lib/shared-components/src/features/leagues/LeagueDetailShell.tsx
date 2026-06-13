import React from 'react';
import { Platform } from 'react-native';
import { ScrollView, Text, XStack, YStack } from 'tamagui';
import { Chip, type ChipTone } from '../../components/Chip';
import { Select } from '../../components/Select';
import { BrandIcon, type BrandIconName } from '../../components/icons';
import {
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  BRAND_NAVY,
  BRAND_NAVY_DARK,
  BRAND_SEAM_RED_LIGHT,
  OUTLINE_SUBTLE,
  PANEL_BORDER,
  type Sport,
  SURFACE_CARD,
  SURFACE_PANEL,
  WHITE,
  withAlpha,
} from '../../utils/colors';

// ─── Foreground tokens (mirror the web league-detail-v2 CSS variables so the
// extracted chrome renders identically on desktop) ───────────────────────────
const FG1 = '#F8FAFC';
const FG1_STRONG = '#FFFFFF';
const FG2 = '#DEE6FF';
const FG3 = '#9CAAC5';
const FG4 = '#6C80BA';

// ─── Public types ────────────────────────────────────────────────────────────

/** View-as role within a league. Persisted by the consumer (e.g. localStorage). */
export type LeagueRole = 'commish' | 'member' | 'spectator';

export interface HeroLeague {
  name: string;
  /** Active scoring profile label, e.g. "Standard 5x5". */
  scoringLabel: string;
  /** Optional era / career-filter eyebrow, e.g. "All-Time". */
  era?: string | null;
  /** Raw draft status string (pre-draft, queued, drafting, active, …). */
  draftStatus?: string | null;
  currentWeek?: number | null;
  totalMatchups?: number | null;
  teamCount?: number | null;
  inviteCode?: string | null;
}

export interface SeasonOption {
  value: string;
  label: string;
}

export interface LeagueTabDef {
  id: string;
  label: string;
  /** Only visible to members (and commissioners). */
  memberOnly?: boolean;
  /** Only visible to the commissioner. */
  commishOnly?: boolean;
}

export interface LeagueDetailShellProps {
  sport: Sport;
  league: HeroLeague;

  // Role / season — kept for backwards compatibility with existing callers
  // (LeagueRoleBar was removed so these are no longer consumed internally).
  role: LeagueRole;
  onRoleChange?: (role: LeagueRole) => void;
  season?: string;
  onSeasonChange?: (season: string) => void;
  seasons?: readonly SeasonOption[];

  // Permissions — ground-truth booleans. The hero "Commissioner" chip and the
  // permission-gated tabs use the *effective* perms derived from `role`
  // (so a commissioner viewing as a member sees the member-scoped chrome).
  isCommissioner: boolean;
  isMember?: boolean;

  // Tab bar
  tabs: readonly LeagueTabDef[];
  activeTab: string;
  onTabChange: (tab: string) => void;
  pendingTradeCount?: number;
  onAnalytics?: () => void;

  // Hero actions
  onBack: () => void;
  onInvite?: () => void;

  /** Tab content rendered below the chrome (inside the centered page column). */
  children?: React.ReactNode;

  /**
   * Fill the available height with a flex layout so a single scrollable child
   * (e.g. a native tab's `ScrollView`) can size itself. Native screens pass
   * this; web relies on natural document scroll, so it defaults to `false`.
   */
  fill?: boolean;

  /**
   * Web-only escape hatches: the league-detail-v2 stylesheet is scoped under
   * `.ls-root` and the page column under `.ls-page`. Passing these class names
   * keeps the page background gradient and child-panel CSS-variable scope
   * intact when web adopts the shell. Native ignores `className`.
   */
  className?: string;
  pageClassName?: string;
}

// ─── Draft status chip ───────────────────────────────────────────────────────

export interface DraftStatusChipDef {
  tone: ChipTone;
  label: string;
}

/**
 * Map a raw league draft status to the chip tone + label shown in the hero.
 * Exported as a pure helper so the mapping can be unit-tested (and reused)
 * without rendering the animated `live` chip.
 */
export function getDraftStatusChipDef(
  status?: string | null,
): DraftStatusChipDef | null {
  if (!status) return null;
  switch (status) {
    case 'pre-draft':
    case 'not-started':
      return { tone: 'pre', label: 'Pre-Draft' };
    case 'queued':
      return { tone: 'soon', label: 'Draft Queued' };
    case 'drafting':
    case 'in-progress':
      // `live` tone auto-renders the pulsing dot.
      return { tone: 'live', label: 'Drafting · Live' };
    case 'active':
    case 'completed':
      return { tone: 'active', label: 'Season Active' };
    default:
      return { tone: 'fin', label: status };
  }
}

export function LeagueDraftStatusChip({
  status,
}: {
  status?: string | null;
}): React.JSX.Element | null {
  const def = getDraftStatusChipDef(status);
  if (!def) return null;
  // Preserve the web e2e contract: the league-detail specs locate this badge via
  // `data-testid="draft-status-chip"`. The testid is applied to the chip's inner
  // label <Text> (via `labelTestID`), not the wrapping XStack — Tamagui forwards
  // `data-*` to the DOM on a `Text` host (the `league-title` heading relies on
  // the same behaviour) but NOT on the styled `XStack`, so a wrapper-level
  // `data-testid` was silently dropped and season-renewal-core /
  // websocket-realtime found no chip (LS-7845). Inert on native.
  return (
    <Chip tone={def.tone} label={def.label} labelTestID="draft-status-chip" />
  );
}

// ─── Hero ────────────────────────────────────────────────────────────────────

const HERO_GRADIENT =
  'linear-gradient(135deg, rgba(27, 58, 92, 0.55) 0%, rgba(17, 27, 47, 0.85) 60%, rgba(20, 48, 80, 0.75) 100%), radial-gradient(ellipse at 85% 0%, rgba(197, 165, 90, 0.16) 0%, transparent 55%)';
const CREST_GRADIENT = `linear-gradient(135deg, ${BRAND_NAVY} 0%, ${BRAND_NAVY_DARK} 100%)`;

function Eyebrow({
  children,
  color = BRAND_GOLD_LIGHT,
}: {
  children: React.ReactNode;
  color?: string;
}): React.JSX.Element {
  return (
    <Text
      fontFamily="$heading"
      fontWeight="700"
      fontSize={11}
      letterSpacing={1.54}
      textTransform="uppercase"
      color={color}
    >
      {children}
    </Text>
  );
}

export function LeagueDetailHero({
  sport,
  league,
  isCommissioner,
  onBack,
  onInvite,
}: {
  sport: Sport;
  league: HeroLeague;
  isCommissioner: boolean;
  onBack: () => void;
  onInvite?: () => void;
}): React.JSX.Element {
  const sportLabel = sport === 'football' ? 'Football' : 'Baseball';
  const sportIcon: BrandIconName =
    sport === 'football' ? 'football' : 'baseball';

  return (
    <YStack
      backgroundColor={SURFACE_CARD}
      borderWidth={1}
      borderColor={withAlpha(WHITE, 0.08)}
      borderRadius={20}
      paddingVertical={28}
      paddingHorizontal={32}
      overflow="hidden"
      // Web-only rich gradient layer; native falls back to the solid card bg.
      style={{ backgroundImage: HERO_GRADIENT }}
    >
      {/* Top row — back link · sport eyebrow · commissioner chip */}
      <XStack alignItems="center" gap={10} marginBottom={14} flexWrap="wrap">
        <XStack
          tag="button"
          role="button"
          tabIndex={0}
          alignItems="center"
          gap={6}
          paddingVertical={6}
          cursor="pointer"
          hoverStyle={{ opacity: 0.85 }}
          pressStyle={{ opacity: 0.7 }}
          onPress={onBack}
        >
          <BrandIcon
            name="chevron-left"
            size={14}
            color={FG3}
            accentColor={FG3}
          />
          <Text
            fontFamily="$heading"
            fontWeight="700"
            fontSize={12}
            letterSpacing={0.96}
            textTransform="uppercase"
            color={FG3}
          >
            Leagues
          </Text>
        </XStack>
        <Text color={FG4}>·</Text>
        <XStack alignItems="center" gap={6}>
          <BrandIcon
            name={sportIcon}
            size={14}
            color={BRAND_GOLD_LIGHT}
            accentColor={BRAND_SEAM_RED_LIGHT}
          />
          <Eyebrow>
            {sportLabel} · {league.scoringLabel}
          </Eyebrow>
        </XStack>
        {isCommissioner ? (
          <XStack marginLeft="auto">
            <Chip
              tone="pre"
              label="Commissioner"
              leading={
                <BrandIcon
                  name="commissioner"
                  size={12}
                  color={BRAND_GOLD_LIGHT}
                  accentColor={BRAND_GOLD}
                />
              }
            />
          </XStack>
        ) : null}
      </XStack>

      {/* Main row — crest · body · actions */}
      <XStack gap={24} alignItems="flex-start" flexWrap="wrap">
        <YStack
          width={92}
          height={92}
          borderRadius={16}
          backgroundColor={BRAND_NAVY}
          borderWidth={1}
          borderColor={withAlpha(BRAND_GOLD, 0.45)}
          alignItems="center"
          justifyContent="center"
          flexShrink={0}
          style={{ backgroundImage: CREST_GRADIENT }}
        >
          <BrandIcon
            name={sportIcon}
            size={48}
            color={BRAND_GOLD_LIGHT}
            accentColor={BRAND_SEAM_RED_LIGHT}
          />
        </YStack>

        <YStack flex={1} minWidth={280} gap={10}>
          <Text
            // Render as an <h1> on web: preserves the page's single
            // heading-level-1 (a11y heading hierarchy + e2e selectors). `tag`
            // is a no-op on native. data-testid kept for e2e parity.
            tag="h1"
            {...{ 'data-testid': 'league-title' }}
            fontFamily="$heading"
            fontWeight="800"
            fontSize={40}
            lineHeight={40}
            letterSpacing={-0.8}
            margin={0}
            color={FG1_STRONG}
          >
            {league.name}
          </Text>
          <XStack gap={8} flexWrap="wrap" alignItems="center">
            <LeagueDraftStatusChip status={league.draftStatus} />
            {league.era ? (
              <Text fontFamily="$body" fontSize={13} color={FG3}>
                {league.era}
              </Text>
            ) : null}
          </XStack>
          <XStack gap={20} marginTop={4} flexWrap="wrap">
            {league.currentWeek != null ? (
              <HeroMetaItem label="Week">
                {String(league.currentWeek)}
                {league.totalMatchups != null ? (
                  <Text color={FG3} fontWeight="400">
                    {' '}
                    / {league.totalMatchups}
                  </Text>
                ) : null}
              </HeroMetaItem>
            ) : null}
            {league.teamCount != null ? (
              <HeroMetaItem label="Teams">
                {String(league.teamCount)}
              </HeroMetaItem>
            ) : null}
            <HeroMetaItem label="Scoring">{league.scoringLabel}</HeroMetaItem>
            {league.inviteCode ? (
              <HeroMetaItem label="Invite" valueColor={BRAND_GOLD_LIGHT}>
                {league.inviteCode}
              </HeroMetaItem>
            ) : null}
          </XStack>
        </YStack>

        {onInvite ? (
          <XStack flexShrink={0}>
            <XStack
              tag="button"
              role="button"
              tabIndex={0}
              alignItems="center"
              gap={8}
              paddingVertical={10}
              paddingHorizontal={18}
              borderRadius={12}
              backgroundColor={BRAND_GOLD}
              cursor="pointer"
              animation="quick"
              hoverStyle={{ backgroundColor: BRAND_GOLD_LIGHT }}
              pressStyle={{ scale: 0.97 }}
              onPress={onInvite}
            >
              <BrandIcon
                name="share"
                size={14}
                color="#151515"
                accentColor="#151515"
              />
              <Text
                fontFamily="$heading"
                fontWeight="700"
                fontSize={12}
                letterSpacing={0.96}
                textTransform="uppercase"
                color="#151515"
              >
                Invite
              </Text>
            </XStack>
          </XStack>
        ) : null}
      </XStack>
    </YStack>
  );
}

function HeroMetaItem({
  label,
  children,
  valueColor = FG1,
}: {
  label: string;
  children: React.ReactNode;
  valueColor?: string;
}): React.JSX.Element {
  return (
    <YStack gap={2}>
      <Text
        fontFamily="$heading"
        fontWeight="700"
        fontSize={10}
        letterSpacing={1.4}
        textTransform="uppercase"
        color={FG4}
      >
        {label}
      </Text>
      <Text
        fontFamily="$heading"
        fontWeight="700"
        fontSize={16}
        letterSpacing={0.32}
        color={valueColor}
      >
        {children}
      </Text>
    </YStack>
  );
}

// ─── Role bar ────────────────────────────────────────────────────────────────

const ROLE_ICON: Record<LeagueRole, BrandIconName> = {
  commish: 'secure',
  member: 'user',
  spectator: 'eye',
};
const ROLE_LABEL: Record<LeagueRole, string> = {
  commish: 'Commissioner',
  member: 'Member',
  spectator: 'Spectator',
};

function RoleButton({
  leagueRole,
  active,
  onPress,
}: {
  leagueRole: LeagueRole;
  active: boolean;
  onPress: () => void;
}): React.JSX.Element {
  const color = active ? WHITE : FG3;
  return (
    <XStack
      tag="button"
      role="tab"
      aria-selected={active}
      tabIndex={0}
      alignItems="center"
      gap={6}
      paddingVertical={6}
      paddingHorizontal={12}
      borderRadius={9999}
      backgroundColor={active ? BRAND_NAVY : 'transparent'}
      cursor="pointer"
      animation="quick"
      hoverStyle={
        active ? undefined : { backgroundColor: withAlpha(WHITE, 0.04) }
      }
      onPress={onPress}
    >
      <BrandIcon
        name={ROLE_ICON[leagueRole]}
        size={11}
        color={color}
        accentColor={color}
      />
      <Text
        fontFamily="$heading"
        fontWeight="700"
        fontSize={11}
        letterSpacing={1.1}
        textTransform="uppercase"
        color={color}
      >
        {ROLE_LABEL[leagueRole]}
      </Text>
    </XStack>
  );
}

export function LeagueRoleBar({
  leagueName,
  role,
  onRoleChange,
  season,
  onSeasonChange,
  seasons,
  isCommissioner,
  isMember,
}: {
  leagueName?: string | null;
  role: LeagueRole;
  onRoleChange: (role: LeagueRole) => void;
  season: string;
  onSeasonChange: (season: string) => void;
  seasons: readonly SeasonOption[];
  isCommissioner: boolean;
  isMember: boolean;
}): React.JSX.Element {
  return (
    <XStack
      backgroundColor={withAlpha('#0A0F1A', 0.86)}
      borderBottomWidth={1}
      borderBottomColor={PANEL_BORDER}
      zIndex={60}
      // Sticky-below-nav treatment is web-only; native renders it inline.
      style={
        Platform.OS === 'web'
          ? ({
              position: 'sticky',
              top: 105,
              backdropFilter: 'blur(14px)',
            } as React.CSSProperties)
          : undefined
      }
    >
      <XStack
        width="100%"
        maxWidth={1280}
        alignSelf="center"
        alignItems="center"
        gap={14}
        paddingVertical={10}
        paddingHorizontal={24}
      >
        <XStack alignItems="center" gap={10}>
          <Text color={BRAND_SEAM_RED_LIGHT} fontSize={13}>
            ●
          </Text>
          <Text
            fontFamily="$heading"
            fontWeight="800"
            fontSize={13}
            letterSpacing={1.04}
            textTransform="uppercase"
            color={BRAND_GOLD_LIGHT}
          >
            {leagueName ?? 'LEGACY SPORTS'}
          </Text>
          <Text
            fontFamily="$heading"
            fontSize={10}
            letterSpacing={1.8}
            color={FG3}
            borderLeftWidth={1}
            borderLeftColor={OUTLINE_SUBTLE}
            paddingLeft={10}
            marginLeft={4}
          >
            FANTASY
          </Text>
        </XStack>

        <XStack flex={1} />

        {seasons.length > 1 ? (
          <XStack minWidth={200}>
            <Select
              value={season}
              onValueChange={onSeasonChange}
              options={seasons.map((s) => ({ value: s.value, label: s.label }))}
              placeholder="Select season"
            />
          </XStack>
        ) : null}

        <XStack
          padding={3}
          backgroundColor={SURFACE_PANEL}
          borderWidth={1}
          borderColor={OUTLINE_SUBTLE}
          borderRadius={9999}
          role="tablist"
          aria-label="View role"
        >
          {isCommissioner ? (
            <RoleButton
              leagueRole="commish"
              active={role === 'commish'}
              onPress={() => onRoleChange('commish')}
            />
          ) : null}
          {isMember ? (
            <RoleButton
              leagueRole="member"
              active={role === 'member'}
              onPress={() => onRoleChange('member')}
            />
          ) : null}
          <RoleButton
            leagueRole="spectator"
            active={role === 'spectator'}
            onPress={() => onRoleChange('spectator')}
          />
        </XStack>
      </XStack>
    </XStack>
  );
}

// ─── Tab bar ─────────────────────────────────────────────────────────────────

function TabButton({
  label,
  active,
  badge,
  onPress,
}: {
  label: string;
  active: boolean;
  badge?: number;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <YStack>
      <XStack
        tag="button"
        role="tab"
        aria-selected={active}
        tabIndex={active ? 0 : -1}
        alignItems="center"
        gap={8}
        paddingVertical={14}
        paddingHorizontal={18}
        cursor="pointer"
        animation="quick"
        onPress={onPress}
      >
        <Text
          fontFamily="$heading"
          fontWeight="700"
          fontSize={13}
          letterSpacing={1.04}
          textTransform="uppercase"
          color={active ? FG1 : FG3}
          hoverStyle={active ? undefined : { color: FG2 }}
        >
          {label}
        </Text>
        {badge != null && badge > 0 ? (
          <XStack
            paddingVertical={2}
            paddingHorizontal={6}
            borderRadius={9999}
            backgroundColor={
              active ? withAlpha(BRAND_GOLD, 0.12) : withAlpha(WHITE, 0.05)
            }
          >
            <Text
              fontSize={10}
              color={active ? BRAND_GOLD_LIGHT : FG4}
              fontFamily="$mono"
            >
              {badge}
            </Text>
          </XStack>
        ) : null}
      </XStack>
      {/* Active underline (gold) */}
      <YStack
        height={3}
        marginHorizontal={14}
        borderTopLeftRadius={2}
        borderTopRightRadius={2}
        backgroundColor={active ? BRAND_GOLD : 'transparent'}
      />
    </YStack>
  );
}

export function LeagueTabBar({
  tabs,
  activeTab,
  onTabChange,
  isMember,
  isCommissioner,
  pendingTradeCount = 0,
  onAnalytics,
}: {
  tabs: readonly LeagueTabDef[];
  activeTab: string;
  onTabChange: (tab: string) => void;
  isMember: boolean;
  isCommissioner: boolean;
  pendingTradeCount?: number;
  onAnalytics?: () => void;
}): React.JSX.Element {
  const visible = tabs.filter(
    (t) => (!t.memberOnly || isMember) && (!t.commishOnly || isCommissioner),
  );
  return (
    <YStack
      marginVertical={24}
      borderBottomWidth={1}
      borderBottomColor={OUTLINE_SUBTLE}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ minWidth: '100%' }}
      >
        <XStack gap={2} role="tablist" aria-label="League sections">
          {visible.map((t) => (
            <TabButton
              key={t.id}
              label={t.label}
              active={activeTab === t.id}
              badge={t.id === 'trades' ? pendingTradeCount : undefined}
              onPress={() => onTabChange(t.id)}
            />
          ))}
          {onAnalytics ? (
            <TabButton label="Analytics" active={false} onPress={onAnalytics} />
          ) : null}
        </XStack>
      </ScrollView>
    </YStack>
  );
}

// ─── Shell ───────────────────────────────────────────────────────────────────

/**
 * Cross-platform league-detail chrome: role bar (view-as toggle + season
 * selector), hero banner (name, draft status, metadata, invite) and the
 * permission-gated tab bar. Web (league-detail-v2) and both native league
 * screens (baseball + football) consume this so the chrome lives in one place.
 */
export function LeagueDetailShell({
  sport,
  league,
  role,
  onRoleChange: _onRoleChange,
  season: _season,
  onSeasonChange: _onSeasonChange,
  seasons: _seasons,
  isCommissioner,
  isMember: _isMember,
  tabs,
  activeTab,
  onTabChange,
  pendingTradeCount,
  onAnalytics,
  onBack,
  onInvite,
  children,
  fill = false,
  className,
  pageClassName,
}: LeagueDetailShellProps): React.JSX.Element {
  // Effective perms for the current view-as role (mirrors web v2). A
  // commissioner viewing as 'member'/'spectator' drops the commissioner chip
  // and commissioner-only tabs.
  const effIsCommissioner = role === 'commish' && isCommissioner;
  const effIsMember = effIsCommissioner || role === 'member';

  return (
    <YStack
      {...(fill ? { flex: 1 } : {})}
      {...(className ? { className } : {})}
    >
      <YStack
        width="100%"
        maxWidth={1280}
        alignSelf="center"
        paddingHorizontal={24}
        paddingTop={24}
        paddingBottom={80}
        {...(fill ? { flex: 1, minHeight: 0 } : {})}
        {...(pageClassName ? { className: pageClassName } : {})}
      >
        <LeagueDetailHero
          sport={sport}
          league={league}
          isCommissioner={effIsCommissioner}
          onBack={onBack}
          onInvite={onInvite}
        />
        <LeagueTabBar
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={onTabChange}
          isMember={effIsMember}
          isCommissioner={effIsCommissioner}
          pendingTradeCount={pendingTradeCount}
          onAnalytics={onAnalytics}
        />
        {children}
      </YStack>
    </YStack>
  );
}

export default LeagueDetailShell;
