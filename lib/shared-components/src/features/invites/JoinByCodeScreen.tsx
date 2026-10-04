/**
 * JoinByCodeScreen — the universal /join/:code screen (LS-10078), shared by
 * web and native. One box takes any invite code; the preview card then shows
 * whether it is a mock-draft lobby or a league before the user commits.
 *
 * The preview shows only what a code holder may see: for a mock draft the
 * host, sport, player pool, seats, pick clock, rounds and lobby time left; for
 * a league its name, sport, open teams and draft date.
 */
import React from 'react';
import {
  Button,
  Card,
  H2,
  Input,
  Spinner,
  Text,
  XStack,
  YStack,
} from 'tamagui';

import {
  type InvitePreviewData,
  type JoinedTarget,
  normalizeInviteCode,
  useInviteCode,
} from './hooks/useInviteCode';

export interface JoinByCodeScreenProps {
  /** From the route (`/join/:code`); the user can type one otherwise. */
  initialCode?: string;
  onJoined: (target: JoinedTarget) => void;
  /** Take the user to the joined target they already belong to. */
  onOpenExisting?: (target: JoinedTarget) => void;
  onCancel: () => void;
  /** Shown when the preview needs a signed-in user. */
  onSignIn?: () => void;
}

function formatTimeLeft(iso: string | null | undefined, now: Date): string {
  if (!iso) return '—';
  const ms = new Date(iso).getTime() - now.getTime();
  if (ms <= 0) return 'Expired';
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  return hours > 0
    ? `${String(hours)}h ${String(minutes)}m`
    : `${String(minutes)}m`;
}

function formatPool(pool: string | null | undefined): string {
  if (!pool || pool === 'all') return 'All players';
  return pool.toUpperCase();
}

function capitalize(value: string | null | undefined): string {
  if (!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <XStack justifyContent="space-between" gap="$3">
      <Text color="$textMuted" fontSize="$3">
        {label}
      </Text>
      <Text color="$color" fontSize="$3" fontWeight="600">
        {value}
      </Text>
    </XStack>
  );
}

/** The preview card alone — also used by the native join route. */
export function InvitePreviewCard({
  preview,
}: {
  preview: InvitePreviewData;
}): React.JSX.Element | null {
  const now = new Date();

  if (preview.__typename === 'MockDraftInvitePreview') {
    return (
      <Card bordered padding="$4" gap="$2" testID="join-preview-mock">
        <Text color="$textMuted" fontSize="$2" textTransform="uppercase">
          {capitalize(preview.sport)} mock draft
        </Text>
        <H2 fontSize="$7" color="$color">
          {preview.hostUsername ?? 'A friend'}&apos;s mock draft
        </H2>
        <Fact label="Player pool" value={formatPool(preview.playerPool)} />
        <Fact
          label="Seats"
          value={`${String(preview.filledSeats ?? 0)} of ${String(
            preview.totalSeats ?? 0,
          )} filled · ${String(preview.openSeats ?? 0)} open`}
        />
        <Fact
          label="Pick clock"
          value={`${String(preview.pickTimeLimitSeconds ?? 0)}s`}
        />
        <Fact label="Rounds" value={String(preview.rounds ?? 0)} />
        <Fact
          label="Lobby closes in"
          value={formatTimeLeft(preview.lobbyExpiresAt, now)}
        />
      </Card>
    );
  }

  if (preview.__typename === 'LeagueInvitePreview') {
    return (
      <Card bordered padding="$4" gap="$2" testID="join-preview-league">
        <Text color="$textMuted" fontSize="$2" textTransform="uppercase">
          {capitalize(preview.sport)} league
        </Text>
        <H2 fontSize="$7" color="$color">
          {preview.name}
        </H2>
        <Fact
          label="Open teams"
          value={`${String(preview.openTeams ?? 0)} of ${String(
            preview.totalTeams ?? 0,
          )}`}
        />
        <Fact
          label="Draft"
          value={
            preview.draftScheduledAt
              ? new Date(preview.draftScheduledAt).toLocaleString()
              : 'Not scheduled'
          }
        />
      </Card>
    );
  }

  return null;
}

function targetOf(preview: InvitePreviewData): JoinedTarget | null {
  if (preview.__typename === 'MockDraftInvitePreview' && preview.draftId) {
    return {
      kind: 'mock',
      draftId: preview.draftId,
      sport: preview.sport ?? 'baseball',
    };
  }
  if (preview.__typename === 'LeagueInvitePreview' && preview.leagueId) {
    return {
      kind: 'league',
      leagueId: preview.leagueId,
      sport: preview.sport ?? 'baseball',
    };
  }
  return null;
}

export function JoinByCodeScreen({
  initialCode,
  onJoined,
  onOpenExisting,
  onCancel,
  onSignIn,
}: JoinByCodeScreenProps): React.JSX.Element {
  const [codeInput, setCodeInput] = React.useState(
    normalizeInviteCode(initialCode ?? ''),
  );
  const [teamName, setTeamName] = React.useState('');

  const {
    preview,
    loading,
    valid,
    notFound,
    needsSignIn,
    error,
    join,
    joining,
    joinError,
  } = useInviteCode({ code: codeInput, onJoined });

  const alreadyIn =
    preview?.__typename === 'MockDraftInvitePreview'
      ? Boolean(preview.isAlreadySeated)
      : preview?.__typename === 'LeagueInvitePreview'
        ? Boolean(preview.isAlreadyMember)
        : false;

  const joinable =
    preview?.__typename === 'MockDraftInvitePreview'
      ? Boolean(preview.isJoinable)
      : preview?.__typename === 'LeagueInvitePreview'
        ? (preview.openTeams ?? 0) > 0
        : false;

  const trimmedTeamName = teamName.trim();
  const canJoin =
    !joining && joinable && !alreadyIn && trimmedTeamName.length > 0;

  let status: React.ReactNode = null;
  if (needsSignIn) {
    status = (
      <YStack gap="$2" testID="join-sign-in">
        <Text color="$color">Sign in to see this invite.</Text>
        {onSignIn && (
          <Button onPress={onSignIn} backgroundColor="$brandGold">
            <Text color="$textOnAccent" fontWeight="700">
              Sign in
            </Text>
          </Button>
        )}
      </YStack>
    );
  } else if (loading) {
    status = <Spinner size="large" />;
  } else if (notFound) {
    status = (
      <Text color="$statusDangerFg" role="alert" testID="join-not-found">
        That invite code doesn&apos;t match a league or mock draft.
      </Text>
    );
  } else if (error) {
    status = (
      <Text color="$statusDangerFg" role="alert">
        Couldn&apos;t check this code. Try again.
      </Text>
    );
  }

  return (
    <YStack
      gap="$4"
      padding="$4"
      maxWidth={560}
      width="100%"
      alignSelf="center"
      testID="join-by-code"
    >
      <H2 fontSize="$8" color="$color">
        Join with a code
      </H2>

      <YStack gap="$2">
        <Text color="$color" fontWeight="600" fontSize="$4">
          Invite Code
        </Text>
        <Input
          placeholder="Enter 8-character code"
          value={codeInput}
          onChangeText={(text: string) =>
            setCodeInput(normalizeInviteCode(text))
          }
          maxLength={8}
          autoCapitalize="characters"
          autoCorrect={false}
          fontFamily="$mono"
          fontSize="$6"
          letterSpacing={2}
          textAlign="center"
          inputMode="text"
          autoComplete="off"
          aria-label="Invite code"
        />
        {!valid && codeInput.length > 0 && (
          <Text color="$textMuted" fontSize="$2">
            Codes are 8 letters and numbers.
          </Text>
        )}
      </YStack>

      {status}

      {preview && <InvitePreviewCard preview={preview} />}

      {preview && alreadyIn && (
        <YStack gap="$2">
          <Text color="$color" testID="join-already-in">
            You&apos;re already in this{' '}
            {preview.__typename === 'MockDraftInvitePreview'
              ? 'mock draft'
              : 'league'}
            .
          </Text>
          {onOpenExisting && (
            <Button
              backgroundColor="$brandGold"
              onPress={() => {
                const target = targetOf(preview);
                if (target) onOpenExisting(target);
              }}
            >
              <Text color="$textOnAccent" fontWeight="700">
                Open
              </Text>
            </Button>
          )}
        </YStack>
      )}

      {preview && !alreadyIn && !joinable && (
        <Text color="$statusDangerFg" role="alert" testID="join-unavailable">
          {preview.__typename === 'MockDraftInvitePreview'
            ? 'This mock draft is no longer taking players.'
            : 'This league is full.'}
        </Text>
      )}

      {preview && !alreadyIn && joinable && (
        <YStack gap="$2">
          <Text color="$color" fontWeight="600" fontSize="$4">
            Team Name
          </Text>
          <Input
            placeholder="Enter your team name"
            value={teamName}
            onChangeText={setTeamName}
            maxLength={40}
            disabled={joining}
            aria-label="Team name"
          />
        </YStack>
      )}

      {joinError && (
        <Text color="$statusDangerFg" role="alert" testID="join-error">
          {joinError}
        </Text>
      )}

      <XStack gap="$3" justifyContent="flex-end">
        <Button
          backgroundColor="transparent"
          borderWidth={1}
          borderColor="$borderColor"
          onPress={onCancel}
          disabled={joining}
        >
          <Text color="$textMuted">Cancel</Text>
        </Button>
        {preview && !alreadyIn && joinable && (
          <Button
            backgroundColor="$brandGold"
            onPress={() => {
              if (canJoin) void join(trimmedTeamName);
            }}
            disabled={!canJoin}
            opacity={canJoin ? 1 : 0.5}
            minWidth={150}
            aria-label="Join"
            testID="join-submit"
          >
            {joining ? (
              <Spinner size="small" color="$textOnAccent" />
            ) : (
              <Text color="$textOnAccent" fontWeight="700">
                {preview.__typename === 'MockDraftInvitePreview'
                  ? 'Join Draft'
                  : 'Join League'}
              </Text>
            )}
          </Button>
        )}
      </XStack>
    </YStack>
  );
}
