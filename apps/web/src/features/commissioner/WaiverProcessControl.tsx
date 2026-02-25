import React, { useState } from 'react';
import {
  Button,
  Card,
  Dialog,
  H4,
  Spinner,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import { useProcessWaiverClaimsMutation } from '../../api/db/graphql.generated';
import { BRAND_NAVY_LIGHT } from '../../constants/colors';

export interface WaiverProcessControlProps {
  leagueId: number;
  onSuccess?: (message: string) => void;
  onError?: (error: Error) => void;
}

/**
 * WaiverProcessControl — Commissioner control for manually triggering
 * waiver claim processing for a specific league.
 *
 * Waivers are automatically processed nightly at 2am EST via EventBridge,
 * but commissioners can trigger processing early for their league.
 */
export function WaiverProcessControl({
  leagueId,
  onSuccess,
  onError,
}: WaiverProcessControlProps) {
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [processWaiverClaims, { loading }] = useProcessWaiverClaimsMutation();

  const handleButtonClick = () => {
    setShowConfirmDialog(true);
  };

  const handleConfirm = async () => {
    try {
      const result = await processWaiverClaims({
        variables: { leagueId },
        refetchQueries: ['GetTeamWaiverClaims'],
        awaitRefetchQueries: true,
      });

      setShowConfirmDialog(false);

      const data = result.data?.processWaiverClaims;
      if (data) {
        onSuccess?.(
          `Waivers processed: ${data.succeeded} succeeded, ${data.failed} failed out of ${data.processed} claims.`,
        );
      } else {
        onSuccess?.('Waiver processing completed.');
      }
    } catch (err) {
      setShowConfirmDialog(false);
      const errorMessage =
        err instanceof Error ? err.message : 'Unknown error occurred';
      onError?.(new Error(errorMessage));
    }
  };

  return (
    <>
      <Card
        backgroundColor="$surfacePanel"
        borderColor="$surfacePanelBorder"
        padding="$4"
        borderRadius="$6"
      >
        <YStack gap="$3">
          <H4 color="$textPrimary">Waiver Processing</H4>
          <Text color="$textMuted" fontSize="$3">
            Waivers are automatically processed nightly at 2am EST. Use this
            button to process pending waiver claims for your league immediately.
          </Text>
          <Button
            onPress={handleButtonClick}
            disabled={loading}
            theme="active"
            backgroundColor={BRAND_NAVY_LIGHT}
            color="white"
            size="$4"
            icon={loading ? <Spinner size="small" /> : undefined}
          >
            {loading ? 'Processing...' : 'Process Waivers Now'}
          </Button>
        </YStack>
      </Card>

      <Dialog modal open={showConfirmDialog}>
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
            width={400}
            maxWidth="90%"
          >
            <Dialog.Title>Process Waivers</Dialog.Title>
            <Dialog.Description>
              This will process all pending waiver claims for your league
              immediately. Claims will be resolved in priority order based on
              your league&apos;s waiver settings.
            </Dialog.Description>

            <XStack gap="$3" justifyContent="flex-end">
              <Dialog.Close displayWhenAdapted asChild>
                <Button
                  variant="outlined"
                  onPress={() => setShowConfirmDialog(false)}
                >
                  Cancel
                </Button>
              </Dialog.Close>
              <Button
                theme="active"
                backgroundColor={BRAND_NAVY_LIGHT}
                color="white"
                onPress={handleConfirm}
                disabled={loading}
                icon={loading ? <Spinner size="small" /> : undefined}
              >
                {loading ? 'Processing...' : 'Confirm'}
              </Button>
            </XStack>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog>
    </>
  );
}
