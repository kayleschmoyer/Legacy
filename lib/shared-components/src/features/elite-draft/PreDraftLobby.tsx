import React from 'react';
import { Button, ScrollView, Text, useMedia, XStack, YStack } from 'tamagui';
import type { LeagueTeam } from './types';
import { DraftSlotTradePanel } from './DraftSlotTradePanel';
import type { SportKind } from '../../config/sports';

interface PreDraftLobbyProps {
  league:
    | {
        name?: string | null;
        draftStatus?: string | null;
        allowDraftSlotTrading?: boolean | null;
      }
    | null
    | undefined;
  /** Active league sport — drives lobby copy and icon. */
  sport: SportKind;
  /** Guaranteed non-null by the caller's earlier NoLeagueScreen guard. */
  leagueId: number;
  leagueTeams: LeagueTeam[];
  myTeamId: number | null;
  isOwner: boolean;
  /** GM of own team, or commissioner — the roles allowed to propose/respond to a draft slot trade. */
  canManageOwnTeam: boolean;
  isCommissioner: boolean;
  onlineTeamIds: ReadonlySet<string>;
  customDraftOrder: string[] | null;
  setCustomDraftOrder: (v: string[] | null) => void;
  initError: string | null;
  initDraftLoading: boolean;
  onInitializeDraft: (order: 'snake' | 'linear') => Promise<void>;
  /** Fired after a draft slot trade executes, so the caller can refresh draft order data. */
  onDraftSlotTradeExecuted?: () => void;
}

const LOBBY_CHROME: Record<
  SportKind,
  { icon: string; iconLabel: string; strapline: string }
> = {
  baseball: {
    icon: '⚾',
    iconLabel: 'baseball',
    strapline: 'Dead Ball Dynasty',
  },
  football: {
    icon: '🏈',
    iconLabel: 'football',
    strapline: 'Gridiron Dynasty',
  },
};

// Mirrors styles.ts's private NAV_HEIGHT_PX/NAV_Z_INDEX. Kept local (rather
// than exported from styles.ts) since this screen no longer pulls in that
// raw-CSS bundle (LS-9061) — the lobby still needs to sit below the fixed
// nav bar the same way the rest of the draft board does.
const NAV_HEIGHT_PX = 75;
const NAV_Z_INDEX = 200;

// DraftSlotTradePanel (LS-8677) is rendered exclusively by this screen but is
// its own component, out of scope for this port (see LS-9061) — it still
// styles itself via raw `var(--d-*)` CSS custom properties that were
// previously supplied by styles.ts's global `<style>{CSS}</style>` injection.
// Re-declare just the handful it reads (as CSS custom properties, not a
// style-tag) so it keeps rendering correctly without pulling that bundle
// back in. No hardcoded hex/rgba fallbacks — Tamagui's theme provider always
// has these tokens set by the time this screen renders (theme-compliance
// ratchet forbids raw color literals; see .agents/skills/ui/SKILL.md).
const draftSlotTradePanelVars = {
  '--d-text': 'var(--color)',
  '--d-text-secondary': 'var(--textMuted)',
  '--d-text-muted': 'var(--glassTextMuted)',
  '--d-surface': 'var(--surfaceInteractive)',
  '--d-border': 'var(--glassBorder)',
  '--d-accent': 'var(--brandGold)',
  '--d-success': 'var(--green8)',
  '--d-danger': 'var(--statusDangerFg)',
} as React.CSSProperties;

/** Uppercase, wide-tracked label — mirrors the mockup's `.eyebrow` recipe. */
function Eyebrow({
  children,
  color = '$textMuted',
}: {
  children: React.ReactNode;
  color?: string;
}): React.JSX.Element {
  return (
    <Text
      fontSize={11}
      fontWeight="700"
      letterSpacing={1.5}
      textTransform="uppercase"
      color={color}
    >
      {children}
    </Text>
  );
}

export function PreDraftLobby({
  league,
  sport,
  leagueId,
  leagueTeams,
  myTeamId,
  isOwner,
  canManageOwnTeam,
  isCommissioner,
  onlineTeamIds,
  customDraftOrder,
  setCustomDraftOrder,
  initError,
  initDraftLoading,
  onInitializeDraft,
  onDraftSlotTradeExecuted,
}: PreDraftLobbyProps): React.JSX.Element {
  const showTrading =
    Boolean(league?.allowDraftSlotTrading) &&
    league?.draftStatus === 'not-started';
  const chrome = LOBBY_CHROME[sport];
  const orderedTeams = customDraftOrder
    ? (customDraftOrder
        .map((id) => leagueTeams.find((t) => String(t.id) === id))
        .filter(Boolean) as LeagueTeam[])
    : leagueTeams;

  // Bind useMedia through an explicit signature so the call/result stay
  // type-safe under this project's typed ESLint rules (same pattern as
  // LeagueDetailShell's crestIconSize and useThemeColors). Optional-chained
  // because this file's spec runs under both the web and mobile Jest
  // projects (elite-draft/ has no mobile blanket-exclusion) and the mobile
  // Tamagui mock doesn't stub useMedia — real Tamagui on web always provides it.
  const readMedia = useMedia as (() => { sm?: boolean }) | undefined;
  const iconFontSize = readMedia?.().sm ? 40 : 56;

  const moveTeam = (idx: number, direction: -1 | 1): void => {
    const order = customDraftOrder ?? leagueTeams.map((t) => String(t.id));
    const next = [...order];
    const swapWith = idx + direction;
    [next[idx], next[swapWith]] = [next[swapWith], next[idx]];
    setCustomDraftOrder(next);
  };

  return (
    <YStack
      position="fixed"
      top={NAV_HEIGHT_PX}
      right={0}
      bottom={0}
      left={0}
      zIndex={NAV_Z_INDEX - 2}
      backgroundColor="$background"
      overflow="hidden"
      data-sport={sport}
      style={draftSlotTradePanelVars}
    >
      <ScrollView flex={1}>
        <YStack
          minHeight="100%"
          alignItems="center"
          justifyContent="center"
          gap="$4"
          paddingVertical="$8"
          paddingHorizontal="$6"
          $sm={{
            paddingVertical: '$6',
            paddingHorizontal: '$4',
            // Small viewports commonly overflow the visible area, and a
            // fixed bottom tab bar sits above this screen's own fixed
            // positioning — anchor to the top and pad generously so the
            // trailing "Start Normal Draft" button always scrolls clear of
            // it instead of centering the block off-screen (LS-9061).
            justifyContent: 'flex-start',
            paddingBottom: 96,
          }}
        >
          <Text
            fontSize={iconFontSize}
            lineHeight={iconFontSize}
            role="img"
            aria-label={chrome.iconLabel}
          >
            {chrome.icon}
          </Text>

          <YStack alignItems="center" gap="$1.5">
            <Eyebrow color="$brandGold">{chrome.strapline}</Eyebrow>
            <Text
              fontFamily="$heading"
              fontSize={36}
              fontWeight="800"
              letterSpacing={0.5}
              color="$brandGold"
              textAlign="center"
              $sm={{ fontSize: 28 }}
            >
              {league?.name
                ? `${league.name} — Live Draft`
                : 'Live Draft Lobby'}
            </Text>
            <Text
              color="$textMuted"
              fontSize={14}
              textAlign="center"
              maxWidth={380}
              lineHeight={20}
            >
              {leagueTeams.length < 2
                ? 'At least 2 teams are required to start a draft. Invite more teams to your league.'
                : isOwner
                  ? 'As the commissioner, you can start the live draft when all teams are ready.'
                  : 'Waiting for the commissioner to start the live draft.'}
            </Text>
          </YStack>

          {leagueTeams.length > 0 && (
            <YStack
              width="100%"
              maxWidth={360}
              gap="$2"
              backgroundColor="$surfacePanel"
              borderWidth={1}
              borderColor="$surfacePanelBorder"
              borderRadius="$4"
              padding="$3"
            >
              <Eyebrow>
                {isOwner ? 'Draft Order (use arrows to reorder)' : 'Teams'} (
                {leagueTeams.length})
              </Eyebrow>
              {orderedTeams.map((team, idx, arr) => {
                const isMine = String(team.id) === String(myTeamId);
                const isOnline = onlineTeamIds.has(String(team.id));
                return (
                  <XStack
                    key={team.id}
                    alignItems="center"
                    gap="$2"
                    paddingVertical={8}
                    paddingHorizontal={10}
                    backgroundColor="$background"
                    borderWidth={1}
                    borderColor="$surfacePanelBorder"
                    borderRadius="$3"
                  >
                    <Text
                      fontFamily="$heading"
                      fontWeight="800"
                      fontSize={13}
                      color="$textMuted"
                      minWidth={20}
                    >
                      {idx + 1}.
                    </Text>
                    <YStack
                      width={7}
                      height={7}
                      borderRadius={999}
                      backgroundColor={
                        isOnline ? '$statusSuccessFg' : '$textMuted'
                      }
                      role="img"
                      aria-label={isOnline ? 'online' : 'offline'}
                    />
                    <Text
                      flex={1}
                      fontSize={13}
                      fontWeight="600"
                      numberOfLines={1}
                      color={isMine ? '$brandGoldLight' : '$color'}
                    >
                      {team.name} {isMine ? '(You)' : ''}
                    </Text>
                    {isOwner && (
                      <XStack gap={2}>
                        <Button
                          size="$2"
                          padding={0}
                          width={22}
                          height={22}
                          backgroundColor="$backgroundHover"
                          borderColor="$surfacePanelBorder"
                          disabled={idx === 0}
                          opacity={idx === 0 ? 0.3 : 1}
                          onPress={() => moveTeam(idx, -1)}
                          aria-label={`Move ${team.name} up`}
                        >
                          <Text fontSize={11} color="$textMuted">
                            ▲
                          </Text>
                        </Button>
                        <Button
                          size="$2"
                          padding={0}
                          width={22}
                          height={22}
                          backgroundColor="$backgroundHover"
                          borderColor="$surfacePanelBorder"
                          disabled={idx === arr.length - 1}
                          opacity={idx === arr.length - 1 ? 0.3 : 1}
                          onPress={() => moveTeam(idx, 1)}
                          aria-label={`Move ${team.name} down`}
                        >
                          <Text fontSize={11} color="$textMuted">
                            ▼
                          </Text>
                        </Button>
                      </XStack>
                    )}
                  </XStack>
                );
              })}
              {isOwner && customDraftOrder && (
                <Button
                  size="$3"
                  marginTop="$1"
                  backgroundColor="transparent"
                  borderWidth={1}
                  borderColor="$surfacePanelBorder"
                  onPress={() => setCustomDraftOrder(null)}
                >
                  <Text fontSize={11} color="$textMuted">
                    Reset to Default Order
                  </Text>
                </Button>
              )}
            </YStack>
          )}

          {showTrading && (
            <DraftSlotTradePanel
              leagueId={leagueId}
              myTeamId={myTeamId}
              leagueTeams={leagueTeams}
              canManageOwnTeam={canManageOwnTeam}
              isCommissioner={isCommissioner}
              onTradeExecuted={onDraftSlotTradeExecuted}
            />
          )}

          {initError && (
            <YStack
              width="100%"
              maxWidth={400}
              marginTop="$3"
              padding="$3"
              borderRadius="$4"
              borderWidth={1}
              backgroundColor="$statusDangerBg"
              borderColor="$statusDangerBorder"
            >
              <Text color="$statusDangerFg" fontSize={13}>
                {initError}
              </Text>
            </YStack>
          )}

          {isOwner && leagueTeams.length >= 2 && (
            <XStack
              gap="$2"
              marginTop="$3"
              $sm={{ flexDirection: 'column', width: '100%', maxWidth: 320 }}
            >
              <Button
                backgroundColor="$brandGold"
                color="$textOnAccent"
                disabled={initDraftLoading}
                opacity={initDraftLoading ? 0.6 : 1}
                onPress={() => {
                  void onInitializeDraft('snake');
                }}
              >
                <Text fontWeight="700" fontSize={14} color="$textOnAccent">
                  {initDraftLoading ? 'Starting...' : 'Start Snake Draft'}
                </Text>
              </Button>
              <Button
                backgroundColor="$brandNavyLight"
                disabled={initDraftLoading}
                opacity={initDraftLoading ? 0.6 : 1}
                onPress={() => {
                  void onInitializeDraft('linear');
                }}
              >
                <Text fontWeight="700" fontSize={14} color="$color">
                  {initDraftLoading ? 'Starting...' : 'Start Normal Draft'}
                </Text>
              </Button>
            </XStack>
          )}

          {!isOwner && (
            <YStack
              marginTop="$3"
              padding="$3"
              borderRadius="$4"
              borderWidth={1}
              backgroundColor="$accentMuted"
              borderColor="$brandGold"
            >
              <Text color="$brandGoldLight" fontSize={13}>
                You&apos;ll be notified when the commissioner starts the draft.
              </Text>
            </YStack>
          )}
        </YStack>
      </ScrollView>
    </YStack>
  );
}
