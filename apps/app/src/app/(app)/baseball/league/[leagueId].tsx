import { useGlobalSearchParams, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { HeaderTitleProps } from '@react-navigation/elements';
import { H3, Spinner, Text, YStack } from 'tamagui';
import {
  LeagueFragment,
  TeamFragment,
} from '../../../../api/db/graphql.generated';
import { useGetLeagueByIdQuery } from '../../../../api/db/leagues/Leagues.generated';

interface TeamNameProps {
  team: TeamFragment;
  leagueData: LeagueFragment;
  standing: number;
}

function TeamName(props: TeamNameProps): React.JSX.Element {
  const { team, leagueData, standing } = props;

  const owner = useMemo(() => {
    const member = leagueData.leagueMembers?.nodes.find(
      (m) => m?.teamId === team.id,
    );

    if (!member) {
      return undefined;
    }

    return member.user?.username;
  }, [leagueData.leagueMembers, team.id]);

  return (
    <YStack padding="$4">
      <Text fontSize="$5" fontWeight="600" paddingVertical="$2">
        {standing}
      </Text>
      <Text fontSize="$4" paddingVertical="$2">
        {team.name}
      </Text>
      <Text fontSize="$4" color="$gray10" paddingVertical="$2">
        {owner || ''}
      </Text>
      <Text fontSize="$4" paddingVertical="$2">
        0-0
      </Text>
    </YStack>
  );
}

export default function LeagueId(): React.JSX.Element {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
  const params = useLocalSearchParams();
  const leagueId = params.leagueId;

  const leagueIdStr =
    typeof leagueId === 'string'
      ? leagueId
      : Array.isArray(leagueId)
        ? leagueId[0]
        : '';
  const numLeagueId = parseInt(leagueIdStr, 10);

  const { data, loading } = useGetLeagueByIdQuery({
    skip: isNaN(numLeagueId),
    variables: {
      id: numLeagueId,
    },
  });

  if (loading) {
    return <Spinner />;
  }

  const league = data?.league;
  if (!league) {
    return <Text>Could not find league with id {leagueId}</Text>;
  }

  return (
    <YStack padding="$4">
      <H3 marginBottom="$3">Standings</H3>
      <YStack space="$2">
        {league.teams?.nodes.map((t, idx) =>
          t ? (
            <TeamName key={t.id} team={t} standing={idx} leagueData={league} />
          ) : null,
        )}
      </YStack>
    </YStack>
  );
}

export function LeagueIdHeader(props: HeaderTitleProps): React.JSX.Element {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
  const params = useGlobalSearchParams();
  const leagueId = params.leagueId;

  const leagueIdStr =
    typeof leagueId === 'string'
      ? leagueId
      : Array.isArray(leagueId)
        ? leagueId[0]
        : '';
  const numLeagueId = parseInt(leagueIdStr, 10);

  const { data } = useGetLeagueByIdQuery({
    skip: isNaN(numLeagueId),
    variables: {
      id: numLeagueId,
    },
  });

  return <H3>{data ? data.league?.name : ''}</H3>;
}
