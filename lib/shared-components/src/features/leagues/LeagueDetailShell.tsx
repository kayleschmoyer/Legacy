import React from 'react';
import { Platform } from 'react-native';
import { ScrollView, Text, useMedia, XStack, YStack } from 'tamagui';
import { Chip, type ChipTone } from '../../components/Chip';
import { Select } from '../../components/Select';
import { BrandIcon, type BrandIconName } from '../../components/icons';
import {
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  BRAND_NAVY,
  BRAND_NAVY_DARK,
  BRAND_SEAM_RED_LIGHT,
  type Sport,
  WHITE,
  withAlpha,
} from '../../utils/colors';

// ─── Foreground tokens (mirror the web league-detail-v2 CSS variables so the
// extracted chrome renders identically on desktop) ───────────────────────────
// FG3 is retained because it is passed to `BrandIcon` (SVG stroke/fill), which
// cannot resolve Tamagui `$token` strings. Tamagui text/surface props below use
// tokens directly so they flip with the active light/dark theme.
const FG3 = '#9CAAC5';

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
  onInvite?: () => void;

  /** Tab content rendered below the chrome (inside the centered page column). */
  children?: React.ReactNode;

  /**
   * Skip the hero card and tab bar entirely and zero out the page-column
   * padding, leaving `children` to own its full layout. Used by the League
   * Home "Guided Home" redesign (LS-8988) so its own compact header replaces
   * the hero while any other tab is showing (defaults to `false`, so every
   * existing consumer — web league-detail-v2, native football, native
   * baseball's non-Overview tabs — renders exactly as before).
   */
  hideHeroAndTabs?: boolean;

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
  onInvite,
}: {
  sport: Sport;
  league: HeroLeague;
  isCommissioner: boolean;
  onInvite?: () => void;
}): React.JSX.Element {
  const sportLabel = sport === 'football' ? 'Football' : 'Baseball';
  const sportIcon: BrandIconName =
    sport === 'football' ? 'football' : 'baseball';

  // Responsive tiers (desktop-first, matching this file's existing convention
  // where the un-mediated base = desktop). Design breakpoints ~380/600/780 map
  // to the nearest Tamagui max-width tokens: base = desktop, `$sm` = ≤800
  // (compact tablet/large phone), `$xs` = ≤660 (small phone — crest, invite,
  // and era are dropped here). The crest icon `size` is a component prop (not a
  // style), so it can't take media props — resolve it via useMedia instead.
  // Bind useMedia through an explicit signature so the call/result stay
  // type-safe under this project's typed ESLint rules (same pattern as the tab
  // bar below and useThemeColors in utils/themeColors.ts).
  const readMedia = useMedia as () => { sm?: boolean };
  const crestIconSize = readMedia().sm ? 26 : 48;

  return (
    <YStack
      backgroundColor="$surfaceCard"
      borderWidth={1}
      borderColor="$glassBorder"
      borderRadius={20}
      paddingVertical={28}
      paddingHorizontal={32}
      $sm={{ paddingVertical: 14, paddingHorizontal: 16 }}
      overflow="hidden"
      // Web-only rich gradient layer; native falls back to the solid card bg.
      style={{ backgroundImage: HERO_GRADIENT }}
    >
      {/* Top row — sport eyebrow · commissioner chip. The "Leagues" back link
          was removed in LS-8766: back navigation is the platform's job (system
          back on Android, browser back on web). */}
      <XStack
        alignItems="center"
        gap={10}
        marginBottom={14}
        $sm={{ marginBottom: 10 }}
        $xs={{ gap: 6, marginBottom: 8 }}
        flexWrap="wrap"
      >
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
      <XStack
        gap={24}
        $sm={{ gap: 14 }}
        $xs={{ gap: 12 }}
        alignItems="flex-start"
        flexWrap="wrap"
      >
        {/* Crest scales down on compact widths and is hidden entirely on small
            phones (≤$xs) to reclaim vertical space. */}
        <YStack
          width={92}
          height={92}
          borderRadius={16}
          $sm={{ width: 48, height: 48, borderRadius: 12 }}
          $xs={{ display: 'none' }}
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
            size={crestIconSize}
            color={BRAND_GOLD_LIGHT}
            accentColor={BRAND_SEAM_RED_LIGHT}
          />
        </YStack>

        <YStack flex={1} minWidth={280} gap={10} $sm={{ minWidth: 0, gap: 8 }}>
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
            $sm={{ fontSize: 24, lineHeight: 28, letterSpacing: -0.4 }}
            $xs={{ fontSize: 22, lineHeight: 26 }}
            margin={0}
            color="$color"
          >
            {league.name}
          </Text>
          <XStack gap={8} flexWrap="wrap" alignItems="center">
            <LeagueDraftStatusChip status={league.draftStatus} />
            {league.era ? (
              // Era eyebrow is dropped on small phones (≤$xs) per the design
              // declutter; it stays visible from the compact tier up.
              <Text
                fontFamily="$body"
                fontSize={13}
                color="$textMuted"
                $xs={{ display: 'none' }}
              >
                {league.era}
              </Text>
            ) : null}
          </XStack>
          <XStack
            gap={20}
            marginTop={4}
            $sm={{ gap: 12 }}
            $xs={{ marginTop: 2 }}
            flexWrap="wrap"
          >
            {league.currentWeek != null ? (
              <HeroMetaItem label="Week">
                {String(league.currentWeek)}
                {league.totalMatchups != null ? (
                  <Text color="$textMuted" fontWeight="400">
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
              <InviteCodeMetaItem inviteCode={league.inviteCode} />
            ) : null}
          </XStack>
        </YStack>

        {onInvite ? (
          // Invite action spans full width on the compact tier, then is hidden
          // entirely on small phones (≤$xs) per the design declutter; native
          // retains its in-page invite/share entry point.
          <XStack
            flexShrink={0}
            $sm={{ width: '100%' }}
            $xs={{ display: 'none' }}
          >
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

// Meta items flow as an intrinsic-width row on desktop/compact widths, then
// pack into a 2-column grid on small phones (≤$xs) where each takes ~half the
// row and wraps. Shared by HeroMetaItem and InviteCodeMetaItem so both align.
const HERO_META_ITEM_LAYOUT = {
  gap: 2,
  $xs: { gap: 1, flexBasis: '42%', flexGrow: 1 },
} as const;

function HeroMetaItem({
  label,
  children,
  valueColor = '$color',
}: {
  label: string;
  children: React.ReactNode;
  valueColor?: string;
}): React.JSX.Element {
  return (
    <YStack {...HERO_META_ITEM_LAYOUT}>
      <Text
        fontFamily="$heading"
        fontWeight="700"
        fontSize={10}
        $xs={{ fontSize: 9 }}
        letterSpacing={1.4}
        textTransform="uppercase"
        color="$color10"
      >
        {label}
      </Text>
      <Text
        fontFamily="$heading"
        fontWeight="700"
        fontSize={16}
        $sm={{ fontSize: 14 }}
        $xs={{ fontSize: 13 }}
        letterSpacing={0.32}
        color={valueColor}
      >
        {children}
      </Text>
    </YStack>
  );
}

/**
 * Hero meta item for the league invite code. The code value is click-to-copy:
 * pressing it writes the code to the clipboard and briefly swaps the trailing
 * copy icon for a checkmark + "Copied" confirmation (LS-8062).
 */
function InviteCodeMetaItem({
  inviteCode,
}: {
  inviteCode: string;
}): React.JSX.Element {
  const [copied, setCopied] = React.useState(false);
  const resetTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    [],
  );

  const handleCopy = React.useCallback(() => {
    // `navigator.clipboard` is undefined in non-secure contexts (HTTP, some
    // sandboxed iframes) and on React Native — bail safely so we don't throw.
    const writeText =
      typeof navigator !== 'undefined' &&
      navigator.clipboard?.writeText.bind(navigator.clipboard);
    if (!writeText) return;
    void writeText(inviteCode).then(
      () => {
        setCopied(true);
        if (resetTimer.current) clearTimeout(resetTimer.current);
        resetTimer.current = setTimeout(() => setCopied(false), 1500);
      },
      () => undefined,
    );
  }, [inviteCode]);

  return (
    <YStack {...HERO_META_ITEM_LAYOUT}>
      <Text
        fontFamily="$heading"
        fontWeight="700"
        fontSize={10}
        $xs={{ fontSize: 9 }}
        letterSpacing={1.4}
        textTransform="uppercase"
        color="$color10"
      >
        Invite
      </Text>
      <XStack
        tag="button"
        role="button"
        tabIndex={0}
        alignItems="center"
        gap={6}
        cursor="pointer"
        hoverStyle={{ opacity: 0.85 }}
        pressStyle={{ opacity: 0.7 }}
        onPress={handleCopy}
        aria-label={
          copied
            ? 'League invite code copied'
            : `Copy league invite code ${inviteCode}`
        }
      >
        <Text
          fontFamily="$heading"
          fontWeight="700"
          fontSize={16}
          $sm={{ fontSize: 14 }}
          $xs={{ fontSize: 13 }}
          letterSpacing={0.32}
          color={BRAND_GOLD_LIGHT}
        >
          {inviteCode}
        </Text>
        <BrandIcon
          name={copied ? 'check' : 'copy'}
          size={13}
          color={copied ? BRAND_GOLD : BRAND_GOLD_LIGHT}
          accentColor={copied ? BRAND_GOLD : BRAND_GOLD_LIGHT}
        />
        {copied ? (
          <Text
            fontFamily="$heading"
            fontWeight="700"
            fontSize={10}
            letterSpacing={1.4}
            textTransform="uppercase"
            color={BRAND_GOLD}
          >
            Copied
          </Text>
        ) : null}
      </XStack>
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
        color={active ? '$color' : '$textMuted'}
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
      backgroundColor="$glassSurface"
      borderBottomWidth={1}
      borderBottomColor="$surfacePanelBorder"
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
            color="$textMuted"
            borderLeftWidth={1}
            borderLeftColor="$outlineSubtle"
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
          backgroundColor="$surfacePanel"
          borderWidth={1}
          borderColor="$outlineSubtle"
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
          color={active ? '$color' : '$textMuted'}
          hoverStyle={active ? undefined : { color: '$color' }}
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
              color={active ? BRAND_GOLD_LIGHT : '$color10'}
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

/**
 * Moves the first commissioner-only tab to the second slot (right after the
 * leading tab, e.g. Overview) so it stays within a phone-width viewport without
 * horizontal scrolling. All other tabs keep their relative order. Returns a new
 * array; the input is not mutated. No-op when there is no commish tab or it is
 * already in the first two slots.
 */
function hoistCommissionerTab(
  tabs: readonly LeagueTabDef[],
): readonly LeagueTabDef[] {
  const index = tabs.findIndex((t) => t.commishOnly);
  if (index <= 1) return tabs;
  const reordered = [...tabs];
  const [commish] = reordered.splice(index, 1);
  reordered.splice(1, 0, commish);
  return reordered;
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
  // Tamagui's `useMedia` resolves to a loose type under this project's ESLint
  // type program; bind it through an explicit signature so the call and its
  // result are type-safe rather than suppressing the lint rule (see useThemeColors
  // in utils/themeColors.ts for the same pattern applied to useThemeName).
  const readMedia = useMedia as () => { xs?: boolean };
  const media = readMedia();
  const visible = tabs.filter(
    (t) => (!t.memberOnly || isMember) && (!t.commishOnly || isCommissioner),
  );
  // The tab bar scrolls horizontally, so the trailing commissioner-only tab
  // sits off-screen on a phone and commissioners can't discover their admin
  // (LS-7562). On phone-width viewports only (`xs` = ≤660px, so tablets/desktop
  // keep the canonical order), hoist it next to the leading tab. The canonical
  // order (tabConfig.ts / native tab arrays) is left untouched — only the
  // rendered list is reordered, and the entry stays a role="tab" in the tablist.
  const ordered =
    isCommissioner && media.xs ? hoistCommissionerTab(visible) : visible;
  return (
    <YStack
      marginVertical={24}
      borderBottomWidth={1}
      borderBottomColor="$outlineSubtle"
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ minWidth: '100%' }}
      >
        <XStack gap={2} role="tablist" aria-label="League sections">
          {ordered.map((t) => (
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
  onInvite,
  children,
  fill = false,
  className,
  pageClassName,
  hideHeroAndTabs = false,
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
        paddingHorizontal={hideHeroAndTabs ? 0 : 24}
        paddingTop={hideHeroAndTabs ? 0 : 24}
        paddingBottom={hideHeroAndTabs ? 0 : 80}
        {...(fill ? { flex: 1, minHeight: 0 } : {})}
        {...(pageClassName ? { className: pageClassName } : {})}
      >
        {hideHeroAndTabs ? null : (
          <>
            <LeagueDetailHero
              sport={sport}
              league={league}
              isCommissioner={effIsCommissioner}
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
          </>
        )}
        {children}
      </YStack>
    </YStack>
  );
}

export default LeagueDetailShell;
