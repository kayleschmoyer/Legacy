/**
 * JoinMockDraftForm — shared, cross-platform form for joining a Shared mock
 * draft lobby by invite code (LS-9181). Mirrors the settled
 * invite-code + team-name shape of the real-league join screens
 * (JoinLeagueByCodePage / league/join.tsx) but purely presentational: the
 * consumer owns the `joinMockDraft` mutation call and post-join navigation.
 */
import React from 'react';
import { Button, Input, Spinner, Text, XStack, YStack } from 'tamagui';

export interface JoinMockDraftFormProps {
  /** Invoked with the trimmed, uppercased code and trimmed team name. */
  onSubmit: (inviteCode: string, teamName: string) => void;
  onCancel: () => void;
  loading?: boolean;
  error?: string | null;
  /** Prefills the code (e.g. from a shared link's query param). */
  initialInviteCode?: string;
}

const CODE_PATTERN = /^[A-Z0-9]{8}$/;

export function JoinMockDraftForm({
  onSubmit,
  onCancel,
  loading = false,
  error = null,
  initialInviteCode,
}: JoinMockDraftFormProps): React.JSX.Element {
  const [inviteCode, setInviteCode] = React.useState(
    initialInviteCode?.toUpperCase() ?? '',
  );
  const [teamName, setTeamName] = React.useState('');

  const trimmedCode = inviteCode.trim().toUpperCase();
  const trimmedTeamName = teamName.trim();
  const canSubmit =
    !loading && CODE_PATTERN.test(trimmedCode) && trimmedTeamName.length > 0;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit(trimmedCode, trimmedTeamName);
  };

  return (
    <YStack gap="$4">
      <YStack gap="$2">
        <Text color="$color" fontWeight="600" fontSize="$4">
          Invite Code
        </Text>
        <Input
          placeholder="Enter 8-character code"
          value={inviteCode}
          onChangeText={(text: string) => setInviteCode(text.toUpperCase())}
          maxLength={8}
          autoCapitalize="characters"
          autoCorrect={false}
          fontFamily="$mono"
          fontSize="$6"
          letterSpacing={2}
          textAlign="center"
          disabled={loading}
          inputMode="text"
          autoComplete="off"
          aria-label="Invite code"
        />
        <Text color="$textMuted" fontSize="$2">
          Example: ABC12XYZ
        </Text>
      </YStack>

      <YStack gap="$2">
        <Text color="$color" fontWeight="600" fontSize="$4">
          Team Name
        </Text>
        <Input
          placeholder="Enter your team name"
          value={teamName}
          onChangeText={setTeamName}
          maxLength={50}
          disabled={loading}
          aria-label="Team name"
        />
      </YStack>

      {error && (
        <YStack
          backgroundColor="$statusDangerBg"
          borderWidth={1}
          borderColor="$statusDangerBorder"
          borderRadius="$3"
          paddingHorizontal="$3"
          paddingVertical="$2"
          role="alert"
        >
          <Text color="$statusDangerFg" fontSize={13}>
            {error}
          </Text>
        </YStack>
      )}

      <XStack gap="$3" justifyContent="flex-end">
        <Button
          backgroundColor="transparent"
          borderWidth={1}
          borderColor="$borderColor"
          onPress={onCancel}
          disabled={loading}
        >
          <Text color="$textMuted">Cancel</Text>
        </Button>
        <Button
          backgroundColor="$brandGold"
          onPress={handleSubmit}
          disabled={!canSubmit}
          opacity={canSubmit ? 1 : 0.5}
          minWidth={150}
          aria-label="Join mock draft"
        >
          {loading ? (
            <XStack gap="$2" alignItems="center">
              <Spinner size="small" color="$textOnAccent" />
              <Text color="$textOnAccent">Joining...</Text>
            </XStack>
          ) : (
            <Text color="$textOnAccent" fontWeight="700">
              Join Draft
            </Text>
          )}
        </Button>
      </XStack>
    </YStack>
  );
}
