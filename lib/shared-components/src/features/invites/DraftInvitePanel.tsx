/**
 * DraftInvitePanel — invite users by username (LS-10078). Used by the mock
 * draft host in the lobby and by a league commissioner in league settings.
 * Shows the pending invites with a revoke control; a pending mock invite
 * holds a seat, so revoking it gives the seat back to the lobby.
 */
import React from 'react';
import { Button, Card, Input, Spinner, Text, XStack, YStack } from 'tamagui';
import { useLazyQuery, useMutation, useQuery } from '@apollo/client/react';
import { LOGGER } from '@legacy-sports/logging';
import {
  PendingInvites as PENDING_INVITES,
  type PendingInvitesQuery,
  type PendingInvitesQueryVariables,
  RevokeInvite as REVOKE_INVITE,
  type RevokeInviteMutation,
  type RevokeInviteMutationVariables,
  SearchUsersForDraft as SEARCH_USERS,
  type SearchUsersForDraftQuery,
  type SearchUsersForDraftQueryVariables,
  SendDraftInvite as SEND_DRAFT_INVITE,
  type SendDraftInviteMutation,
  type SendDraftInviteMutationVariables,
} from '@legacy-sports/graphql';

export type DraftInvitePanelTarget = { draftId: number } | { leagueId: number };

export interface DraftInvitePanelProps {
  target: DraftInvitePanelTarget;
  /** Called after an invite is sent or revoked (the lobby refetches seats). */
  onChanged?: () => void;
}

const MIN_SEARCH_LENGTH = 2;

export function DraftInvitePanel({
  target,
  onChanged,
}: DraftInvitePanelProps): React.JSX.Element {
  const variables =
    'draftId' in target
      ? { draftId: target.draftId }
      : { leagueId: target.leagueId };

  const [search, setSearch] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [busyUsername, setBusyUsername] = React.useState<string | null>(null);

  const { data: pendingData, refetch: refetchPending } = useQuery<
    PendingInvitesQuery,
    PendingInvitesQueryVariables
  >(PENDING_INVITES, { variables, fetchPolicy: 'cache-and-network' });

  const [runSearch, { data: searchData, loading: searching }] = useLazyQuery<
    SearchUsersForDraftQuery,
    SearchUsersForDraftQueryVariables
  >(SEARCH_USERS);

  const [sendInvite] = useMutation<
    SendDraftInviteMutation,
    SendDraftInviteMutationVariables
  >(SEND_DRAFT_INVITE);
  const [revokeInvite] = useMutation<
    RevokeInviteMutation,
    RevokeInviteMutationVariables
  >(REVOKE_INVITE);

  const trimmed = search.trim().replace(/^@/, '');

  React.useEffect(() => {
    if (trimmed.length < MIN_SEARCH_LENGTH) return;
    const handle = setTimeout(() => {
      void runSearch({ variables: { searchTerm: trimmed, limit: 5 } });
    }, 250);
    return () => clearTimeout(handle);
  }, [runSearch, trimmed]);

  const pending = pendingData?.pendingInvites ?? [];
  const pendingUsernames = new Set(pending.map((p) => p.invitedUsername));
  const results =
    trimmed.length >= MIN_SEARCH_LENGTH ? (searchData?.searchUsers ?? []) : [];

  const handleInvite = async (username: string) => {
    setError(null);
    setBusyUsername(username);
    try {
      await sendInvite({ variables: { ...variables, username } });
      setSearch('');
      await refetchPending();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send invite');
      LOGGER.warn('[DraftInvitePanel] sendDraftInvite failed', { err });
    } finally {
      setBusyUsername(null);
    }
  };

  const handleRevoke = async (inviteId: number) => {
    setError(null);
    try {
      await revokeInvite({ variables: { inviteId } });
      await refetchPending();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not revoke invite');
      LOGGER.warn('[DraftInvitePanel] revokeInvite failed', { err });
    }
  };

  return (
    <Card bordered padding="$4" gap="$3" testID="draft-invite-panel">
      <Text color="$color" fontWeight="700" fontSize="$5">
        Invite by username
      </Text>
      <Input
        placeholder="Search usernames"
        value={search}
        onChangeText={setSearch}
        autoCapitalize="none"
        autoCorrect={false}
        aria-label="Search usernames"
      />

      {searching && <Spinner size="small" />}

      {results.length > 0 && (
        <YStack gap="$2" testID="draft-invite-results">
          {results.map((user) => {
            const username = user.username ?? '';
            const alreadyInvited = pendingUsernames.has(username);
            return (
              <XStack
                key={String(user.id)}
                justifyContent="space-between"
                alignItems="center"
              >
                <Text color="$color">@{username}</Text>
                <Button
                  size="$3"
                  disabled={alreadyInvited || busyUsername !== null}
                  opacity={alreadyInvited ? 0.5 : 1}
                  onPress={() => void handleInvite(username)}
                  aria-label={`Invite ${username}`}
                  testID={`draft-invite-send-${username}`}
                >
                  <Text>{alreadyInvited ? 'Invited' : 'Invite'}</Text>
                </Button>
              </XStack>
            );
          })}
        </YStack>
      )}

      {error && (
        <Text color="$statusDangerFg" role="alert" testID="draft-invite-error">
          {error}
        </Text>
      )}

      <YStack gap="$2">
        <Text color="$textMuted" fontSize="$2" textTransform="uppercase">
          Pending invites
        </Text>
        {pending.length === 0 ? (
          <Text color="$textMuted" fontSize="$3">
            No pending invites.
          </Text>
        ) : (
          pending.map((invite) => (
            <XStack
              key={String(invite.id)}
              justifyContent="space-between"
              alignItems="center"
              testID={`draft-invite-pending-${String(invite.id)}`}
            >
              <Text color="$color">
                @{invite.invitedUsername}
                {invite.reservedSlot != null
                  ? ` · seat ${String(invite.reservedSlot)} reserved`
                  : ''}
              </Text>
              <Button
                size="$3"
                chromeless
                onPress={() => {
                  if (invite.id != null) void handleRevoke(invite.id);
                }}
                aria-label={`Revoke invite for ${invite.invitedUsername ?? ''}`}
                testID={`draft-invite-revoke-${String(invite.id)}`}
              >
                <Text color="$statusDangerFg">Revoke</Text>
              </Button>
            </XStack>
          ))
        )}
      </YStack>
    </Card>
  );
}
