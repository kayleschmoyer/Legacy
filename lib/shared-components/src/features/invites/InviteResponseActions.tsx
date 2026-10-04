/**
 * Accept / Decline for a direct invite (LS-10078), rendered on a DRAFT_INVITE
 * notification. Accepting a mock invite takes the reserved seat; accepting a
 * league invite joins the league. A revoked or lapsed invite answers with a
 * plain message instead of failing silently.
 */
import React from 'react';
import { type GestureResponderEvent } from 'react-native';
import { Button, Spinner, Text, XStack, YStack } from 'tamagui';
import { useMutation } from '@apollo/client/react';
import { LOGGER } from '@legacy-sports/logging';
import {
  InviteTargetKind,
  RespondToInvite as RESPOND_TO_INVITE,
  type RespondToInviteMutation,
  type RespondToInviteMutationVariables,
} from '@legacy-sports/graphql';

import type { JoinedTarget } from './hooks/useInviteCode';

export interface InviteResponseActionsProps {
  inviteId: number;
  /** Navigate into the draft or league once accepted. */
  onAccepted?: (target: JoinedTarget) => void;
  /** Refresh whatever lists the invite (notifications, myInvites). */
  onResponded?: () => void;
}

export function InviteResponseActions({
  inviteId,
  onAccepted,
  onResponded,
}: InviteResponseActionsProps): React.JSX.Element {
  const [respond, { loading }] = useMutation<
    RespondToInviteMutation,
    RespondToInviteMutationVariables
  >(RESPOND_TO_INVITE);
  const [error, setError] = React.useState<string | null>(null);
  const [answer, setAnswer] = React.useState<'accepted' | 'declined' | null>(
    null,
  );

  const handle = async (accept: boolean) => {
    setError(null);
    try {
      const result = await respond({ variables: { inviteId, accept } });
      const invite = result.data?.respondToInvite;
      setAnswer(accept ? 'accepted' : 'declined');
      onResponded?.();
      if (accept && invite) {
        if (invite.kind === InviteTargetKind.Mock && invite.draftId != null) {
          onAccepted?.({
            kind: 'mock',
            draftId: invite.draftId,
            sport: invite.sport ?? 'baseball',
          });
        } else if (
          invite.kind === InviteTargetKind.League &&
          invite.leagueId != null
        ) {
          onAccepted?.({
            kind: 'league',
            leagueId: invite.leagueId,
            sport: invite.sport ?? 'baseball',
          });
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      LOGGER.warn('[InviteResponseActions] respondToInvite failed', {
        inviteId,
        err,
      });
    }
  };

  if (answer) {
    return (
      <Text
        color="$textMuted"
        fontSize="$3"
        testID={`invite-${answer}-${String(inviteId)}`}
      >
        {answer === 'accepted' ? 'Invite accepted' : 'Invite declined'}
      </Text>
    );
  }

  return (
    <YStack gap="$2">
      <XStack gap="$2">
        <Button
          size="$3"
          backgroundColor="$brandGold"
          disabled={loading}
          onPress={(e: GestureResponderEvent) => {
            e.stopPropagation();
            void handle(true);
          }}
          aria-label="Accept invite"
          testID={`invite-accept-${String(inviteId)}`}
        >
          {loading ? (
            <Spinner size="small" color="$textOnAccent" />
          ) : (
            <Text color="$textOnAccent" fontWeight="700">
              Accept
            </Text>
          )}
        </Button>
        <Button
          size="$3"
          chromeless
          disabled={loading}
          onPress={(e: GestureResponderEvent) => {
            e.stopPropagation();
            void handle(false);
          }}
          aria-label="Decline invite"
          testID={`invite-decline-${String(inviteId)}`}
        >
          <Text color="$textMuted">Decline</Text>
        </Button>
      </XStack>
      {error && (
        <Text color="$statusDangerFg" fontSize="$3" role="alert">
          {error}
        </Text>
      )}
    </YStack>
  );
}

/** The invite id a DRAFT_INVITE notification carries in its JSON metadata. */
export function inviteIdFromNotification(notification: {
  notificationType?: string | null;
  metadata?: string | null;
}): number | null {
  if (notification.notificationType !== 'DRAFT_INVITE') return null;
  if (!notification.metadata) return null;
  try {
    const data = JSON.parse(notification.metadata) as { inviteId?: unknown };
    return typeof data.inviteId === 'number' ? data.inviteId : null;
  } catch {
    return null;
  }
}
