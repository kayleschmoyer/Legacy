import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { Text, XStack, YStack } from 'tamagui';
import {
  GetDraftRecommendations as GET_DRAFT_RECOMMENDATIONS,
  type GetDraftRecommendationsQuery,
  type GetDraftRecommendationsQueryVariables,
} from '@legacy-sports/graphql';
import { getPositionColor } from './utils';
import {
  BRAND_GOLD,
  BRAND_NAVY,
  EMERALD,
  SURFACE_SUBTLE,
  TEXT_MUTED,
  TEXT_PRIMARY,
  WHITE,
  withAlpha,
} from '../../utils/colors';
import { tamaguiStyled } from '../../utils/tamaguiStyled';

// ---------------------------------------------------------------------------
// Draft Intelligence Panel — server-driven (LS-467)
//
// Calls getDraftRecommendations on the server and re-fetches after each pick
// so the suggestions stay current throughout the draft.
//
// Ported from raw DOM/CSS-vars to Tamagui primitives (LS-9152, mirroring the
// LS-9064 DraftRail.tsx approach). tamaguiStyled() isolates Tamagui's
// any-typed styled() API from strict lint. Colors are theme tokens or
// withAlpha() derivations rather than literal hex/rgba strings so the
// theme-compliance ratchet (scripts/check-theme-compliance.mjs) doesn't flag
// them; see .agents/skills/ui/SKILL.md (epic LS-8518).
// ---------------------------------------------------------------------------

type StyledComponent = React.ComponentType<Record<string, unknown>>;

const BORDER_HAIRLINE = withAlpha(WHITE, 0.06);
const SURFACE_OVERLAY_SUBTLE = withAlpha(WHITE, 0.05);
const SURFACE_OVERLAY_FAINT = withAlpha(WHITE, 0.07);

const IntelPanel = tamaguiStyled(YStack, {
  backgroundColor: withAlpha(BRAND_GOLD, 0.07),
  borderWidth: 1,
  borderColor: withAlpha(BRAND_GOLD, 0.18),
  borderRadius: 16,
  padding: 14,
}) as StyledComponent;

const IntelItem = tamaguiStyled(YStack, {
  backgroundColor: withAlpha(SURFACE_SUBTLE, 0.55),
  borderWidth: 1,
  borderColor: SURFACE_OVERLAY_SUBTLE,
  borderRadius: 8,
  padding: 8,
  gap: 5,
  hoverStyle: {
    borderColor: withAlpha(BRAND_GOLD, 0.2),
    backgroundColor: withAlpha(BRAND_NAVY, 0.2),
  },
}) as StyledComponent;

const StatPill = tamaguiStyled(XStack, {
  alignItems: 'baseline',
  gap: 2,
  backgroundColor: SURFACE_OVERLAY_SUBTLE,
  borderWidth: 1,
  borderColor: BORDER_HAIRLINE,
  borderRadius: 4,
  paddingHorizontal: 5,
  paddingVertical: 2,
  flexShrink: 0,
}) as StyledComponent;

const ScoreBarTrack = tamaguiStyled(YStack, {
  flex: 1,
  height: 3,
  backgroundColor: SURFACE_OVERLAY_FAINT,
  borderRadius: 2,
  overflow: 'hidden',
}) as StyledComponent;

const DraftBtn = tamaguiStyled(XStack, {
  tag: 'button',
  alignItems: 'center',
  justifyContent: 'center',
  marginTop: 6,
  width: '100%',
  paddingHorizontal: 10,
  paddingVertical: 5,
  borderRadius: 8,
  borderWidth: 0,
  backgroundColor: EMERALD,
  cursor: 'pointer',
  hoverStyle: {
    opacity: 0.9,
  },
}) as StyledComponent;

const CancelBtn = tamaguiStyled(XStack, {
  tag: 'button',
  alignItems: 'center',
  justifyContent: 'center',
  paddingHorizontal: 10,
  paddingVertical: 5,
  borderRadius: 8,
  borderWidth: 1,
  borderColor: withAlpha(WHITE, 0.1),
  backgroundColor: SURFACE_OVERLAY_SUBTLE,
  cursor: 'pointer',
  flexShrink: 0,
}) as StyledComponent;

export function DraftIntelligence({
  draftId,
  teamId,
  currentOverallPick,
  onDraft,
}: {
  /** The active draft ID. Panel is hidden when null. */
  draftId: number | null;
  /** The team whose positional needs drive the recommendations. */
  teamId: number | null;
  /** Increments each time a pick is made; triggers a refetch. */
  currentOverallPick: number;
  /** Called with the recommended player's ID when the user clicks "Draft". */
  onDraft?: (playerId: number) => void;
}) {
  const skip = !draftId || !teamId;

  const { data, loading, refetch } = useQuery<
    GetDraftRecommendationsQuery,
    GetDraftRecommendationsQueryVariables
  >(GET_DRAFT_RECOMMENDATIONS, {
    variables: { draftId: draftId ?? 0, teamId: teamId ?? 0 },
    skip,
    fetchPolicy: 'cache-and-network',
  });

  // Re-fetch whenever a new pick is recorded so recommendations stay fresh.
  useEffect(() => {
    if (!skip) {
      void refetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch only when pick number changes
  }, [currentOverallPick]);

  // Sort by score descending so the panel renders BEST-to-worst even if the
  // server response or Apollo cache write surfaces the items in a different
  // order (LS-4825 — mobile users observed alphabetical ordering when the
  // upstream sort was lost). The rank labels (`#1`, `#2`, …) below derive
  // from this array index, so any drift here directly corrupts the visible
  // ranking.
  const recommendations = useMemo(
    () =>
      (data?.getDraftRecommendations ?? [])
        .slice()
        .sort((a, b) => (b?.score ?? 0) - (a?.score ?? 0)),
    [data?.getDraftRecommendations],
  );

  // Track which player ID is staged for confirmation (null = none pending)
  const [pendingConfirm, setPendingConfirm] = useState<number | null>(null);

  // Clear pending confirmation when picks change (new pick = new round = stale confirm)
  useEffect(() => {
    setPendingConfirm(null);
  }, [currentOverallPick]);

  // Show nothing while the very first load is in-flight (no cached data yet).
  if (loading && recommendations.length === 0) return null;
  if (recommendations.length === 0) return null;

  return (
    <IntelPanel>
      <Text
        fontSize={11}
        fontWeight="800"
        letterSpacing={1.5}
        textTransform="uppercase"
        color={BRAND_GOLD}
        marginBottom={10}
      >
        BEST AVAILABLE
      </Text>
      <YStack gap={6}>
        {recommendations.map((rec, i) => {
          if (!rec) return null;
          return (
            <IntelItem key={rec.playerId}>
              <XStack alignItems="center" gap={6}>
                <Text
                  fontSize={10}
                  fontWeight="800"
                  color={BRAND_GOLD}
                  minWidth={22}
                  flexShrink={0}
                >
                  #{i + 1}
                </Text>
                <Text
                  fontSize={12}
                  fontWeight="700"
                  color={TEXT_PRIMARY}
                  flex={1}
                  numberOfLines={1}
                >
                  {rec.playerName}
                </Text>
                <Text
                  fontSize={9}
                  fontWeight="700"
                  color={WHITE}
                  paddingHorizontal={5}
                  paddingVertical={1}
                  borderRadius={4}
                  flexShrink={0}
                  backgroundColor={getPositionColor(
                    'baseball',
                    rec.position ?? '',
                  )}
                >
                  {rec.position}
                </Text>
              </XStack>
              <XStack alignItems="center" gap={5}>
                {(rec.topStats ?? []).map((s) => {
                  if (!s) return null;
                  return (
                    <StatPill key={s.label}>
                      <Text fontSize={11} fontWeight="700" color={TEXT_PRIMARY}>
                        {s.value}
                      </Text>
                      <Text fontSize={9} fontWeight="600" color={TEXT_MUTED}>
                        {s.label}
                      </Text>
                    </StatPill>
                  );
                })}
                <ScoreBarTrack>
                  <YStack
                    height="100%"
                    borderRadius={2}
                    backgroundColor={BRAND_GOLD}
                    style={{ width: `${Math.round((rec.score ?? 0) * 100)}%` }}
                  />
                </ScoreBarTrack>
              </XStack>
              <Text
                fontSize={10}
                color={TEXT_MUTED}
                fontStyle="italic"
                lineHeight={13}
              >
                {rec.reason}
              </Text>
              {onDraft &&
                rec.playerId != null &&
                rec.playerName != null &&
                (pendingConfirm === rec.playerId ? (
                  <XStack gap={4} marginTop={2}>
                    <DraftBtn
                      flex={1}
                      aria-label={`Confirm draft ${rec.playerName}`}
                      onPress={() => {
                        const pid = rec.playerId;
                        if (pid != null && onDraft) {
                          onDraft(pid);
                          setPendingConfirm(null);
                        }
                      }}
                    >
                      <Text
                        color={WHITE}
                        fontSize={11}
                        fontWeight="700"
                        letterSpacing={0.4}
                      >
                        ✓ Confirm
                      </Text>
                    </DraftBtn>
                    <CancelBtn
                      aria-label="Cancel"
                      onPress={() => setPendingConfirm(null)}
                    >
                      <Text color={TEXT_MUTED} fontSize={11} fontWeight="600">
                        ✕
                      </Text>
                    </CancelBtn>
                  </XStack>
                ) : (
                  <DraftBtn
                    aria-label={`Draft ${rec.playerName}`}
                    onPress={() => setPendingConfirm(rec.playerId ?? null)}
                  >
                    <XStack alignItems="center" gap={4}>
                      {/* jsx-a11y/accessible-emoji requires a literal <span>
                          — Text compiles to <span> on web but the static
                          rule doesn't recognize it (same shim as DraftRail). */}
                      <span aria-hidden="true">⚡</span>
                      <Text
                        color={WHITE}
                        fontSize={11}
                        fontWeight="700"
                        letterSpacing={0.4}
                      >
                        Draft
                      </Text>
                    </XStack>
                  </DraftBtn>
                ))}
            </IntelItem>
          );
        })}
      </YStack>
    </IntelPanel>
  );
}
