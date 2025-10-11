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
  YStack
} from 'tamagui';
import { useDeleteAllLeaguesMutation } from '../../api/db/graphql.generated';

export const LeagueManagement: React.FC = () => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [showFinalConfirm, setShowFinalConfirm] = useState(false);
  
  const [deleteAllLeagues, { loading, error }] = useDeleteAllLeaguesMutation({
    onCompleted: (data) => {
      setIsDeleting(false);
      setShowFinalConfirm(false);
      alert(`Success: ${data.deleteAllLeagues || 'All leagues have been deleted successfully'}`);
    },
    onError: (error) => {
      setIsDeleting(false);
      setShowFinalConfirm(false);
      alert(`Error: Failed to delete leagues: ${error.message}`);
    }
  });

  const handleDeleteAllLeagues = () => {
    setShowDialog(true);
  };

  const handleConfirmDelete = () => {
    setShowDialog(false);
    setShowFinalConfirm(true);
  };

  const handleFinalConfirm = () => {
    setIsDeleting(true);
    void deleteAllLeagues();
  };

  return (
    <>
      <YStack flex={1} padding="$4" space="$4" maxWidth={800} alignSelf="center" width="100%">
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
                  Permanently delete all leagues you own, including all teams, roster data, 
                  positions, and member information. This action cannot be undone.
                </Text>
              </YStack>

              <XStack justifyContent="flex-end">
                <Button
                  theme="red"
                  size="$3"
                  disabled={isDeleting || loading}
                  onPress={handleDeleteAllLeagues}
                  icon={isDeleting || loading ? <Spinner size="small" /> : undefined}
                >
                  {isDeleting || loading ? 'Deleting...' : 'Delete All Leagues'}
                </Button>
              </XStack>
            </YStack>

            {error && (
              <Card padding="$3" backgroundColor="$red3" borderColor="$red7">
                <Text color="$red11" fontSize="$2">
                  Error: {error.message}
                </Text>
              </Card>
            )}
          </YStack>
        </Card>

        <Card padding="$4" backgroundColor="$blue1" borderColor="$blue6">
          <YStack space="$3">
            <H4 color="$blue11">Information</H4>
            <Text fontSize="$3" color="$gray10">
              • Only leagues you own will be deleted
            </Text>
            <Text fontSize="$3" color="$gray10">
              • Leagues where you're a member (but not owner) will not be affected
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
          <Dialog.Content padding="$4" space="$4" maxWidth={500}>
            <Dialog.Title color="$red11">Delete All Leagues</Dialog.Title>
            <Dialog.Description>
              Are you sure you want to delete ALL of your leagues? This action cannot be undone and will remove:
            </Dialog.Description>
            
            <YStack space="$2" paddingLeft="$2">
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
              <Button theme="red" onPress={handleConfirmDelete}>
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
          <Dialog.Content padding="$4" space="$4" maxWidth={500}>
            <Dialog.Title color="$red11">Final Confirmation</Dialog.Title>
            <Dialog.Description fontWeight="600" color="$red10">
              This is your last chance to cancel. Are you absolutely sure you want to delete ALL your leagues?
            </Dialog.Description>

            <XStack space="$3" justifyContent="flex-end">
              <Dialog.Close asChild>
                <Button variant="outlined">Cancel</Button>
              </Dialog.Close>
              <Button 
                theme="red" 
                onPress={handleFinalConfirm}
                disabled={isDeleting}
                icon={isDeleting ? <Spinner size="small" /> : undefined}
              >
                {isDeleting ? 'Deleting...' : 'Yes, Delete Everything'}
              </Button>
            </XStack>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog>
    </>
  );
};

export default LeagueManagement;
