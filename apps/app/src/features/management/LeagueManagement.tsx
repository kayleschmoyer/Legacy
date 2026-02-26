import React, { useState } from 'react';
import { Alert } from 'react-native';
import {
  Button,
  Card,
  H3,
  H4,
  Separator,
  Spinner,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import { useDeleteAllLeaguesMutation } from '../../api/db/graphql.generated';

export const LeagueManagement: React.FC = () => {
  const [isDeleting, setIsDeleting] = useState(false);

  const [deleteAllLeagues, { loading, error }] = useDeleteAllLeaguesMutation({
    onCompleted: (data) => {
      setIsDeleting(false);
      Alert.alert(
        'Success',
        data.deleteAllLeagues || 'All leagues have been deleted successfully',
        [{ text: 'OK' }],
      );
    },
    onError: (error) => {
      setIsDeleting(false);
      Alert.alert('Error', `Failed to delete leagues: ${error.message}`, [
        { text: 'OK' },
      ]);
    },
  });

  const handleDeleteAllLeagues = () => {
    Alert.alert(
      'Delete All Leagues',
      'Are you sure you want to delete ALL of your leagues? This action cannot be undone and will remove:\n\n• All leagues you own\n• All teams in those leagues\n• All roster data\n• All league positions\n• All league members',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Final Confirmation',
              'This is your last chance to cancel. Are you absolutely sure you want to delete ALL your leagues?',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Yes, Delete Everything',
                  style: 'destructive',
                  onPress: () => {
                    setIsDeleting(true);
                    void deleteAllLeagues();
                  },
                },
              ],
            );
          },
        },
      ],
    );
  };

  return (
    <YStack flex={1} padding="$4" space="$4">
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
  );
};

export default LeagueManagement;
