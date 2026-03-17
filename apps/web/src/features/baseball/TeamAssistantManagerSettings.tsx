import React, { useState } from 'react';
import {
  Button,
  Card,
  H4,
  Input,
  Separator,
  Spinner,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import {
  useGetTeamLeagueMembersQuery,
  useInviteAssistantManagerMutation,
  useRemoveAssistantManagerMutation,
} from '../../api/db/graphql.generated';
import {
  BRAND_GOLD_LIGHT,
  BRAND_NAVY_LIGHT,
  BRAND_SEAM_RED,
  withAlpha,
} from '../../constants/colors';

export interface TeamAssistantManagerSettingsProps {
  teamId: number;
  leagueId: number;
}

/**
 * TeamAssistantManagerSettings
 *
 * Shown in team settings for the team's General Manager.  Allows the GM to:
 *   - View existing assistant managers for the team
 *   - Invite a new assistant manager by username
 *   - Remove an existing assistant manager
 */
export function TeamAssistantManagerSettings({
  teamId,
}: TeamAssistantManagerSettingsProps) {
  const [username, setUsername] = useState('');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const {
    data: membersData,
    loading: membersLoading,
    refetch: refetchMembers,
  } = useGetTeamLeagueMembersQuery({
    variables: { teamId },
    skip: !teamId,
  });

  const [inviteAssistantManager, { loading: inviting }] =
    useInviteAssistantManagerMutation();

  const [removeAssistantManager, { loading: removing }] =
    useRemoveAssistantManagerMutation();

  const assistantManagers = (membersData?.teamLeagueMembers ?? []).filter(
    (m) => m?.permissionLevel === 'assistant_manager',
  );

  const handleInvite = async () => {
    const trimmed = username.trim();
    if (!trimmed) return;

    setInviteError(null);
    setInviteSuccess(null);

    try {
      await inviteAssistantManager({
        variables: { teamId, username: trimmed },
      });
      setInviteSuccess(`${trimmed} has been added as an assistant manager.`);
      setUsername('');
      void refetchMembers();
    } catch (err) {
      setInviteError(
        err instanceof Error
          ? err.message
          : 'Failed to invite assistant manager.',
      );
    }
  };

  const handleRemove = async (userId: number) => {
    setRemoveError(null);

    try {
      await removeAssistantManager({
        variables: { teamId, userId },
      });
      void refetchMembers();
    } catch (err) {
      setRemoveError(
        err instanceof Error
          ? err.message
          : 'Failed to remove assistant manager.',
      );
    }
  };

  return (
    <Card
      padding="$4"
      backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.06)}
      borderColor={withAlpha(BRAND_NAVY_LIGHT, 0.35)}
      borderWidth={1}
      borderRadius="$4"
    >
      <YStack gap="$4">
        {/* Header */}
        <YStack gap="$1">
          <H4 color={BRAND_GOLD_LIGHT}>Assistant Managers</H4>
          <Text fontSize="$3" color="$gray10">
            Invite a trusted user to help manage your team roster and lineup.
          </Text>
        </YStack>

        <Separator />

        {/* Existing assistant managers */}
        {membersLoading ? (
          <Spinner color={BRAND_NAVY_LIGHT} />
        ) : assistantManagers.length === 0 ? (
          <Text fontSize="$3" color="$gray9" fontStyle="italic">
            No assistant managers yet.
          </Text>
        ) : (
          <YStack gap="$2">
            {assistantManagers.map((member) => {
              const userId = member?.userId;
              if (userId == null) return null;
              return (
                <XStack
                  key={userId}
                  justifyContent="space-between"
                  alignItems="center"
                  padding="$2"
                  backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.12)}
                  borderRadius="$3"
                >
                  <Text fontSize="$3">
                    {member?.username ?? `User #${userId}`}
                  </Text>
                  <Button
                    size="$2"
                    backgroundColor={withAlpha(BRAND_SEAM_RED, 0.15)}
                    color={BRAND_SEAM_RED}
                    borderColor={withAlpha(BRAND_SEAM_RED, 0.4)}
                    borderWidth={1}
                    onPress={() => void handleRemove(userId)}
                    disabled={removing}
                    aria-label={`Remove assistant manager ${member?.username ?? `user ${userId}`}`}
                  >
                    Remove
                  </Button>
                </XStack>
              );
            })}
          </YStack>
        )}

        {removeError && (
          <Text fontSize="$3" color={BRAND_SEAM_RED}>
            {removeError}
          </Text>
        )}

        <Separator />

        {/* Invite form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (inviting || !username.trim()) return;
            void handleInvite();
          }}
        >
          <YStack gap="$2">
            <Text fontSize="$3" fontWeight="600" color={BRAND_GOLD_LIGHT}>
              Invite by username
            </Text>
            <XStack gap="$2" alignItems="center">
              <Input
                flex={1}
                size="$3"
                placeholder="Enter username…"
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoCorrect={false}
                borderColor={withAlpha(BRAND_NAVY_LIGHT, 0.5)}
                focusStyle={{ borderColor: BRAND_NAVY_LIGHT }}
                aria-label="Username to invite as assistant manager"
              />
              <Button
                size="$3"
                backgroundColor={BRAND_NAVY_LIGHT}
                color="white"
                onPress={() => void handleInvite()}
                disabled={inviting || !username.trim()}
                aria-label="Send assistant manager invitation"
              >
                {inviting ? <Spinner size="small" color="white" /> : 'Invite'}
              </Button>
            </XStack>

            {inviteError && (
              <Text fontSize="$3" color={BRAND_SEAM_RED}>
                {inviteError}
              </Text>
            )}
            {inviteSuccess && (
              <Text fontSize="$3" color="$green9">
                {inviteSuccess}
              </Text>
            )}
          </YStack>
        </form>
      </YStack>
    </Card>
  );
}
