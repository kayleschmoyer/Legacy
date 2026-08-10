import React, { useEffect, useState } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { formatPickClock } from './pickClock';
import type { CurrentDraftPickInfo, LeagueTeam } from './types';
import {
  BRAND_GOLD,
  BRAND_SEAM_RED,
  BRAND_SEAM_RED_LIGHT,
  SURFACE_CARD,
  WHITE,
  withAlpha,
} from '../../utils/colors';
import { tamaguiStyled } from '../../utils/tamaguiStyled';

type StyledComponent = React.ComponentType<Record<string, unknown>>;

interface DraftTopBandProps {
  draftPaused: boolean;
  currentPick: number;
  round: number;
  timeRemaining: number;
  pickTimeLimitSeconds: number;
  /** Offline mock draft mode (LS-9144): no clock, no pressure. */
  untimed?: boolean;
  isMyPick: boolean;
  currentPickInfo: CurrentDraftPickInfo | null;
  leagueTeamsLength: number;
  isCommissioner: boolean;
  isOwner: boolean;
  /** Mock drafts auto-register the human as commissioner so the pick flow works,
   * but there's no real commissioner role to manage in a solo practice draft — the
   * commissioner controls should never render there (LS-9242). */
  isMockDraft?: boolean;
  draftId: number | null;
  commPickMode: boolean;
  autoPickDisabled: boolean;
  pauseLoading: boolean;
  resumeLoading: boolean;
  autoPickDisabledLoading: boolean;
  isMyTeamAutoPick: boolean;
  toggleAutoPickLoading: boolean;
  myTeamId: number | null;
  teamNameById: (teamId: number | null | undefined) => string;
  leagueTeams: LeagueTeam[];
  autoPickTeamIds: ReadonlySet<string>;
  commissionerToggleUserAutoPickLoading: boolean;
  onPauseDraft: () => void;
  onResumeDraft: () => void;
  onToggleCommPickMode: () => void;
  onToggleAutoPickDisabled: () => void;
  onToggleUserAutoPick: () => void;
  onCommissionerToggleUserAutoPick: (teamId: number, enable: boolean) => void;
}

type TimerZone = 'paused' | 'crit' | 'warn' | 'safe';

function timerZone(seconds: number, limit: number, paused: boolean): TimerZone {
  if (paused) return 'paused';
  const pct = limit > 0 ? seconds / limit : 1;
  if (pct <= 0.2) return 'crit';
  if (pct <= 0.4) return 'warn';
  return 'safe';
}

/** Pulses `true`/`false` on a ~1.5s cycle while `active`; static `false` otherwise
 * (mirrors the CSS `liveDot` keyframe this component previously relied on). */
function useLivePulse(active: boolean): boolean {
  const [dim, setDim] = useState(false);
  useEffect(() => {
    if (!active) {
      setDim(false);
      return;
    }
    const id = setInterval(() => setDim((v) => !v), 750);
    return () => clearInterval(id);
  }, [active]);
  return active ? dim : false;
}

/**
 * Spread onto every pressable `XStack` below (all render as a real `<button>`
 * via `tag: 'button'`). `role` is redundant on web — a native button's
 * implicit ARIA role is already "button" — but React Native has no such
 * default, so it's needed for `accessibilityRole` under the mobile jest
 * project (and any future native consumer).
 */
const BUTTON_A11Y = { role: 'button' as const, tabIndex: 0 };

// ── Styled components ───────────────────────────────────────────────────────
// tamaguiStyled() isolates Tamagui's any-typed styled() API from strict lint;
// casting the result to a concrete component type keeps call sites lint-clean.

const TopBandRoot = tamaguiStyled(XStack, {
  // `gridArea` docks this component into the still-CSS-Grid `.d-layout`
  // container in EliteDraftBoardScreen.tsx (raw HTML/CSS, out of scope for
  // this ticket — see LS-9057). Tamagui forwards unrecognized style keys
  // straight through to the underlying web element's style object.
  gridArea: 'topband',
  backgroundColor: '$surfaceSubtle',
  borderBottomWidth: 1,
  borderBottomColor: '$surfacePanelBorder',
  paddingVertical: 10,
  paddingHorizontal: 20,
  alignItems: 'center',
  flexWrap: 'wrap',
  flexShrink: 0,
  gap: 14,
  $md: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    rowGap: 12,
  },
}) as StyledComponent;

const StatusBlock = tamaguiStyled(YStack, { gap: 2 }) as StyledComponent;

const LiveLabel = tamaguiStyled(Text, {
  fontFamily: '$heading',
  fontWeight: '800',
  fontSize: 11,
  letterSpacing: 1.76,
  textTransform: 'uppercase',
  color: '$brandSeamRedLight',
}) as StyledComponent;

const LiveDot = tamaguiStyled(YStack, {
  width: 7,
  height: 7,
  borderRadius: 4,
  backgroundColor: '$brandSeamRedLight',
  animation: 'lazy',
}) as StyledComponent;

const PickNum = tamaguiStyled(Text, {
  fontFamily: '$heading',
  fontWeight: '800',
  fontSize: 22,
  lineHeight: 22,
  fontVariant: ['tabular-nums'],
  color: '$color',
}) as StyledComponent;

const RoundMeta = tamaguiStyled(Text, {
  fontSize: 11,
  color: '$textMuted',
}) as StyledComponent;

const Divider = tamaguiStyled(YStack, {
  width: 1,
  height: 52,
  backgroundColor: '$surfacePanelBorder',
  flexShrink: 0,
  $md: { display: 'none' },
}) as StyledComponent;

const TimerBlock = tamaguiStyled(XStack, {
  alignItems: 'center',
  gap: 12,
  flexShrink: 0,
}) as StyledComponent;

const RingWrap = tamaguiStyled(YStack, {
  width: 58,
  height: 58,
  alignItems: 'center',
  justifyContent: 'center',
  position: 'relative',
  flexShrink: 0,
}) as StyledComponent;

const TimerInfo = tamaguiStyled(YStack, {}) as StyledComponent;

const TimerCap = tamaguiStyled(Text, {
  fontFamily: '$heading',
  fontWeight: '700',
  fontSize: 10,
  letterSpacing: 1.4,
  textTransform: 'uppercase',
  color: '$textMuted',
}) as StyledComponent;

const TimerOf = tamaguiStyled(Text, {
  fontSize: 10,
  color: '$glassTextMuted',
  fontVariant: ['tabular-nums'],
}) as StyledComponent;

const ClockSlab = tamaguiStyled(XStack, {
  flex: 1,
  alignItems: 'center',
  gap: 12,
  borderWidth: 1,
  borderRadius: '$6',
  paddingVertical: 10,
  paddingHorizontal: 14,
  minWidth: 0,
  $md: { flexBasis: '100%' },
}) as StyledComponent;

const ClockEyebrow = tamaguiStyled(Text, {
  fontFamily: '$heading',
  fontWeight: '700',
  fontSize: 10,
  letterSpacing: 1.4,
  textTransform: 'uppercase',
  color: '$textMuted',
}) as StyledComponent;

const ClockWho = tamaguiStyled(Text, {
  fontFamily: '$heading',
  fontWeight: '800',
  fontSize: 18,
  lineHeight: 20,
  color: '$color',
  numberOfLines: 1,
}) as StyledComponent;

const AutopickToggle = tamaguiStyled(XStack, {
  tag: 'button',
  flexDirection: 'column',
  gap: 4,
  paddingVertical: 8,
  paddingHorizontal: 12,
  borderWidth: 1,
  borderColor: '$surfacePanelBorder',
  borderRadius: '$5',
  backgroundColor: '$surfacePanel',
  minWidth: 152,
  flexShrink: 0,
  cursor: 'pointer',
}) as StyledComponent;

const AutopickLabel = tamaguiStyled(Text, {
  fontFamily: '$heading',
  fontWeight: '700',
  fontSize: 10,
  letterSpacing: 1.4,
  textTransform: 'uppercase',
  color: '$textMuted',
}) as StyledComponent;

const AutopickState = tamaguiStyled(Text, {
  fontFamily: '$heading',
  fontWeight: '700',
  fontSize: 13,
  letterSpacing: 0.52,
  color: '$color',
}) as StyledComponent;

const SwitchTrack = tamaguiStyled(YStack, {
  width: 34,
  height: 20,
  borderRadius: '$10',
  borderWidth: 1,
  borderColor: '$surfacePanelBorder',
  backgroundColor: '$surfaceSubtle',
  justifyContent: 'center',
  flexShrink: 0,
  animation: 'quick',
}) as StyledComponent;

const SwitchThumb = tamaguiStyled(YStack, {
  width: 16,
  height: 16,
  borderRadius: '$10',
  backgroundColor: '$textMuted',
  marginLeft: 1,
  animation: 'quick',
}) as StyledComponent;

const CommishBar = tamaguiStyled(XStack, {
  flexDirection: 'column',
  gap: 4,
  flexShrink: 0,
}) as StyledComponent;

const GhostBtn = tamaguiStyled(XStack, {
  tag: 'button',
  alignItems: 'center',
  justifyContent: 'center',
  borderWidth: 1,
  borderColor: '$surfacePanelBorder',
  borderRadius: '$4',
  backgroundColor: 'transparent',
  paddingVertical: 7,
  paddingHorizontal: 10,
  cursor: 'pointer',
  hoverStyle: { backgroundColor: '$surfacePanel' },
  pressStyle: { y: 1 },
  animation: 'quick',
}) as StyledComponent;

const GhostBtnLabel = tamaguiStyled(Text, {
  fontFamily: '$heading',
  fontWeight: '700',
  fontSize: 11,
  letterSpacing: 1.1,
  textTransform: 'uppercase',
  color: '$color',
  whiteSpace: 'nowrap',
}) as StyledComponent;

const UserApPanel = tamaguiStyled(YStack, {
  gap: 4,
  marginTop: 4,
  padding: 8,
  borderWidth: 1,
  borderColor: '$surfacePanelBorder',
  borderRadius: '$4',
  backgroundColor: '$surfacePanel',
  maxHeight: 220,
  overflow: 'auto',
}) as StyledComponent;

const UserApRow = tamaguiStyled(XStack, {
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
}) as StyledComponent;

const UserApName = tamaguiStyled(Text, {
  fontSize: 11,
  color: '$textMuted',
  numberOfLines: 1,
  flex: 1,
}) as StyledComponent;

const UserApBtn = tamaguiStyled(XStack, {
  tag: 'button',
  paddingVertical: 3,
  paddingHorizontal: 8,
  borderRadius: '$10',
  borderWidth: 1,
  cursor: 'pointer',
  animation: 'quick',
}) as StyledComponent;

const RING_RADIUS = 24;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export function DraftTopBand({
  draftPaused,
  currentPick,
  round,
  timeRemaining,
  pickTimeLimitSeconds,
  untimed = false,
  isMyPick,
  currentPickInfo,
  leagueTeamsLength,
  isCommissioner,
  isOwner: _isOwner,
  isMockDraft = false,
  draftId,
  commPickMode,
  autoPickDisabled,
  pauseLoading,
  resumeLoading,
  autoPickDisabledLoading,
  isMyTeamAutoPick,
  toggleAutoPickLoading,
  myTeamId,
  teamNameById,
  leagueTeams,
  autoPickTeamIds,
  commissionerToggleUserAutoPickLoading,
  onPauseDraft,
  onResumeDraft,
  onToggleCommPickMode,
  onToggleAutoPickDisabled,
  onToggleUserAutoPick,
  onCommissionerToggleUserAutoPick,
}: DraftTopBandProps): React.JSX.Element {
  const [userApExpanded, setUserApExpanded] = useState(false);
  const zone = untimed
    ? 'safe'
    : timerZone(timeRemaining, pickTimeLimitSeconds, draftPaused);
  const livePulseDim = useLivePulse(!draftPaused);

  const pct = untimed
    ? 1
    : pickTimeLimitSeconds > 0
      ? timeRemaining / pickTimeLimitSeconds
      : 1;
  const clampedPct = Math.max(0, Math.min(1, pct));
  const strokeColor = draftPaused
    ? withAlpha(WHITE, 0.2)
    : zone === 'crit'
      ? BRAND_SEAM_RED_LIGHT
      : zone === 'warn'
        ? BRAND_GOLD
        : withAlpha(WHITE, 0.35);
  const ringTimeColor =
    zone === 'crit'
      ? '$brandSeamRedLight'
      : zone === 'warn'
        ? '$brandGold'
        : zone === 'paused'
          ? '$textMuted'
          : '$color';

  const onClockTeam = currentPickInfo
    ? teamNameById(currentPickInfo.teamId)
    : null;

  const showCommish = isCommissioner && !!draftId && !isMockDraft;
  const showAutopick = draftId !== null && myTeamId !== null;

  return (
    <TopBandRoot role="banner" aria-label="Draft status">
      {/* Pick status */}
      <StatusBlock>
        <LiveLabel aria-live="polite">
          <XStack alignItems="center" gap={6} display="inline-flex">
            <LiveDot
              opacity={draftPaused ? 0.4 : livePulseDim ? 0.4 : 1}
              scale={draftPaused ? 1 : livePulseDim ? 0.7 : 1}
              aria-hidden="true"
            />
            {draftPaused ? 'Paused' : 'Live Draft'}
          </XStack>
        </LiveLabel>
        <PickNum aria-label={`Pick ${currentPick}`} data-testid="current-pick">
          Pick #{currentPick}
        </PickNum>
        <RoundMeta>
          Round {round} · Pick {currentPickInfo?.pickNumber ?? '—'} of{' '}
          {leagueTeamsLength > 0 ? leagueTeamsLength : '—'}
        </RoundMeta>
      </StatusBlock>

      <Divider aria-hidden="true" />

      {/* Inline ring timer */}
      <TimerBlock role="timer" aria-label="Pick timer" aria-live="off">
        <RingWrap aria-hidden="true">
          <svg
            width="58"
            height="58"
            viewBox="0 0 58 58"
            style={{
              transform: 'rotate(-90deg)',
              position: 'absolute',
              inset: 0,
            }}
          >
            <circle
              cx="29"
              cy="29"
              r={RING_RADIUS}
              fill="none"
              stroke={withAlpha(WHITE, 0.06)}
              strokeWidth="4"
            />
            <circle
              cx="29"
              cy="29"
              r={RING_RADIUS}
              fill="none"
              stroke={strokeColor}
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={`${RING_CIRCUMFERENCE}`}
              strokeDashoffset={`${RING_CIRCUMFERENCE * (1 - clampedPct)}`}
              style={{
                transition: 'stroke-dashoffset 1s linear, stroke 0.5s ease',
              }}
            />
          </svg>
          <Text
            fontFamily="$heading"
            fontWeight="800"
            fontSize={draftPaused ? 18 : 16}
            fontVariant={['tabular-nums']}
            color={ringTimeColor}
            zIndex={1}
            aria-label={
              untimed
                ? 'No pick time limit'
                : draftPaused
                  ? 'Draft paused'
                  : `${formatPickClock(timeRemaining, pickTimeLimitSeconds)} remaining`
            }
          >
            {untimed
              ? '∞'
              : draftPaused
                ? '⏸'
                : formatPickClock(timeRemaining, pickTimeLimitSeconds)}
          </Text>
        </RingWrap>
        <TimerInfo>
          <TimerCap>{untimed ? 'No limit' : 'Time left'}</TimerCap>
          <TimerOf>
            {untimed
              ? 'Take your time'
              : `of ${formatPickClock(pickTimeLimitSeconds, pickTimeLimitSeconds)}`}
          </TimerOf>
        </TimerInfo>
      </TimerBlock>

      {/* On-the-clock slab (stretches to fill) */}
      <ClockSlab
        borderColor={
          isMyPick ? withAlpha(BRAND_GOLD, 0.5) : withAlpha(BRAND_GOLD, 0.3)
        }
        style={{
          background: isMyPick
            ? `linear-gradient(135deg, ${withAlpha(BRAND_GOLD, 0.2)} 0%, ${withAlpha(SURFACE_CARD, 0.9)} 70%)`
            : `linear-gradient(135deg, ${withAlpha(BRAND_GOLD, 0.1)} 0%, ${withAlpha(SURFACE_CARD, 0.9)} 70%)`,
          boxShadow: isMyPick
            ? `0 0 0 1px ${withAlpha(BRAND_GOLD, 0.25)}, 0 4px 16px ${withAlpha(BRAND_GOLD, 0.18)}`
            : undefined,
        }}
      >
        <YStack flex={1} minWidth={0}>
          <ClockEyebrow>{isMyPick ? 'Your pick' : 'On the clock'}</ClockEyebrow>
          <ClockWho>{onClockTeam ?? 'Waiting…'}</ClockWho>
        </YStack>
      </ClockSlab>

      {/* Auto-pick toggle */}
      {showAutopick && (
        <AutopickToggle
          role="switch"
          aria-checked={isMyTeamAutoPick}
          disabled={autoPickDisabled}
          opacity={autoPickDisabled ? 0.5 : 1}
          cursor={autoPickDisabled ? 'not-allowed' : 'pointer'}
          pointerEvents={autoPickDisabled ? 'none' : 'auto'}
          onPress={onToggleUserAutoPick}
          title={
            autoPickDisabled
              ? 'Auto-pick has been disabled by the commissioner'
              : isMyTeamAutoPick
                ? 'Auto-pick is ON. Click to disable.'
                : 'Enable auto-pick for your turn'
          }
          aria-disabled={toggleAutoPickLoading || autoPickDisabled}
        >
          <AutopickLabel>Auto-pick my turn</AutopickLabel>
          <XStack alignItems="center" gap={8}>
            <SwitchTrack
              backgroundColor={
                isMyTeamAutoPick ? '$brandNavy' : '$surfaceSubtle'
              }
              borderColor={
                isMyTeamAutoPick ? '$brandNavyLight' : '$surfacePanelBorder'
              }
              aria-hidden="true"
            >
              <SwitchThumb
                backgroundColor={isMyTeamAutoPick ? '$color' : '$textMuted'}
                x={isMyTeamAutoPick ? 14 : 0}
              />
            </SwitchTrack>
            <AutopickState
              color={isMyTeamAutoPick ? '$statusSuccessFg' : '$color'}
            >
              {isMyTeamAutoPick ? 'ON' : 'OFF'}
            </AutopickState>
          </XStack>
        </AutopickToggle>
      )}

      {/* Commissioner controls */}
      {showCommish && (
        <CommishBar>
          <XStack gap={4}>
            {!draftPaused ? (
              <GhostBtn
                {...BUTTON_A11Y}
                disabled={pauseLoading}
                onPress={onPauseDraft}
                aria-label="Pause draft"
                borderColor={withAlpha(BRAND_SEAM_RED, 0.3)}
                backgroundColor={withAlpha(BRAND_SEAM_RED, 0.12)}
                hoverStyle={{ backgroundColor: withAlpha(BRAND_SEAM_RED, 0.2) }}
              >
                <GhostBtnLabel color="$brandSeamRedLight">
                  {pauseLoading ? '…' : '⏸ Pause'}
                </GhostBtnLabel>
              </GhostBtn>
            ) : (
              <GhostBtn
                {...BUTTON_A11Y}
                disabled={resumeLoading}
                onPress={onResumeDraft}
                aria-label="Resume draft"
              >
                <GhostBtnLabel>
                  {resumeLoading ? '…' : '▶ Resume'}
                </GhostBtnLabel>
              </GhostBtn>
            )}
            <GhostBtn
              {...BUTTON_A11Y}
              onPress={onToggleCommPickMode}
              aria-pressed={commPickMode}
              borderColor={commPickMode ? '$brandGold' : undefined}
              backgroundColor={
                commPickMode ? withAlpha(BRAND_GOLD, 0.14) : undefined
              }
            >
              <GhostBtnLabel
                color={commPickMode ? '$brandGoldLight' : '$color'}
              >
                Commish
              </GhostBtnLabel>
            </GhostBtn>
            <GhostBtn
              {...BUTTON_A11Y}
              disabled={autoPickDisabledLoading}
              onPress={onToggleAutoPickDisabled}
              aria-pressed={autoPickDisabled}
              title={
                autoPickDisabled
                  ? 'Auto-pick is disabled. Click to re-enable automatic picks when time expires.'
                  : 'Click to disable auto-pick for all teams. No picks will be made automatically when time expires.'
              }
              borderColor={
                autoPickDisabled ? withAlpha(BRAND_SEAM_RED, 0.3) : undefined
              }
              backgroundColor={
                autoPickDisabled ? withAlpha(BRAND_SEAM_RED, 0.12) : undefined
              }
            >
              <GhostBtnLabel
                color={autoPickDisabled ? '$brandSeamRedLight' : '$color'}
              >
                {autoPickDisabledLoading
                  ? '…'
                  : autoPickDisabled
                    ? 'Auto-Pick OFF'
                    : 'Disable AP'}
              </GhostBtnLabel>
            </GhostBtn>
            <GhostBtn
              {...BUTTON_A11Y}
              onPress={() => setUserApExpanded((v) => !v)}
              aria-pressed={userApExpanded}
              aria-label="Toggle per-team auto-pick controls"
              title="Enable or disable auto-pick for individual teams"
              borderColor={userApExpanded ? '$brandGold' : undefined}
              backgroundColor={
                userApExpanded ? withAlpha(BRAND_GOLD, 0.14) : undefined
              }
            >
              <GhostBtnLabel
                color={userApExpanded ? '$brandGoldLight' : '$color'}
              >
                AP
              </GhostBtnLabel>
            </GhostBtn>
          </XStack>
          {userApExpanded && leagueTeams.length > 0 && (
            <UserApPanel role="region" aria-label="Per-team auto-pick controls">
              {leagueTeams.map((team) => {
                const teamIdNum = Number(team.id);
                const isOn = autoPickTeamIds.has(String(team.id));
                return (
                  <UserApRow key={team.id}>
                    <UserApName title={team.name}>{team.name}</UserApName>
                    <UserApBtn
                      {...BUTTON_A11Y}
                      disabled={commissionerToggleUserAutoPickLoading}
                      onPress={() =>
                        onCommissionerToggleUserAutoPick(teamIdNum, !isOn)
                      }
                      aria-label={`${isOn ? 'Disable' : 'Enable'} auto-pick for ${team.name}`}
                      backgroundColor={isOn ? '$brandNavy' : 'transparent'}
                      borderColor={
                        isOn ? '$brandNavyLight' : '$surfacePanelBorder'
                      }
                    >
                      <Text
                        fontSize={10}
                        fontWeight="700"
                        color={isOn ? '$statusSuccessFg' : '$textMuted'}
                      >
                        {isOn ? 'ON' : 'OFF'}
                      </Text>
                    </UserApBtn>
                  </UserApRow>
                );
              })}
            </UserApPanel>
          )}
        </CommishBar>
      )}
    </TopBandRoot>
  );
}
