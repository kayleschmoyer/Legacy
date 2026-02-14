import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Card, XStack, YStack } from '@legacy-sports/shared-components';
import { H1, H2, Input, Spinner, Text } from 'tamagui';
import { useJoinLeagueByCodeMutation } from '../../api/db/graphql.generated';

export function JoinLeagueByCodePage(): React.JSX.Element {
  const navigate = useNavigate();
  const { inviteCode: urlInviteCode } = useParams<{ inviteCode?: string }>();
  const [inviteCode, setInviteCode] = useState('');
  const [teamName, setTeamName] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Auto-fill invite code from URL parameter if present
  useEffect(() => {
    if (urlInviteCode) {
      setInviteCode(urlInviteCode.toUpperCase());
    }
  }, [urlInviteCode]);

  const [joinLeague, { loading }] = useJoinLeagueByCodeMutation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate inputs
    if (!inviteCode.trim()) {
      setError('Please enter an invite code');
      return;
    }

    if (!teamName.trim()) {
      setError('Please enter a team name');
      return;
    }

    // Validate invite code format (8 uppercase alphanumeric characters)
    const codePattern = /^[A-Z0-9]{8}$/;
    if (!codePattern.test(inviteCode.trim().toUpperCase())) {
      setError('Invite code must be 8 characters (letters and numbers only)');
      return;
    }

    try {
      const result = await joinLeague({
        variables: {
          inviteCode: inviteCode.trim().toUpperCase(),
          teamName: teamName.trim(),
        },
      });

      // Handle successful join
      if (result.data?.joinLeagueByCode?.leagueId) {
        navigate(`/baseball/league/${result.data.joinLeagueByCode.leagueId}`);
      }
    } catch (err) {
      setError((err as Error).message || 'Failed to join league');
      console.error('Error joining league:', err);
    }
  };

  return (
    <YStack
      flex={1}
      padding="$6"
      space="$4"
      maxWidth={600}
      margin="auto"
      width="100%"
      role="main"
      aria-labelledby="join-league-title"
    >
      <YStack space="$2">
        <H1 size="$9" color="$blue11" id="join-league-title">
          <span role="img" aria-label="ticket">
            🎟️
          </span>{' '}
          Join League
        </H1>
        <Text color="$gray11" fontSize="$5">
          {urlInviteCode
            ? 'Your invite code has been pre-filled. Just enter your team name to join!'
            : 'Enter the invite code shared by your league commissioner'}
        </Text>
      </YStack>

      {urlInviteCode && (
        <Card
          backgroundColor="$green2"
          borderColor="$green6"
          padding="$3"
          role="status"
          aria-live="polite"
        >
          <XStack gap="$2" alignItems="center">
            <Text fontSize="$4">
              <span role="img" aria-label="check">
                ✅
              </span>
            </Text>
            <Text color="$green11" fontSize="$3" fontWeight="600">
              Invite code loaded from link! Ready to join.
            </Text>
          </XStack>
        </Card>
      )}

      <Card backgroundColor="$blue2" borderColor="$blue6" padding="$5">
        <form
          onSubmit={(e) => {
            void handleSubmit(e);
          }}
          aria-describedby="join-form-help"
          aria-busy={loading}
        >
          <YStack space="$4">
            {/* Invite Code Input */}
            <YStack space="$2">
              <Text
                color="$gray12"
                fontWeight="600"
                fontSize="$4"
                id="invite-code-label"
              >
                Invite Code
              </Text>
              <label htmlFor="invite-code" className="sr-only">
                Invite Code
              </label>
              <Input
                placeholder="Enter 8-character code"
                value={inviteCode}
                onChangeText={(text: string) =>
                  setInviteCode(text.toUpperCase())
                }
                maxLength={8}
                autoCapitalize="characters"
                autoCorrect={false}
                fontFamily="$mono"
                fontSize="$6"
                letterSpacing={2}
                textAlign="center"
                backgroundColor="$background"
                borderColor="$blue7"
                disabled={loading}
                id="invite-code"
                aria-labelledby="invite-code-label"
                aria-describedby={`invite-code-help${error?.toLowerCase().includes('invite code') || error?.toLowerCase().includes('8') ? ' invite-code-error' : ''}`}
                aria-required="true"
                aria-invalid={Boolean(
                  error &&
                  (error.toLowerCase().includes('invite code') ||
                    error.toLowerCase().includes('8')),
                )}
                inputMode="text"
                autoComplete="off"
              />
              <Text color="$gray10" fontSize="$2" id="invite-code-help">
                Example: ABC12XYZ
              </Text>
            </YStack>

            {/* Team Name Input */}
            <YStack space="$2">
              <Text
                color="$gray12"
                fontWeight="600"
                fontSize="$4"
                id="team-name-label"
              >
                Team Name
              </Text>
              <label htmlFor="team-name" className="sr-only">
                Team Name
              </label>
              <Input
                placeholder="Enter your team name"
                value={teamName}
                onChangeText={setTeamName}
                maxLength={50}
                backgroundColor="$background"
                borderColor="$blue7"
                disabled={loading}
                id="team-name"
                aria-labelledby="team-name-label"
                aria-describedby={`team-name-help${error?.toLowerCase().includes('team name') ? ' team-name-error' : ''}`}
                aria-required="true"
                aria-invalid={Boolean(
                  error && error.toLowerCase().includes('team name'),
                )}
                inputMode="text"
                autoComplete="off"
              />
              <Text color="$gray10" fontSize="$2" id="team-name-help">
                Choose a unique name for your team
              </Text>
            </YStack>

            {/* Error Message */}
            {error && (
              <Card
                backgroundColor="$red2"
                borderColor="$red6"
                padding="$3"
                role="alert"
                aria-live="assertive"
              >
                <Text
                  color="$red11"
                  fontSize="$3"
                  id={
                    error.toLowerCase().includes('invite code') ||
                    error.toLowerCase().includes('8')
                      ? 'invite-code-error'
                      : error.toLowerCase().includes('team name')
                        ? 'team-name-error'
                        : 'form-error'
                  }
                >
                  <span role="img" aria-label="error">
                    ❌
                  </span>{' '}
                  {error}
                </Text>
              </Card>
            )}

            {/* Submit Button */}
            <XStack gap="$3" justifyContent="flex-end">
              <Button
                backgroundColor="$gray6"
                color="$gray11"
                onPress={() => navigate('/baseball')}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button
                backgroundColor="$blue9"
                color="white"
                onPress={handleSubmit}
                disabled={loading || !inviteCode.trim() || !teamName.trim()}
                minWidth={150}
                aria-label="Join league"
              >
                {loading ? (
                  <XStack gap="$2" alignItems="center">
                    <Spinner size="small" color="white" />
                    <Text color="white">Joining...</Text>
                  </XStack>
                ) : (
                  'Join League'
                )}
              </Button>
            </XStack>
          </YStack>
        </form>
      </Card>

      {/* Info Card */}
      <Card backgroundColor="$purple2" borderColor="$purple6" padding="$4">
        <YStack space="$2">
          <H2 size="$5" color="$purple11">
            <span role="img" aria-label="lightbulb">
              💡
            </span>{' '}
            How It Works
          </H2>
          <Text color="$gray11" fontSize="$3">
            • Get an invite code from your league's commissioner
          </Text>
          <Text color="$gray11" fontSize="$3">
            • Enter the 8-character code above
          </Text>
          <Text color="$gray11" fontSize="$3">
            • Choose a team name for your league entry
          </Text>
          <Text color="$gray11" fontSize="$3">
            • You'll be added to the league and can start managing your team!
          </Text>
        </YStack>
      </Card>
    </YStack>
  );
}

export default JoinLeagueByCodePage;
