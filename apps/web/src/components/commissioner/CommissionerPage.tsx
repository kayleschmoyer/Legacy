import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, H2, H3, Separator, Text, XStack, YStack } from 'tamagui';
import { useCurrentMatchup } from '../../hooks/useMatchup';
import { NextStepControl } from '../commissioner/NextStepControl';
import { announcePolite } from '../../utils/a11y';

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
    const message = 'Game selection triggered successfully!';
    setSuccessMessage(message);
    setErrorMessage(null);
    announcePolite(message);
    void refetch();
    setTimeout(() => setSuccessMessage(null), 5000);
  };

  const handleError = (err: Error) => {
    setErrorMessage(err.message);
    setSuccessMessage(null);
    announcePolite(`Error: ${err.message}`);
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
          role="status"
          aria-live="polite"
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
          role="alert"
          aria-live="assertive"
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

      {/* Next Step Control */}
      <YStack space="$3">
        <H3>Next Step</H3>

        {loading ? (
          <Text color="$gray11">Loading current matchup...</Text>
        ) : error ? (
          <Text color="$red10">Error loading matchup: {error.message}</Text>
        ) : matchup && matchup.id ? (
          <NextStepControl
            leagueId={leagueIdNum ?? 0}
            currentMatchup={matchup}
            gamesPerMatchup={matchup.gamesPerMatchup ?? 1}
            onSuccess={handleSuccess}
            onError={handleError}
          />
        ) : (
          <Text color="$gray11">No active matchup found</Text>
        )}

        <Text fontSize="$2" color="$gray10">
          The system intelligently determines the next action: if games remain
          to be selected, it will select the next game. Once all games are
          selected, it will advance to the next league week.
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
