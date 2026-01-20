import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, H2, H3, Separator, Text, XStack, YStack } from 'tamagui';
import { useGetLeagueByIdQuery } from '../../api/db/graphql.generated';
import { useCurrentMatchup } from '../../hooks/useMatchup';
import { GameSelectionControl } from '../commissioner/GameSelectionControl';
import { MatchupControl } from '../commissioner/MatchupControl';
import { DeleteLeagueControl } from '../commissioner/DeleteLeagueControl';

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

  // Fetch league data for delete control
  const { data: leagueData, loading: leagueLoading } = useGetLeagueByIdQuery({
    variables: { id: leagueIdNum ?? 0 },
    skip: !leagueIdNum,
  });

  const league = leagueData?.league;

  const handleSuccess = (message?: string) => {
    setSuccessMessage(message ?? 'Operation completed successfully!');
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

      {/* Matchup Management Section */}
      <YStack space="$3">
        <H3>Matchup Management</H3>

        {loading ? (
          <Text color="$gray11">Loading current matchup...</Text>
        ) : error ? (
          <Text color="$red10">Error loading matchup: {error.message}</Text>
        ) : (
          <MatchupControl
            leagueId={leagueIdNum ?? 0}
            currentMatchup={matchup}
            onSuccess={() => handleSuccess('Matchup updated successfully!')}
            onError={handleError}
          />
        )}
      </YStack>

      <Separator />

      {/* Game Selection Section */}
      <YStack space="$3">
        <H3>Automated Game Selection</H3>

        {loading ? (
          <Text color="$gray11">Loading current matchup...</Text>
        ) : error ? (
          <Text color="$red10">Error loading matchup: {error.message}</Text>
        ) : matchup && matchup.id && matchup.weekNumber ? (
          <GameSelectionControl
            leagueId={leagueIdNum ?? 0}
            matchupId={
              typeof matchup.id === 'string'
                ? parseInt(matchup.id, 10)
                : matchup.id
            }
            weekNumber={matchup.weekNumber}
            gamesPerMatchup={matchup.gamesPerMatchup ?? 1}
            onSuccess={() =>
              handleSuccess('Game selection triggered successfully!')
            }
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

      {/* Delete League Section */}
      <YStack space="$3">
        <H3>League Management</H3>

        {leagueLoading ? (
          <Text color="$gray11">Loading league data...</Text>
        ) : league ? (
          <DeleteLeagueControl
            leagueId={leagueIdNum ?? 0}
            leagueName={league.name ?? 'Unknown League'}
            onSuccess={() =>
              handleSuccess('League deleted successfully! Redirecting...')
            }
            onError={handleError}
          />
        ) : (
          <Text color="$red10">Error loading league data</Text>
        )}
      </YStack>
    </YStack>
  );
}
