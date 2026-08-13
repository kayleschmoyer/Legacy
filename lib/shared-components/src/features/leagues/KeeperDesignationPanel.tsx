import React, { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  H4,
  Separator,
  Spinner,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import { Lock } from '@tamagui/lucide-icons/icons/Lock';
import { Shield } from '@tamagui/lucide-icons/icons/Shield';
import { Star } from '@tamagui/lucide-icons/icons/Star';
import {
  useDesignateKeeperMutation,
  useGetKeeperEligibleRosterQuery,
  useUndesignateKeeperMutation,
} from '@legacy-sports/graphql';
import {
  BRAND_GOLD,
  BRAND_NAVY_DARK,
  GREEN,
  withAlpha,
} from '../../utils/colors';

export interface KeeperDesignationPanelKeeperSettings {
  keeperCount?: number | null;
  costModel?: string | null;
  maxConsecutiveKeeps?: number | null;
  rookieExempt?: boolean | null;
}

export interface KeeperDesignationPanelProps {
  leagueId: number;
  /** From league.keeperSettings — panel renders null when absent (non-keeper league). */
  keeperSettings: KeeperDesignationPanelKeeperSettings | null | undefined;
  /** From league.draftStatus — designations lock once the draft is live. */
  draftStatus: string | null | undefined;
  onSuccess?: (message: string) => void;
  onError?: (error: Error) => void;
}

const DRAFT_LIVE_STATUSES = new Set(['in-progress', 'paused', 'completed']);

function KeeperRow({
  leagueId,
  playerId,
  playerName,
  isRookie,
  designated,
  costLabel,
  locked,
  onSuccess,
  onError,
}: {
  leagueId: number;
  playerId: number;
  playerName: string;
  isRookie: boolean;
  designated: boolean;
  costLabel: string | null;
  locked: boolean;
  onSuccess?: (message: string) => void;
  onError?: (error: Error) => void;
}) {
  const [pending, setPending] = useState(false);
  // Mirrors `designated` locally rather than depending on the
  // refetchQueries round-trip to land before the button re-renders — the
  // mutations already return the updated entity, so there's no need to wait
  // on a second network request just to reflect the toggle. `refetchQueries`
  // below is kept as eventual-consistency insurance (e.g. keeperCount
  // recompute), not as the source of truth for this row's own label.
  const [localDesignated, setLocalDesignated] = useState<boolean | null>(null);
  useEffect(() => {
    setLocalDesignated(null);
  }, [designated]);
  const isDesignated = localDesignated ?? designated;

  const [designateKeeper] = useDesignateKeeperMutation({
    refetchQueries: ['GetKeeperEligibleRoster'],
  });
  const [undesignateKeeper] = useUndesignateKeeperMutation({
    refetchQueries: ['GetKeeperEligibleRoster'],
  });

  const handleToggle = async () => {
    setPending(true);
    try {
      if (isDesignated) {
        await undesignateKeeper({ variables: { leagueId, playerId } });
        setLocalDesignated(false);
        onSuccess?.(`${playerName} is no longer a designated keeper`);
      } else {
        await designateKeeper({ variables: { leagueId, playerId } });
        setLocalDesignated(true);
        onSuccess?.(`${playerName} designated as a keeper`);
      }
    } catch (err) {
      onError?.(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setPending(false);
    }
  };

  return (
    <XStack
      alignItems="center"
      gap="$3"
      paddingVertical="$2"
      paddingHorizontal="$3"
      borderRadius="$3"
      backgroundColor={
        isDesignated ? withAlpha(BRAND_GOLD, 0.06) : 'transparent'
      }
      borderWidth={1}
      borderColor={isDesignated ? withAlpha(BRAND_GOLD, 0.25) : 'transparent'}
    >
      <YStack flex={1} minWidth={0}>
        <XStack alignItems="center" gap="$2">
          <Text fontSize="$3" fontWeight="600" color="$color">
            {playerName}
          </Text>
          {isRookie && (
            <XStack
              alignItems="center"
              gap="$1"
              backgroundColor={withAlpha(GREEN, 0.12)}
              borderRadius="$2"
              paddingHorizontal="$2"
              paddingVertical={2}
            >
              <Star size={10} color="$green10" />
              <Text fontSize="$1" color="$green10" fontWeight="600">
                Rookie exempt
              </Text>
            </XStack>
          )}
        </XStack>
        {costLabel && (
          <Text fontSize="$2" color="$gray10">
            {costLabel}
          </Text>
        )}
      </YStack>
      <Button
        size="$3"
        disabled={locked || pending}
        opacity={locked || pending ? 0.5 : 1}
        onPress={() => void handleToggle()}
        variant={isDesignated ? 'outlined' : undefined}
        backgroundColor={isDesignated ? 'transparent' : BRAND_GOLD}
        borderColor={isDesignated ? BRAND_GOLD : undefined}
        color={isDesignated ? BRAND_GOLD : BRAND_NAVY_DARK}
        fontWeight="700"
        icon={pending ? <Spinner size="small" /> : undefined}
      >
        {pending ? undefined : isDesignated ? 'Undesignate' : 'Keep'}
      </Button>
    </XStack>
  );
}

/**
 * KeeperDesignationPanel — pre-draft manager UI for designating up to
 * keeperSettings.keeperCount roster players as keepers. Locks once the
 * league's draft goes live. (LS-8673)
 */
export function KeeperDesignationPanel({
  leagueId,
  keeperSettings,
  draftStatus,
  onSuccess,
  onError,
}: KeeperDesignationPanelProps) {
  const { data, loading } = useGetKeeperEligibleRosterQuery({
    variables: { leagueId },
    skip: !keeperSettings,
  });

  const roster = useMemo(
    () =>
      (data?.keeperEligibleRoster ?? [])
        .filter((r) => r.playerId != null)
        .map((r) => ({
          playerId: r.playerId as number,
          isRookie: r.isRookie ?? false,
          designated: r.designated ?? false,
          previewCostRound: r.previewCostRound ?? null,
          previewCostAmount: r.previewCostAmount ?? null,
          player: r.player,
        })),
    [data?.keeperEligibleRoster],
  );

  if (!keeperSettings) return null;

  const keeperCount = keeperSettings.keeperCount ?? 0;
  const rookieExempt = keeperSettings.rookieExempt ?? false;
  const locked = DRAFT_LIVE_STATUSES.has(draftStatus ?? '');
  const countedDesignated = roster.filter(
    (r) => r.designated && !(rookieExempt && r.isRookie),
  ).length;

  return (
    <Card
      backgroundColor="$surfacePanel"
      borderColor={withAlpha(BRAND_GOLD, 0.3)}
      borderWidth={1}
      padding="$5"
      borderRadius="$6"
    >
      <YStack gap="$4">
        <XStack alignItems="flex-start" gap="$3">
          <Shield size={22} color="$brandGold" marginTop={2} />
          <YStack flex={1}>
            <H4 margin={0}>Keeper Designations</H4>
            <Text fontSize="$2" color="$gray10">
              {locked
                ? 'Designations are locked — the draft has started.'
                : `Choose up to ${keeperCount} players to keep for the upcoming draft.`}
            </Text>
          </YStack>
          <XStack alignItems="center" gap="$2">
            {locked && <Lock size={14} color="$gray10" />}
            <Text fontSize="$3" fontWeight="700" color="$brandGold">
              {countedDesignated}/{keeperCount}
            </Text>
          </XStack>
        </XStack>

        <Separator />

        {loading ? (
          <XStack alignItems="center" gap="$2" padding="$2">
            <Spinner size="small" />
            <Text fontSize="$2" color="$gray10">
              Loading roster…
            </Text>
          </XStack>
        ) : roster.length === 0 ? (
          <Text fontSize="$2" color="$gray10">
            No eligible roster players yet.
          </Text>
        ) : (
          <YStack gap="$2">
            {roster.map((r) => {
              const name =
                `${r.player?.firstName ?? ''} ${r.player?.lastName ?? ''}`.trim() ||
                `Player #${r.playerId}`;
              const costLabel =
                r.previewCostRound != null
                  ? `Estimated cost: forfeit round ${r.previewCostRound}`
                  : r.previewCostAmount != null
                    ? `Estimated cost: $${r.previewCostAmount}`
                    : keeperSettings.costModel === 'auction-budget'
                      ? 'Cost determined at draft'
                      : null;
              return (
                <KeeperRow
                  key={r.playerId}
                  leagueId={leagueId}
                  playerId={r.playerId}
                  playerName={name}
                  isRookie={rookieExempt && r.isRookie}
                  designated={r.designated}
                  costLabel={costLabel}
                  locked={locked}
                  onSuccess={onSuccess}
                  onError={onError}
                />
              );
            })}
          </YStack>
        )}
      </YStack>
    </Card>
  );
}
