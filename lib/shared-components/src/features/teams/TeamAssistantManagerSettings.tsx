import React, { useState } from 'react';
import {
  Button,
  Card,
  Dialog,
  H4,
  Input,
  Paragraph,
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
} from '@legacy-sports/graphql';
import {
  BRAND_GOLD_LIGHT,
  BRAND_NAVY_LIGHT,
  BRAND_SEAM_RED,
  withAlpha,
} from '../../utils/colors';

export interface TeamAssistantManagerSettingsProps {
  teamId: number;
}

/**
 * TeamAssistantManagerSettings — cross-platform (Tamagui-only) assistant
 * manager list for a team's Settings tab. Lets the GM invite a user by
 * username and remove an existing assistant manager, with a confirmation
 * dialog before removal. Gives mobile parity (LS-6029) with web's bespoke
 * feature (LS-6027).
 */
export function TeamAssistantManagerSettings({
  teamId,
}: TeamAssistantManagerSettingsProps): React.JSX.Element {
  const [username, setUsername] = useState('');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [pendingRemove, setPendingRemove] = useState<{
    userId: number;
    username: string;
  } | null>(null);

  const {
    data: membersData,
    loading: membersLoading,
    error: membersError,
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
      await removeAssistantManager({ variables: { teamId, userId } });
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
        ) : membersError ? (
          <Text fontSize="$3" color={BRAND_SEAM_RED}>
            Failed to load assistant managers. Please try again.
          </Text>
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
                    onPress={() =>
                      setPendingRemove({
                        userId,
                        username: member?.username ?? `user ${userId}`,
                      })
                    }
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
              onSubmitEditing={() => void handleInvite()}
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
      </YStack>

      {/* Confirmation dialog for removing an assistant manager */}
      <Dialog
        modal
        open={pendingRemove !== null}
        onOpenChange={(open) => {
          if (!open) setPendingRemove(null);
        }}
      >
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
            aria-modal={true}
            aria-labelledby="remove-assistant-manager-title"
            aria-describedby="remove-assistant-manager-description"
            animateOnly={['transform', 'opacity']}
            animation={['quick', { opacity: { overshootClamping: true } }]}
            enterStyle={{ x: 0, y: -20, opacity: 0, scale: 0.9 }}
            exitStyle={{ x: 0, y: 10, opacity: 0, scale: 0.95 }}
            gap="$4"
            padding="$4"
          >
            <Dialog.Title id="remove-assistant-manager-title" color="$red11">
              Remove assistant manager?
            </Dialog.Title>
            <Dialog.Description id="remove-assistant-manager-description">
              <Paragraph>
                {pendingRemove?.username} will lose access to manage this
                team&apos;s roster and lineup. They will need to be re-invited
                to regain access.
              </Paragraph>
            </Dialog.Description>
            <XStack gap="$3" justifyContent="flex-end">
              <Button
                onPress={() => setPendingRemove(null)}
                disabled={removing}
              >
                Cancel
              </Button>
              <Button
                theme="red"
                onPress={() => {
                  const target = pendingRemove;
                  setPendingRemove(null);
                  if (target) void handleRemove(target.userId);
                }}
                disabled={removing}
                icon={removing ? <Spinner /> : undefined}
              >
                Remove
              </Button>
            </XStack>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog>
    </Card>
  );
}
