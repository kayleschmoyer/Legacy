import React, { useState } from 'react';
import {
  Button,
  Card,
  Dialog,
  H4,
  Input,
  Spinner,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import { LOGGER } from '@legacy-sports/logging';
import { useDeleteLeagueMutation } from '../../api/db/graphql.generated';

export interface DeleteLeagueControlProps {
  leagueId: number;
  leagueName: string;
  onDeleted?: () => void;
  onError?: (error: Error) => void;
}

/**
 * DeleteLeagueControl - Commissioner control for permanently deleting a league.
 *
 * Requires exact league name confirmation to prevent accidental deletion.
 * Cross-platform: uses Tamagui Dialog, no web-specific APIs.
 */
export function DeleteLeagueControl({
  leagueId,
  leagueName,
  onDeleted,
  onError,
}: DeleteLeagueControlProps) {
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [confirmationText, setConfirmationText] = useState('');
  const [loading, setLoading] = useState(false);

  const [deleteLeague] = useDeleteLeagueMutation();

  const handleConfirm = async () => {
    if (confirmationText !== leagueName) {
      onError?.(new Error('League name does not match.'));
      return;
    }

    setLoading(true);

    try {
      const result = await deleteLeague({
        variables: { leagueId },
        refetchQueries: ['GetUserLeagues'],
        awaitRefetchQueries: true,
      });

      setLoading(false);

      if (result.data?.deleteLeague) {
        setShowConfirmDialog(false);
        onDeleted?.();
      } else {
        onError?.(new Error('Failed to delete league'));
      }
    } catch (err) {
      setLoading(false);
      const error =
        err instanceof Error ? err : new Error('Failed to delete league');
      LOGGER.error('Failed to delete league', error);
      onError?.(error);
    }
  };

  const isConfirmDisabled = confirmationText !== leagueName;

  return (
    <>
      <Card backgroundColor="$red2" borderColor="$red6" padding="$4">
        <YStack space="$3">
          <H4 color="$red11">Danger Zone</H4>
          <Text color="$gray11" fontSize="$3">
            Permanently delete this league and all associated data. This action
            cannot be undone.
          </Text>
          <XStack justifyContent="flex-start" gap="$3">
            <Button
              theme="red"
              onPress={() => {
                setShowConfirmDialog(true);
                setConfirmationText('');
              }}
              disabled={loading}
              icon={loading ? <Spinner /> : undefined}
            >
              {loading ? 'Deleting...' : 'Delete League'}
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
            animateOnly={['transform', 'opacity']}
            animation={['quick', { opacity: { overshootClamping: true } }]}
            enterStyle={{ x: 0, y: -20, opacity: 0, scale: 0.9 }}
            exitStyle={{ x: 0, y: 10, opacity: 0, scale: 0.95 }}
            gap="$4"
            padding="$4"
          >
            <Dialog.Title color="$red11">
              Delete League &ldquo;{leagueName}&rdquo;?
            </Dialog.Title>
            <Dialog.Description>
              This action is permanent and cannot be undone. All teams,
              matchups, drafts, and member data will be deleted.
            </Dialog.Description>

            <YStack space="$3">
              <Text fontSize="$3" fontWeight="bold">
                Type the league name to confirm:
              </Text>
              <Input
                placeholder={leagueName}
                value={confirmationText}
                onChangeText={setConfirmationText}
              />
              {confirmationText.length > 0 &&
                confirmationText !== leagueName && (
                  <Text fontSize="$2" color="$red10">
                    League name does not match
                  </Text>
                )}
            </YStack>

            <XStack gap="$3" justifyContent="flex-end">
              <Dialog.Close displayWhenAdapted asChild>
                <Button theme="alt2" disabled={loading}>
                  Cancel
                </Button>
              </Dialog.Close>
              <Button
                theme="red"
                onPress={() => void handleConfirm()}
                disabled={isConfirmDisabled || loading}
                icon={loading ? <Spinner /> : undefined}
              >
                {loading ? 'Deleting...' : 'Delete League'}
              </Button>
            </XStack>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog>
    </>
  );
}
