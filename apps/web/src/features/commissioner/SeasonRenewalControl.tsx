import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Card,
  Dialog,
  H4,
  Label,
  RadioGroup,
  Spinner,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import { useRenewLeagueMutation } from '../../api/db/graphql.generated';

export interface SeasonRenewalControlProps {
  leagueId: number;
  leagueName: string;
  draftStatus: string;
  frozenAt?: string | null;
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

/**
 * SeasonRenewalControl — Commissioner control for starting a new season.
 *
 * Creates a new league that inherits all settings and members from the
 * current one.  The commissioner chooses whether to carry forward the
 * existing rosters or hold a fresh draft.  The original league is frozen
 * (archived) and linked to the new one via previousLeagueId.
 *
 * Only shown when:
 *   - the league has completed its draft (so there is at least one full
 *     season on record)
 *   - the league is not already frozen
 */
export function SeasonRenewalControl({
  leagueId,
  leagueName,
  draftStatus,
  frozenAt,
  onSuccess,
  onError,
}: SeasonRenewalControlProps) {
  const navigate = useNavigate();
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [keepRosters, setKeepRosters] = useState<'keep' | 'draft'>('draft');
  const [loading, setLoading] = useState(false);

  const [renewLeague] = useRenewLeagueMutation();

  // Only available when the season is complete and the league isn't already archived
  if (draftStatus !== 'completed' || frozenAt) {
    return null;
  }

  const handleConfirm = async () => {
    setLoading(true);
    try {
      const result = await renewLeague({
        variables: { leagueId, keepRosters: keepRosters === 'keep' },
        refetchQueries: ['GetUserLeagues'],
        awaitRefetchQueries: true,
      });

      setLoading(false);
      setShowConfirmDialog(false);
      onSuccess?.();

      const newLeagueId = result.data?.renewLeague?.id;
      if (newLeagueId) {
        navigate(`/baseball/league/${newLeagueId}`);
      }
    } catch (err) {
      setLoading(false);
      const errorMessage =
        err instanceof Error ? err.message : 'Unknown error occurred';
      onError?.(new Error(errorMessage));
    }
  };

  return (
    <>
      <Card backgroundColor="$blue2" borderColor="$blue6" padding="$4">
        <YStack space="$3">
          <H4 color="$blue11">Start New Season</H4>

          <Text color="$gray11" fontSize="$3">
            Begin a new season for this league. A new league will be created
            with all current settings, members, and positions carried forward.
            This league will be archived and preserved for historical reference.
          </Text>

          <XStack justifyContent="flex-start" gap="$3">
            <Button
              theme="blue"
              onPress={() => setShowConfirmDialog(true)}
              disabled={loading}
              icon={loading ? <Spinner /> : undefined}
            >
              Start New Season
            </Button>
          </XStack>
        </YStack>
      </Card>

      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <Dialog.Portal>
          <Dialog.Overlay
            key="overlay"
            animation="quick"
            opacity={0.5}
            enterStyle={{ opacity: 0 }}
            exitStyle={{ opacity: 0 }}
          />
          <Dialog.Content
            bordered
            elevate
            key="content"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="season-renewal-title"
            aria-describedby="season-renewal-description"
            animateOnly={['transform', 'opacity']}
            animation={[
              'quick',
              {
                opacity: {
                  overshootClamping: true,
                },
              },
            ]}
            enterStyle={{ x: 0, y: -20, opacity: 0, scale: 0.9 }}
            exitStyle={{ x: 0, y: 10, opacity: 0, scale: 0.95 }}
            gap="$4"
            padding="$4"
            width={520}
          >
            <Dialog.Title id="season-renewal-title" color="$blue11">
              Start New Season for "{leagueName}"?
            </Dialog.Title>
            <Dialog.Description id="season-renewal-description">
              A new league will be created with all settings and members carried
              forward. This league will be frozen and kept as a historical
              record.
            </Dialog.Description>

            <YStack space="$3">
              <Text fontSize="$3" fontWeight="bold">
                How should rosters be handled?
              </Text>

              <RadioGroup
                value={keepRosters}
                onValueChange={(val) => setKeepRosters(val as 'keep' | 'draft')}
              >
                <YStack space="$2">
                  <XStack alignItems="center" gap="$2">
                    <RadioGroup.Item value="draft" id="roster-draft">
                      <RadioGroup.Indicator />
                    </RadioGroup.Item>
                    <Label htmlFor="roster-draft" fontSize="$3">
                      Hold a new draft — start with empty rosters
                    </Label>
                  </XStack>

                  <XStack alignItems="center" gap="$2">
                    <RadioGroup.Item value="keep" id="roster-keep">
                      <RadioGroup.Indicator />
                    </RadioGroup.Item>
                    <Label htmlFor="roster-keep" fontSize="$3">
                      Keep same rosters — carry over all player assignments
                    </Label>
                  </XStack>
                </YStack>
              </RadioGroup>

              <Text fontSize="$2" color="$gray10">
                {keepRosters === 'draft'
                  ? 'All team rosters will be cleared. The commissioner can configure the draft before it begins.'
                  : 'All current player assignments will be copied to the new season. No draft will be needed.'}
              </Text>
            </YStack>

            <XStack gap="$3" justifyContent="flex-end">
              <Dialog.Close displayWhenAdapted asChild>
                <Button
                  theme="alt2"
                  disabled={loading}
                  accessibilityLabel="Cancel"
                >
                  Cancel
                </Button>
              </Dialog.Close>
              <Button
                theme="blue"
                onPress={handleConfirm}
                disabled={loading}
                icon={loading ? <Spinner /> : undefined}
              >
                {loading ? 'Creating new season...' : 'Confirm New Season'}
              </Button>
            </XStack>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog>
    </>
  );
}
