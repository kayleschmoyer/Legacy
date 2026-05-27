import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, H2, Spinner, Text, XStack, YStack } from 'tamagui';
import { StandingsTable } from '@legacy-sports/shared-components';
import { useStandings } from '../../hooks/useStandings';
import {
  BRAND_NAVY,
  BRAND_NAVY_DARK,
  BRAND_NAVY_LIGHT,
} from '../../constants/colors';

/**
 * StandingsPage - League standings page with sortable table
 */
export function StandingsPage() {
  const { leagueId } = useParams<{ leagueId: string }>();
  const navigate = useNavigate();

  const leagueIdNum = leagueId ? parseInt(leagueId, 10) : null;
  const { standings, loading, error, refetch } = useStandings(leagueIdNum);

  if (loading) {
    return (
      <YStack
        padding="$4"
        alignItems="center"
        justifyContent="center"
        minHeight={400}
      >
        <Spinner size="large" color={BRAND_NAVY_LIGHT} />
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
          {error?.message ?? 'An unexpected error occurred'}
        </Text>
        {}
        <Button
          marginTop="$4"
          backgroundColor={BRAND_NAVY_LIGHT}
          color="white"
          pressStyle={{ backgroundColor: BRAND_NAVY_DARK }}
          hoverStyle={{ backgroundColor: BRAND_NAVY }}
          onPress={() => refetch()}
        >
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
          {}
          <Button theme="alt2" onPress={() => refetch()}>
            Refresh
          </Button>
          <Button
            backgroundColor={BRAND_NAVY_LIGHT}
            color="white"
            pressStyle={{ backgroundColor: BRAND_NAVY_DARK }}
            hoverStyle={{ backgroundColor: BRAND_NAVY }}
            onPress={() => navigate(`/baseball/league/${leagueId ?? ''}`)}
          >
            Back to League
          </Button>
        </XStack>
      </XStack>

      {/* Standings Table */}
      <StandingsTable standings={standings} loading={loading} error={error} />

      {/* Additional info */}
      <Text fontSize="$2" color="$gray10" textAlign="center">
        Standings update automatically after each matchup completes
      </Text>
    </YStack>
  );
}
