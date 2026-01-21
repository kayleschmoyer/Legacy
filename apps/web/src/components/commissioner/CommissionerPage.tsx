import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, H2, H3, Separator, Text, XStack, YStack } from 'tamagui';
import { useCurrentMatchup } from '../../hooks/useMatchup';
import { GameSelectionControl } from '../commissioner/GameSelectionControl';

/**
 * CommissionerPage - Commissioner controls for league management
 * Includes game selection trigger and other administrative functions
 */
export function CommissionerPage() {
  const { leagueId } = useParams<{ leagueId: string }>();
  const navigate = useNavigate();
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const leagueIdNum = leagueId ? parseInt(leagueId, 10) : null;
  const { matchup, loading, error, refetch } = useCurrentMatchup(leagueIdNum);

  const handleSuccess = () => {
    setSuccessMessage('Game selection triggered successfully!');
    setErrorMessage(null);
    void refetch();
    setTimeout(() => setSuccessMessage(null), 5000);
  };

  const handleError = (err: Error) => {
    setErrorMessage(err.message);
    setSuccessMessage(null);
  };

  return (
    <YStack
      width="100%"
      maxWidth={1200}
      alignSelf="center"
      padding="$4"
      space="$4"
    >
      {/* Header */}
      <XStack
        justifyContent="space-between"
        alignItems="center"
        flexWrap="wrap"
        gap="$2"
      >
        <H2>Commissioner Tools</H2>
        <Button
          theme="alt2"
          onPress={() => navigate(`/baseball/league/${leagueId}`)}
        >
          Back to League
        </Button>
      </XStack>

      {successMessage && (
        <YStack
          padding="$3"
          backgroundColor="$green3"
          borderRadius="$3"
          borderWidth={1}
          borderColor="$green8"
        >
          <Text color="$green11" fontWeight="bold">
            {successMessage}
          </Text>
        </YStack>
      )}

      {errorMessage && (
        <YStack
          padding="$3"
          backgroundColor="$red3"
          borderRadius="$3"
          borderWidth={1}
          borderColor="$red8"
        >
          <Text color="$red11" fontWeight="bold">
            Error: {errorMessage}
          </Text>
        </YStack>
      )}

      <Separator />

      {/* Game Selection Section */}
      <YStack space="$3">
        <H3>Automated Game Selection</H3>

        {loading ? (
          <Text color="$gray11">Loading current matchup...</Text>
        ) : error ? (
          <Text color="$red10">Error loading matchup: {error.message}</Text>
        ) : matchup && matchup.id ? (
          <GameSelectionControl
            leagueId={leagueIdNum ?? 0}
            matchupId={
              typeof matchup.id === 'string'
                ? parseInt(matchup.id, 10)
                : matchup.id
            }
            gamesPerMatchup={matchup.gamesPerMatchup ?? 1}
            onSuccess={handleSuccess}
            onError={handleError}
          />
        ) : (
          <Text color="$gray11">No active matchup found</Text>
        )}

        <Text fontSize="$2" color="$gray10">
          Use this control to trigger automated game selection for the current
          matchup. The system will select games for all teams based on the
          configured rules and the selected season.
        </Text>
      </YStack>

      <Separator />

      {/* Other Commissioner Tools (Placeholder) */}
      <YStack space="$3">
        <H3>Other Commissioner Tools</H3>
        <Text color="$gray11">
          Additional commissioner features coming soon:
        </Text>
        <YStack space="$2" paddingLeft="$4">
          <Text fontSize="$3" color="$gray10">
            • Matchup scheduling configuration
          </Text>
          <Text fontSize="$3" color="$gray10">
            • League settings management
          </Text>
          <Text fontSize="$3" color="$gray10">
            • Team management
          </Text>
          <Text fontSize="$3" color="$gray10">
            • Playoff bracket configuration
          </Text>
        </YStack>
      </YStack>
    </YStack>
  );
}
