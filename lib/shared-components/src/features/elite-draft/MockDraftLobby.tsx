/**
 * MockDraftLobby (LS-10076) — the pre-draft view of an ONLINE mock draft.
 *
 * `PreDraftLobby` is the league equivalent and stays league-only: it trades
 * draft slots, reads league teams and league membership, and offers the
 * commissioner's initialize-draft controls, none of which a mock draft has.
 * This renders the mock draft's own shape instead — its seats, its invite
 * code, and the host's start/kick/visibility controls.
 *
 * Presentation plus the mutations it owns; the seat list arrives from
 * `draftRoom` and refetches on the lobby's websocket events.
 */

import React from 'react';
import { Button, Spinner, Text, XStack, YStack } from 'tamagui';

import { MockDraftInviteCard } from '../draft/MockDraftInviteCard';
import { DraftInvitePanel } from '../invites/DraftInvitePanel';

export interface MockDraftLobbySeat {
  id: number;
  slot: number;
  seatName: string;
  userId: number | null;
  controller: string;
}

export interface MockDraftLobbyProps {
  /** The lobby's draft — the host's invite panel targets it (LS-10078). */
  draftId?: number | null;
  seats: MockDraftLobbySeat[];
  /** Slots a pending direct invite holds — shown as reserved, not open. */
  reservedSlots?: number[];
  /** Refetch the room after an invite is sent or revoked. */
  onInvitesChanged?: () => void;
  /** The caller's own seat, so their row can be marked. */
  mySeatId: number | null;
  isHost: boolean;
  /** Shown to the host so they can share the lobby. */
  inviteCode: string | null;
  isPublic: boolean;
  /** When the unstarted lobby expires, ISO-8601. */
  lobbyExpiresAt: string | null;
  starting?: boolean;
  error?: string | null;
  onStart: () => void;
  onKick: (participantId: number) => void;
  onToggleVisibility: (isPublic: boolean) => void;
  onLeave: () => void;
}

function seatStatus(seat: MockDraftLobbySeat, reserved: boolean): string {
  if (seat.userId !== null) return 'Ready';
  if (seat.controller === 'ai') return 'CPU';
  return reserved ? 'Reserved' : 'Open';
}

export function MockDraftLobby({
  draftId = null,
  seats,
  reservedSlots = [],
  onInvitesChanged,
  mySeatId,
  isHost,
  inviteCode,
  isPublic,
  lobbyExpiresAt,
  starting = false,
  error = null,
  onStart,
  onKick,
  onToggleVisibility,
  onLeave,
}: MockDraftLobbyProps): React.JSX.Element {
  const filled = seats.filter((s) => s.userId !== null).length;

  return (
    <YStack flex={1} padding="$4" gap="$4" testID="mock-draft-lobby">
      <YStack gap="$1">
        <Text fontFamily="$heading" fontSize={24}>
          Mock Draft Lobby
        </Text>
        <Text opacity={0.7}>
          {filled} of {seats.length} seats taken
          {lobbyExpiresAt
            ? ` · expires ${new Date(lobbyExpiresAt).toLocaleString()}`
            : ''}
        </Text>
        <Text opacity={0.7}>
          {isPublic
            ? 'Public — anyone can find and join this lobby.'
            : 'Private — only people with the invite code can join.'}
        </Text>
      </YStack>

      {isHost && inviteCode ? (
        <MockDraftInviteCard inviteCode={inviteCode} onContinue={onStart} />
      ) : null}

      {isHost && draftId != null ? (
        <DraftInvitePanel target={{ draftId }} onChanged={onInvitesChanged} />
      ) : null}

      <YStack gap="$2" testID="mock-draft-lobby-seats">
        {seats.map((seat) => (
          <XStack
            key={seat.id}
            alignItems="center"
            justifyContent="space-between"
            padding="$3"
            borderRadius="$4"
            backgroundColor="$backgroundHover"
            testID={`mock-draft-seat-${String(seat.slot)}`}
          >
            <XStack alignItems="center" gap="$3">
              <Text opacity={0.6}>{seat.slot}</Text>
              <Text>
                {seat.seatName}
                {seat.id === mySeatId ? ' (you)' : ''}
              </Text>
            </XStack>
            <XStack alignItems="center" gap="$3">
              <Text opacity={0.7}>
                {seatStatus(seat, reservedSlots.includes(seat.slot))}
              </Text>
              {isHost && seat.userId !== null && seat.id !== mySeatId ? (
                <Button
                  size="$2"
                  onPress={() => onKick(seat.id)}
                  testID={`mock-draft-kick-${String(seat.slot)}`}
                >
                  Remove
                </Button>
              ) : null}
            </XStack>
          </XStack>
        ))}
      </YStack>

      {error ? (
        <Text color="$red10" testID="mock-draft-lobby-error">
          {error}
        </Text>
      ) : null}

      <XStack gap="$3" flexWrap="wrap">
        {isHost ? (
          <>
            <Button
              theme="active"
              onPress={onStart}
              disabled={starting}
              testID="mock-draft-start"
            >
              {starting ? <Spinner /> : 'Start Draft'}
            </Button>
            <Button
              onPress={() => onToggleVisibility(!isPublic)}
              testID="mock-draft-toggle-public"
            >
              {isPublic ? 'Make Private' : 'Make Public'}
            </Button>
          </>
        ) : null}
        <Button onPress={onLeave} testID="mock-draft-leave">
          Leave
        </Button>
      </XStack>
    </YStack>
  );
}
