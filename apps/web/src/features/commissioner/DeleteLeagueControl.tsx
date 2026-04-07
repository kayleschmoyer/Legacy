import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { useDeleteLeagueMutation } from '../../api/db/graphql.generated';

export interface DeleteLeagueControlProps {
  leagueId: number;
  leagueName: string;
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

/**
 * DeleteLeagueControl - Commissioner control for deleting a league
 *
 * Features:
 * - Requires league name confirmation to prevent accidental deletion
 * - Only available to league General Manager
 * - Deletes all associated data (teams, matchups, drafts, etc.)
 * - Redirects to home after successful deletion
 */
export function DeleteLeagueControl({
  leagueId,
  leagueName,
  onSuccess,
  onError,
}: DeleteLeagueControlProps) {
  const navigate = useNavigate();
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [confirmationText, setConfirmationText] = useState('');
  const [loading, setLoading] = useState(false);

  const [deleteLeague] = useDeleteLeagueMutation();
  const redirectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear any pending redirect timer on unmount so we don't navigate from a
  // dead component after a successful delete.
  useEffect(
    () => () => {
      if (redirectTimeoutRef.current !== null) {
        clearTimeout(redirectTimeoutRef.current);
        redirectTimeoutRef.current = null;
      }
    },
    [],
  );

  const handleButtonClick = () => {
    setShowConfirmDialog(true);
    setConfirmationText('');
  };

  const handleConfirm = async () => {
    if (confirmationText !== leagueName) {
      onError?.(
        new Error(
          'League name does not match. Please type the exact league name to confirm deletion.',
        ),
      );
      return;
    }

    setLoading(true);

    try {
      await deleteLeague({
        variables: { leagueId },
        refetchQueries: ['GetUserLeagues'],
        awaitRefetchQueries: true,
      });

      setLoading(false);
      setShowConfirmDialog(false);
      onSuccess?.();

      // Redirect to home after successful deletion. Track the timer so we
      // can cancel it on unmount (the parent may remove us from the tree
      // inside onSuccess — or the user may navigate away — before the
      // 2-second window elapses).
      // Clear any prior pending timer first in case handleConfirm runs
      // multiple times, so we don't leak a stale timeout.
      if (redirectTimeoutRef.current !== null) {
        clearTimeout(redirectTimeoutRef.current);
        redirectTimeoutRef.current = null;
      }
      const timeoutId = setTimeout(() => {
        // Only clear the ref if it still points to this scheduled timer —
        // a later invocation may have replaced it.
        if (redirectTimeoutRef.current === timeoutId) {
          redirectTimeoutRef.current = null;
        }
        navigate('/');
      }, 2000);
      redirectTimeoutRef.current = timeoutId;
    } catch (err) {
      setLoading(false);
      const errorMessage =
        err instanceof Error ? err.message : 'Unknown error occurred';
      onError?.(new Error(errorMessage));
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
              onPress={handleButtonClick}
              disabled={loading}
              icon={loading ? <Spinner /> : undefined}
            >
              {loading ? 'Deleting...' : 'Delete League'}
            </Button>
          </XStack>

          <Text fontSize="$2" color="$red10" fontWeight="bold">
            <span role="img" aria-label="warning">
              ⚠️
            </span>{' '}
            Warning: This will delete all teams, matchups, drafts, and member
            data associated with this league.
          </Text>
        </YStack>
      </Card>

      {/* Confirmation Dialog */}
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
            aria-labelledby="delete-league-title"
            aria-describedby="delete-league-description"
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
            width={500}
          >
            <Dialog.Title id="delete-league-title" color="$red11">
              Delete League "{leagueName}"?
            </Dialog.Title>
            <Dialog.Description id="delete-league-description">
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
                autoFocus
              />
              {confirmationText && confirmationText !== leagueName && (
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
                onPress={handleConfirm}
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
