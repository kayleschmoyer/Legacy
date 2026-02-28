import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, H2, Separator, Spinner, Text, XStack, YStack } from 'tamagui';
import { StandingsTable } from './StandingsTable';
import { PlayoffBracketDisplay } from './PlayoffBracketDisplay';
import { useStandings } from '../../hooks/useStandings';
import { useGetPlayoffBracketQuery } from '../../api/db/graphql.generated';

/**
 * StandingsPage - League standings page with sortable table
 */
export function StandingsPage() {
  const { leagueId } = useParams<{ leagueId: string }>();
  const navigate = useNavigate();

  const leagueIdNum = leagueId ? parseInt(leagueId, 10) : null;
  const { standings, loading, error, refetch } = useStandings(leagueIdNum);
  const { data: bracketData, loading: bracketLoading } =
    useGetPlayoffBracketQuery({
      variables: { leagueId: leagueIdNum ?? 0 },
      skip: !leagueIdNum,
    });

  if (loading) {
    return (
      <YStack
        padding="$4"
        alignItems="center"
        justifyContent="center"
        minHeight={400}
      >
        <Spinner size="large" color="$blue10" />
        <Text marginTop="$2" color="$gray11">
          Loading standings...
        </Text>
      </YStack>
    );
  }

  if (error) {
    return (
      <YStack
        padding="$4"
        alignItems="center"
        justifyContent="center"
        minHeight={400}
      >
        <Text color="$red10" fontSize="$5" fontWeight="bold">
          Error loading standings
        </Text>
        <Text marginTop="$2" color="$gray11">
          {String(error.message)}
        </Text>
        {/* eslint-disable-next-line @typescript-eslint/no-unsafe-return */}
        <Button marginTop="$4" theme="blue" onPress={() => refetch()}>
          Retry
        </Button>
      </YStack>
    );
  }

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
        <H2>League Standings</H2>
        <XStack space="$2">
          {/* eslint-disable-next-line @typescript-eslint/no-unsafe-return */}
          <Button theme="alt2" onPress={() => refetch()}>
            Refresh
          </Button>
          <Button
            theme="blue"
            onPress={() => navigate(`/baseball/league/${leagueId ?? ''}`)}
          >
            Back to League
          </Button>
        </XStack>
      </XStack>

      {/* Standings Table */}
      <StandingsTable standings={standings} loading={loading} error={error} />

      {/* Playoff Bracket */}
      {(bracketLoading || bracketData?.getPlayoffBracket) && (
        <>
          <Separator />
          {bracketLoading ? (
            <XStack justifyContent="center" padding="$4">
              <Spinner size="small" color="$blue10" />
            </XStack>
          ) : bracketData?.getPlayoffBracket ? (
            <PlayoffBracketDisplay bracket={bracketData.getPlayoffBracket} />
          ) : null}
        </>
      )}

      {/* Additional info */}
      <Text fontSize="$2" color="$gray10" textAlign="center">
        Standings update automatically after each matchup completes
      </Text>
    </YStack>
  );
}
