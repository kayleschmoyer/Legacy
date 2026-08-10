import React, { useEffect, useMemo, useState } from 'react';
import { Button, Card, H4, Spinner, Text, XStack, YStack } from 'tamagui';
import { Minus, Plus, Settings } from '@tamagui/lucide-icons';
import {
  useGetLeaguePositionsQuery,
  useUpdateRosterPositionsMutation,
} from '@legacy-sports/graphql';
import {
  type DefensiveFormatChoice,
  FOOTBALL_ROSTER_SLOT_DEFAULTS_BY_DEFENSIVE_FORMAT,
  FOOTBALL_ROSTER_SLOT_LABELS,
  FOOTBALL_ROSTER_SLOTS_BY_DEFENSIVE_FORMAT,
  sumRosterSlots,
} from '../leagues/create-wizard/constants';
import { BRAND_NAVY_LIGHT } from '../../utils/colors';

export interface RosterRequirementsControlProps {
  leagueId: number;
  /** 'dst' (team D/ST slot) or 'idp' (individual defensive players). Defaults to 'dst'. */
  defensiveFormat?: string | null | undefined;
  onSuccess?: (message: string) => void;
  onError?: (error: Error) => void;
}

const MIN_SLOT_COUNT = 0;
const MAX_SLOT_COUNT = 20;

function resolveDefensiveFormat(
  value: string | null | undefined,
): DefensiveFormatChoice {
  return value === 'idp' ? 'idp' : 'dst';
}

/**
 * RosterRequirementsControl — commissioner control for reconfiguring a
 * football league's roster position slot counts after creation (LS-9099).
 *
 * Symmetrical with the baseball-only `DraftSettingsControl` this replaces in
 * Commissioner Settings for football leagues. Server-side (`updateRosterPositions`)
 * rejects shrinking a slot below the number of players any team already has
 * rostered in that position — this control surfaces that rejection as a form
 * error rather than trying to pre-validate roster occupancy client-side.
 */
export function RosterRequirementsControl({
  leagueId,
  defensiveFormat,
  onSuccess,
  onError,
}: RosterRequirementsControlProps) {
  const format = resolveDefensiveFormat(defensiveFormat);
  const slotTypes = FOOTBALL_ROSTER_SLOTS_BY_DEFENSIVE_FORMAT[format];
  const defaults = FOOTBALL_ROSTER_SLOT_DEFAULTS_BY_DEFENSIVE_FORMAT[format];

  const {
    data,
    loading,
    refetch: refetchPositions,
  } = useGetLeaguePositionsQuery({
    variables: { leagueId },
    fetchPolicy: 'cache-and-network',
  });

  const [updateRosterPositions, { loading: saving }] =
    useUpdateRosterPositionsMutation();

  const [counts, setCounts] = useState<Record<string, number>>(defaults);
  const [hasChanges, setHasChanges] = useState(false);

  const originalCounts = useMemo(() => {
    const positions = data?.leaguePositions ?? [];
    if (positions.length === 0) {
      return defaults;
    }
    const tally: Record<string, number> = {};
    for (const position of positions) {
      if (!position?.positionType) continue;
      const positionType = position.positionType;
      tally[positionType] = (tally[positionType] ?? 0) + 1;
    }
    return tally;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `defaults` is a stable module-level lookup keyed by `format`
  }, [data]);

  useEffect(() => {
    setCounts(originalCounts);
    setHasChanges(false);
  }, [originalCounts]);

  const handleCountChange = (positionType: string, delta: number) => {
    setCounts((prev) => {
      const nextValue = Math.max(
        MIN_SLOT_COUNT,
        Math.min(MAX_SLOT_COUNT, (prev[positionType] ?? 0) + delta),
      );
      const next = { ...prev, [positionType]: nextValue };
      setHasChanges(
        slotTypes.some(
          (type) => (next[type] ?? 0) !== (originalCounts[type] ?? 0),
        ),
      );
      return next;
    });
  };

  const handleReset = () => {
    setCounts(originalCounts);
    setHasChanges(false);
  };

  const handleSave = async () => {
    const rosterSlots = slotTypes
      .map((positionType) => ({
        positionType,
        count: counts[positionType] ?? 0,
      }))
      .filter((slot) => slot.count > 0);

    try {
      await updateRosterPositions({
        variables: { input: { leagueId, rosterSlots } },
      });
      setHasChanges(false);
      onSuccess?.('Roster requirements saved successfully!');
      void refetchPositions();
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Unknown error occurred';
      onError?.(new Error(errorMessage));
    }
  };

  const totalStarters = sumRosterSlots(counts);

  return (
    <Card
      backgroundColor="$surfacePanel"
      borderColor="$surfacePanelBorder"
      padding="$5"
      borderRadius="$6"
    >
      <YStack gap="$4">
        <XStack alignItems="center" gap="$2">
          <Settings size={20} color={BRAND_NAVY_LIGHT} />
          <YStack>
            <H4 margin={0}>Roster Requirements</H4>
            <Text fontSize="$2" color="$gray10">
              Set how many starting slots each position gets. Shrinking a
              position below the number of players already rostered there is not
              allowed.
            </Text>
          </YStack>
        </XStack>

        {loading ? (
          <YStack alignItems="center" padding="$4" gap="$2">
            <Spinner size="large" />
            <Text color="$gray10">Loading roster requirements...</Text>
          </YStack>
        ) : (
          <YStack gap="$3">
            {slotTypes.map((positionType) => {
              const count = counts[positionType] ?? 0;
              return (
                <XStack
                  key={positionType}
                  alignItems="center"
                  justifyContent="space-between"
                  gap="$3"
                >
                  <Text fontSize="$3" fontWeight="600" color="$color">
                    {FOOTBALL_ROSTER_SLOT_LABELS[positionType] ?? positionType}
                  </Text>
                  <XStack alignItems="center" gap="$2">
                    <Button
                      size="$2"
                      circular
                      theme="alt2"
                      icon={<Minus size={14} />}
                      aria-label={`Decrease ${positionType} count`}
                      onPress={() => handleCountChange(positionType, -1)}
                      disabled={saving || count <= MIN_SLOT_COUNT}
                    />
                    <Text
                      fontSize="$4"
                      fontWeight="700"
                      minWidth={24}
                      textAlign="center"
                    >
                      {count}
                    </Text>
                    <Button
                      size="$2"
                      circular
                      theme="alt2"
                      icon={<Plus size={14} />}
                      aria-label={`Increase ${positionType} count`}
                      onPress={() => handleCountChange(positionType, 1)}
                      disabled={saving || count >= MAX_SLOT_COUNT}
                    />
                  </XStack>
                </XStack>
              );
            })}

            <XStack
              justifyContent="space-between"
              paddingTop="$2"
              borderTopWidth={1}
              borderTopColor="$gray6"
            >
              <Text fontSize="$3" fontWeight="600" color="$gray10">
                Total starters
              </Text>
              <Text fontSize="$3" fontWeight="700" color="$color">
                {totalStarters}
              </Text>
            </XStack>

            <XStack gap="$3" justifyContent="flex-end" flexWrap="wrap">
              <Button
                theme="alt2"
                size="$3"
                onPress={handleReset}
                disabled={!hasChanges || saving}
                opacity={!hasChanges ? 0.5 : 1}
              >
                Reset
              </Button>
              <Button
                backgroundColor="$brandNavyLight"
                hoverStyle={{ backgroundColor: '$brandNavy' }}
                pressStyle={{ backgroundColor: '$brandNavyDark' }}
                size="$3"
                onPress={() => void handleSave()}
                disabled={!hasChanges || saving}
                opacity={!hasChanges ? 0.5 : 1}
                icon={saving ? <Spinner size="small" /> : undefined}
              >
                {saving ? 'Saving...' : 'Save Roster Requirements'}
              </Button>
            </XStack>
          </YStack>
        )}
      </YStack>
    </Card>
  );
}
