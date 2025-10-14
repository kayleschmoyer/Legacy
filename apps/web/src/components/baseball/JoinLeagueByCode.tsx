import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Card,
  YStack,
  XStack,
} from '@legacy-sports/shared-components';
import { H1, H2, Input, Spinner, Text } from 'tamagui';
import { useJoinLeagueByCodeMutation } from '../../api/db/graphql.generated';

export function JoinLeagueByCode(): React.JSX.Element {
  const navigate = useNavigate();
  const [inviteCode, setInviteCode] = useState('');
  const [teamName, setTeamName] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  const [joinLeague, { loading }] = useJoinLeagueByCodeMutation({
    onCompleted: (data) => {
      if (data.joinLeagueByCode?.leagueId) {
        // Navigate to the league page on success
        navigate(`/baseball/league/${data.joinLeagueByCode.leagueId}`);
      }
    },
    onError: (error) => {
      setError(error.message);
    },
  });

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
      await joinLeague({
        variables: {
          inviteCode: inviteCode.trim().toUpperCase(),
          teamName: teamName.trim(),
        },
      });
    } catch (err) {
      // Error handled by onError callback
      console.error('Error joining league:', err);
    }
  };

  return (
    <YStack flex={1} padding="$6" space="$4" maxWidth={600} margin="auto" width="100%">
      <YStack space="$2">
        <H1 size="$9" color="$blue11">
          🎟️ Join League
        </H1>
        <Text color="$gray11" fontSize="$5">
          Enter the invite code shared by your league commissioner
        </Text>
      </YStack>

      <Card
        backgroundColor="$blue2"
        borderColor="$blue6"
        padding="$5"
      >
        <form onSubmit={handleSubmit}>
          <YStack space="$4">
            {/* Invite Code Input */}
            <YStack space="$2">
              <Text color="$gray12" fontWeight="600" fontSize="$4">
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
                backgroundColor="$background"
                borderColor="$blue7"
                disabled={loading}
              />
              <Text color="$gray10" fontSize="$2">
                Example: ABC12XYZ
              </Text>
            </YStack>

            {/* Team Name Input */}
            <YStack space="$2">
              <Text color="$gray12" fontWeight="600" fontSize="$4">
                Team Name
              </Text>
              <Input
                placeholder="Enter your team name"
                value={teamName}
                onChangeText={setTeamName}
                maxLength={50}
                backgroundColor="$background"
                borderColor="$blue7"
                disabled={loading}
              />
              <Text color="$gray10" fontSize="$2">
                Choose a unique name for your team
              </Text>
            </YStack>

            {/* Error Message */}
            {error && (
              <Card backgroundColor="$red2" borderColor="$red6" padding="$3">
                <Text color="$red11" fontSize="$3">
                  ❌ {error}
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
      <Card
        backgroundColor="$purple2"
        borderColor="$purple6"
        padding="$4"
      >
        <YStack space="$2">
          <H2 size="$5" color="$purple11">
            💡 How It Works
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

export default JoinLeagueByCode;
