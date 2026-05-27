import React, { useState } from 'react';
import {
  Button,
  Card,
  Dialog,
  H3,
  H4,
  Separator,
  Spinner,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import { LOGGER } from '@legacy-sports/logging';
import { useDeleteAllLeaguesMutation } from '../../api/db/graphql.generated';
import {
  BRAND_GOLD_LIGHT,
  BRAND_NAVY_LIGHT,
  withAlpha,
} from '../../constants/colors';

const DELETION_TIMEOUT_MS = 30_000;

export const LeagueManagement: React.FC = () => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [showFinalConfirm, setShowFinalConfirm] = useState(false);
  const [liveMsg, setLiveMsg] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const [deleteAllLeagues, { loading, error }] = useDeleteAllLeaguesMutation();

  const handleDeleteAllLeagues = () => {
    setLocalError(null);
    setShowDialog(true);
    setLiveMsg('Delete all leagues dialog opened.');
  };

  const handleConfirmDelete = () => {
    setShowDialog(false);
    setShowFinalConfirm(true);
    setLiveMsg('Final confirmation dialog opened.');
  };

  const handleFinalConfirm = () => {
    setIsDeleting(true);
    setLocalError(null);
    setLiveMsg('Deleting all leagues has started.');

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error('Deletion timed out — please try again.')),
        DELETION_TIMEOUT_MS,
      ),
    );

    void Promise.race([
      deleteAllLeagues({
        refetchQueries: ['GetUserLeagues'],
        awaitRefetchQueries: true,
      }),
      timeoutPromise,
    ])
      .then((result) => {
        setIsDeleting(false);
        setShowFinalConfirm(false);
        setLiveMsg('All leagues deleted successfully.');
        alert(
          `Success: ${result.data?.deleteAllLeagues || 'All leagues have been deleted successfully'}`,
        );
      })
      .catch((err: Error) => {
        setIsDeleting(false);
        setShowFinalConfirm(false);
        setLiveMsg(`Error deleting leagues: ${err.message}`);
        setLocalError(err.message);
        LOGGER.error('Failed to delete leagues', err);
      });
  };

  return (
    <>
      <YStack
        flex={1}
        padding="$4"
        space="$4"
        maxWidth={800}
        alignSelf="center"
        width="100%"
      >
        <YStack space="$2">
          <H3>League Management</H3>
          <Text color="$gray10" fontSize="$3">
            Manage your leagues and data
          </Text>
        </YStack>

        <Separator />

        <Card padding="$4" backgroundColor="$red1" borderColor="$red6">
          <YStack space="$4">
            <YStack space="$2">
              <H4 color="$red11">Danger Zone</H4>
              <Text color="$red10" fontSize="$3">
                Destructive actions that cannot be undone
              </Text>
            </YStack>

            <Separator borderColor="$red6" />

            <YStack space="$3">
              <YStack space="$2">
                <Text fontWeight="600" color="$red11">
                  Delete All Leagues
                </Text>
                <Text fontSize="$2" color="$gray10">
                  Permanently delete all leagues you own, including all teams,
                  roster data, positions, and member information. This action
                  cannot be undone.
                </Text>
              </YStack>

              <XStack justifyContent="flex-end">
                <Button
                  theme="red"
                  size="$3"
                  disabled={isDeleting || loading}
                  onPress={handleDeleteAllLeagues}
                  icon={
                    isDeleting || loading ? <Spinner size="small" /> : undefined
                  }
                >
                  {isDeleting || loading ? 'Deleting...' : 'Delete All Leagues'}
                </Button>
              </XStack>
            </YStack>

            {(error || localError) && (
              <Card padding="$3" backgroundColor="$red3" borderColor="$red7">
                <Text color="$red11" fontSize="$2">
                  Error: {localError ?? error?.message}
                </Text>
              </Card>
            )}
          </YStack>
        </Card>

        <Card
          padding="$4"
          backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.06)}
          borderColor={withAlpha(BRAND_NAVY_LIGHT, 0.35)}
        >
          <YStack space="$3">
            <H4 color={BRAND_GOLD_LIGHT}>Information</H4>
            <Text fontSize="$3" color="$gray10">
              • Only leagues you are the General Manager of will be deleted
            </Text>
            <Text fontSize="$3" color="$gray10">
              • Leagues where you're a member (but not General Manager) will not
              be affected
            </Text>
            <Text fontSize="$3" color="$gray10">
              • You can create new leagues after deletion
            </Text>
          </YStack>
        </Card>
      </YStack>

      {/* Confirmation Dialog */}
      <Dialog modal open={showDialog} onOpenChange={setShowDialog}>
        <Dialog.Portal>
          <Dialog.Overlay />
          <Dialog.Content
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-dialog-title"
            aria-describedby="delete-dialog-desc delete-dialog-list"
            padding="$4"
            space="$4"
            maxWidth={500}
          >
            <Dialog.Title id="delete-dialog-title" color="$red11">
              Delete All Leagues
            </Dialog.Title>
            <Dialog.Description id="delete-dialog-desc">
              Are you sure you want to delete ALL of your leagues? This action
              cannot be undone and will remove:
            </Dialog.Description>

            <YStack id="delete-dialog-list" space="$2" paddingLeft="$2">
              <Text fontSize="$3">• All leagues you own</Text>
              <Text fontSize="$3">• All teams in those leagues</Text>
              <Text fontSize="$3">• All roster data</Text>
              <Text fontSize="$3">• All league positions</Text>
              <Text fontSize="$3">• All league members</Text>
            </YStack>

            <XStack space="$3" justifyContent="flex-end">
              <Dialog.Close asChild>
                <Button variant="outlined">Cancel</Button>
              </Dialog.Close>
              <Button theme="red" onPress={handleConfirmDelete} autoFocus>
                Continue
              </Button>
            </XStack>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog>

      {/* Final Confirmation Dialog */}
      <Dialog modal open={showFinalConfirm} onOpenChange={setShowFinalConfirm}>
        <Dialog.Portal>
          <Dialog.Overlay />
          <Dialog.Content
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="final-dialog-title"
            aria-describedby="final-dialog-desc"
            padding="$4"
            space="$4"
            maxWidth={500}
          >
            <Dialog.Title id="final-dialog-title" color="$red11">
              Final Confirmation
            </Dialog.Title>
            <Dialog.Description
              id="final-dialog-desc"
              fontWeight="600"
              color="$red10"
            >
              This is your last chance to cancel. Are you absolutely sure you
              want to delete ALL your leagues?
            </Dialog.Description>

            <XStack space="$3" justifyContent="flex-end">
              <Dialog.Close asChild>
                <Button variant="outlined">Cancel</Button>
              </Dialog.Close>
              <Button
                theme="red"
                onPress={handleFinalConfirm}
                disabled={isDeleting}
                aria-busy={isDeleting}
                icon={isDeleting ? <Spinner size="small" /> : undefined}
              >
                {isDeleting ? 'Deleting...' : 'Yes, Delete Everything'}
              </Button>
            </XStack>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog>

      {/* Screen reader announcements */}
      <div className="sr-only" aria-live="polite">
        {liveMsg}
      </div>
    </>
  );
};

export default LeagueManagement;
