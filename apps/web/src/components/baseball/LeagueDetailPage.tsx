import React from 'react';
import { useParams } from 'react-router-dom';
import { 
  Card, 
  H1, 
  H2, 
  YStack, 
  XStack, 
  Button
} from '@legacy-sports/shared-components';
import { Text, Spinner } from 'tamagui';
import { useGetLeagueByIdQuery } from '../../api/db/graphql.generated';

export function LeagueDetailPage(): React.JSX.Element {
  const { id } = useParams<{ id: string }>();
  const leagueId = parseInt(id || '0', 10);

  const { data, loading, error } = useGetLeagueByIdQuery({
    skip: isNaN(leagueId),
    variables: { id: leagueId }
  });

  if (loading) {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center" padding="$6">
        <Spinner size="large" />
        <Text marginTop="$4" color="$gray10">Loading league...</Text>
      </YStack>
    );
  }

  if (error || !data?.league) {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center" padding="$6">
        <Text color="$red10" fontSize="$5" textAlign="center">
          {error ? `Error: ${error.message}` : `League not found`}
        </Text>
        <Button 
          marginTop="$4"
          onPress={() => window.history.back()}
        >
          Go Back
        </Button>
      </YStack>
    );
  }

  const league = data.league;

  return (
    <YStack flex={1} padding="$6" maxWidth={1200} alignSelf="center" width="100%">
      {/* Header */}
      <YStack marginBottom="$6">
        <H1 size="$9" color="$blue11" marginBottom="$2">
          {league.name}
        </H1>
        <Text color="$gray10" fontSize="$4">
          League ID: {league.id} • Max Roster Size: {league.maxRosterSize}
        </Text>
      </YStack>

      {/* League Info Cards */}
      <XStack gap="$4" flexWrap="wrap">
        {/* Basic Info Card */}
        <Card 
          flex={1} 
          minWidth={300}
          backgroundColor="$blue2"
          borderColor="$blue6"
          padding="$4"
        >
          <H2 size="$6" color="$blue11" marginBottom="$3">
            League Information
          </H2>
          <YStack space="$2">
            <XStack justifyContent="space-between">
              <Text color="$gray11">Owner:</Text>
              <Text color="$gray12" fontWeight="600">User {league.owner}</Text>
            </XStack>
            <XStack justifyContent="space-between">
              <Text color="$gray11">Max Roster:</Text>
              <Text color="$gray12" fontWeight="600">{league.maxRosterSize} players</Text>
            </XStack>
            <XStack justifyContent="space-between">
              <Text color="$gray11">Current Matchup:</Text>
              <Text color="$gray12" fontWeight="600">
                {league.currentMatchup || 'None'}
              </Text>
            </XStack>
          </YStack>
        </Card>

        {/* Coming Soon Card */}
        <Card 
          flex={1} 
          minWidth={300}
          backgroundColor="$gray2"
          borderColor="$gray6"
          padding="$4"
        >
          <H2 size="$6" color="$gray11" marginBottom="$3">
            Coming Soon
          </H2>
          <YStack space="$2">
            <Text color="$gray10">• Team standings</Text>
            <Text color="$gray10">• League members</Text>
            <Text color="$gray10">• Draft information</Text>
            <Text color="$gray10">• Matchup schedules</Text>
            <Text color="$gray10">• League settings</Text>
          </YStack>
        </Card>
      </XStack>

      {/* Development Notice */}
      <Card 
        marginTop="$6"
        backgroundColor="$yellow2"
        borderColor="$yellow6"
        padding="$4"
      >
        <H2 size="$5" color="$yellow11" marginBottom="$2">
          🚧 Development Status
        </H2>
        <Text color="$yellow11">
          This league detail page is currently under development. Advanced features like 
          team management, roster editing, and league administration will be available soon.
        </Text>
        <Button 
          marginTop="$3"
          backgroundColor="$blue9"
          onPress={() => window.history.back()}
        >
          <Text color="white">Back to Leagues</Text>
        </Button>
      </Card>
    </YStack>
  );
}

export default LeagueDetailPage;
