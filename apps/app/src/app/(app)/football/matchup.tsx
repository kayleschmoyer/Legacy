import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Card, Text } from 'tamagui';
import { FootballMatchupScreen } from '../../../screens/leagues/football/FootballMatchupScreen';
import { useGetLeagueByIdQuery } from '../../../api/db/graphql.generated';
import { toIntId } from '../../../common/utilities/RouteUtils';

export default function FootballMatchupRoute(): React.JSX.Element {
  const params = useLocalSearchParams();
  const matchupId = toIntId(params.matchupId);
  const leagueId = toIntId(params.leagueId);

  const { data: leagueData } = useGetLeagueByIdQuery({
    skip: leagueId == null,
    variables: { id: leagueId ?? 0 },
  });

  if (matchupId == null) {
    return (
      <Card
        backgroundColor="$red2"
        borderColor="$red7"
        borderWidth={1}
        padding="$3"
        borderRadius="$4"
      >
        <Text fontSize="$3" color="$red11">
          Invalid matchup.
        </Text>
      </Card>
    );
  }

  return (
    <FootballMatchupScreen
      matchupId={matchupId}
      defensiveFormat={leagueData?.league?.defensiveFormat ?? null}
    />
  );
}
export { ScreenErrorBoundary as ErrorBoundary } from '../_screenErrorBoundary';
