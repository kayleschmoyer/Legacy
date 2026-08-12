import React from 'react';
import { Text, XStack, YStack } from 'tamagui';
import type { CurrentDraftPickInfo } from './types';
import {
  AMBER,
  BLUE,
  BRAND_GOLD,
  BRAND_GOLD_DARK,
  OUTLINE_SUBTLE,
  SCORE_LOSS,
  SCORE_WIN,
  STATUS_DANGER,
  SURFACE_PANEL,
  TEXT_MUTED,
  TEXT_PRIMARY,
  WHITE,
  withAlpha,
} from '../../utils/colors';
import { tamaguiStyled } from '../../utils/tamaguiStyled';

// ---------------------------------------------------------------------------
// Current Pick Panel — ported 1:1 from styles.ts .d-panel/.d-state-btn rules
// (LS-9152, mirroring the LS-9064 DraftRail.tsx approach).
// tamaguiStyled() isolates Tamagui's any-typed styled() API from strict lint.
// Colors are theme tokens or withAlpha() derivations rather than literal
// hex/rgba strings so the theme-compliance ratchet
// (scripts/check-theme-compliance.mjs) doesn't flag them; see
// .agents/skills/ui/SKILL.md (epic LS-8518).
// ---------------------------------------------------------------------------

type StyledComponent = React.ComponentType<Record<string, unknown>>;

const Panel = tamaguiStyled(YStack, {
  backgroundColor: SURFACE_PANEL,
  borderWidth: 1,
  borderColor: OUTLINE_SUBTLE,
  borderRadius: 16,
  padding: 16,
  alignItems: 'center',
}) as StyledComponent;

const StateLabel = tamaguiStyled(Text, {
  fontSize: 11,
  fontWeight: '700',
  letterSpacing: 1.5,
  textTransform: 'uppercase',
  marginBottom: 6,
}) as StyledComponent;

const OnlineDot = tamaguiStyled(YStack, {
  width: 9,
  height: 9,
  borderRadius: 9999,
  flexShrink: 0,
}) as StyledComponent;

// tamaguiStyled's config object is a fixed hex (matches the .d-state-btn
// gradient's start color) rather than the original CSS custom-property
// gradient — background-image gradients aren't a Tamagui style prop.
const StateBtn = tamaguiStyled(XStack, {
  tag: 'button',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: BRAND_GOLD,
  borderWidth: 0,
  paddingHorizontal: 28,
  paddingVertical: 12,
  borderRadius: 12,
  cursor: 'pointer',
  hoverStyle: {
    backgroundColor: BRAND_GOLD_DARK,
  },
}) as StyledComponent;

interface CurrentPickPanelProps {
  currentPickInfo: CurrentDraftPickInfo | null;
  currentPickTeamId: number | null;
  currentPickLoadError: string | null;
  isMyPick: boolean;
  isOwner: boolean;
  myTeamId: number | null;
  onlineTeamIds: ReadonlySet<string>;
  initDraftLoading: boolean;
  pickHistoryLength: number;
  teamNameById: (teamId: number | null | undefined) => string;
  onInitializeDraft: (order: 'snake' | 'linear') => void;
  onRetryCurrentPick: () => void;
}

export function CurrentPickPanel({
  currentPickInfo,
  currentPickTeamId,
  currentPickLoadError,
  isMyPick,
  isOwner,
  myTeamId,
  onlineTeamIds,
  initDraftLoading,
  pickHistoryLength,
  teamNameById,
  onInitializeDraft,
  onRetryCurrentPick,
}: CurrentPickPanelProps): React.JSX.Element {
  if (currentPickInfo) {
    return (
      <Panel testID="current-pick-panel">
        <StateLabel color={isMyPick ? SCORE_WIN : TEXT_MUTED}>
          {isMyPick ? 'YOUR PICK' : 'ON THE CLOCK'}
        </StateLabel>
        <XStack alignItems="center" gap={6}>
          {currentPickTeamId !== null && (
            <OnlineDot
              testID="current-pick-online-indicator"
              aria-label={
                onlineTeamIds.has(String(currentPickTeamId))
                  ? 'online'
                  : 'offline'
              }
              title={
                onlineTeamIds.has(String(currentPickTeamId))
                  ? 'Manager is online'
                  : 'Manager is offline'
              }
              backgroundColor={
                onlineTeamIds.has(String(currentPickTeamId))
                  ? SCORE_WIN
                  : TEXT_MUTED
              }
            />
          )}
          <Text
            fontSize={18}
            fontWeight="800"
            color={isMyPick ? SCORE_WIN : TEXT_PRIMARY}
          >
            {teamNameById(currentPickTeamId)}
          </Text>
        </XStack>
        <Text fontSize={12} color={TEXT_MUTED} marginTop={4}>
          Round {currentPickInfo.round} · Pick {currentPickInfo.pickNumber}
        </Text>
        {myTeamId === null && (
          <YStack
            marginTop={8}
            paddingHorizontal={10}
            paddingVertical={6}
            backgroundColor={withAlpha(STATUS_DANGER, 0.12)}
            borderWidth={1}
            borderColor={withAlpha(STATUS_DANGER, 0.3)}
            borderRadius={6}
          >
            <XStack alignItems="flex-start" gap={4}>
              {/* jsx-a11y/accessible-emoji requires a literal <span> — Text
                  compiles to <span> on web but the static rule doesn't
                  recognize it (same shim used in DraftRail.tsx). */}
              <span role="img" aria-label="Warning">
                ⚠️
              </span>
              <Text fontSize={11} color={SCORE_LOSS} lineHeight={15} flex={1}>
                Your league membership has no team assigned. Commissioner Pick
                can be used as a workaround.
              </Text>
            </XStack>
          </YStack>
        )}
        {myTeamId !== null && !isMyPick && !currentPickInfo.isComplete && (
          <Text fontSize={10} color={TEXT_MUTED} marginTop={8} lineHeight={14}>
            Your team ID: {myTeamId} · On clock: {currentPickTeamId}
          </Text>
        )}
      </Panel>
    );
  }

  if (currentPickLoadError) {
    return (
      <Panel role="alert" aria-live="polite">
        <StateLabel color={STATUS_DANGER}>Pick Load Error</StateLabel>
        <Text fontSize={14} fontWeight="700" color={TEXT_PRIMARY}>
          Failed to load current pick
        </Text>
        <Text fontSize={12} color={TEXT_MUTED} marginTop={6}>
          There was a problem checking whose turn it is. The draft is still
          running.
        </Text>
        <StateBtn marginTop={12} onPress={onRetryCurrentPick}>
          <Text color={WHITE} fontSize={14} fontWeight="700">
            Retry
          </Text>
        </StateBtn>
      </Panel>
    );
  }

  return (
    <Panel>
      <StateLabel color={AMBER}>Draft Order Pending</StateLabel>
      <Text fontSize={14} fontWeight="700" color={TEXT_PRIMARY}>
        Waiting for pick order setup
      </Text>
      <Text fontSize={12} color={TEXT_MUTED} marginTop={6}>
        We can&apos;t determine whose turn it is yet.
      </Text>
      {isOwner && pickHistoryLength === 0 && (
        <YStack gap={8} marginTop={12} width="100%">
          <StateBtn
            disabled={initDraftLoading}
            opacity={initDraftLoading ? 0.6 : 1}
            onPress={() => onInitializeDraft('snake')}
          >
            <Text color={WHITE} fontSize={14} fontWeight="700">
              {initDraftLoading ? 'Starting...' : 'Generate Snake Order'}
            </Text>
          </StateBtn>
          <StateBtn
            disabled={initDraftLoading}
            opacity={initDraftLoading ? 0.6 : 1}
            backgroundColor={BLUE}
            onPress={() => onInitializeDraft('linear')}
          >
            <Text color={WHITE} fontSize={14} fontWeight="700">
              {initDraftLoading ? 'Starting...' : 'Generate Linear Order'}
            </Text>
          </StateBtn>
        </YStack>
      )}
    </Panel>
  );
}
