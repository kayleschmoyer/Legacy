import { Spinner, Text } from 'tamagui';
import {
  CareerBattingsOrderBy,
  CareerBattingStatsWithPlayerFragment,
  CareerFieldingsOrderBy,
  CareerPitchingsOrderBy,
} from '../../api/db/graphql.generated';
import { useGetCareerBattingStatsQuery, useGetCareerFieldingStatsQuery, useGetCareerPitchingStatsQuery } from '../../api/db/stats/Stats.generated';
import { BattingStatsTable } from './BattingStatsTable';
import { useMemo } from 'react';
import { PitchingStatsTable } from './PitchingStatsTable';
import { FieldingStatsTable } from './FieldingStatsTable';

export function BattingStatsTableWithData(): JSX.Element {
  const { data, loading } = useGetCareerBattingStatsQuery({
    variables: {
      first: 25,
      orderBy: CareerBattingsOrderBy.HrDesc,
    },
  });

  const stats:
    | (CareerBattingStatsWithPlayerFragment | undefined | null)[]
    | undefined = data?.careerBattings?.nodes;

  const filteredStats = useMemo(
    () => stats?.filter((s) => s !== undefined && s !== null),
    [stats],
  );

  if (loading) {
    return <Spinner />;
  }

  if (!filteredStats) {
    return <Text>Could not load batting stats</Text>;
  }

  return <BattingStatsTable stats={filteredStats} />;
}


export function PitchingStatsTableWithData(): JSX.Element {
  const { data, loading } = useGetCareerPitchingStatsQuery({
    variables: {
      first: 25,
      orderBy: CareerPitchingsOrderBy.WDesc,
    },
  });

  const stats = data?.careerPitchings?.nodes;

  const filteredStats = useMemo(
    () => stats?.filter((s) => s !== undefined && s !== null),
    [stats],
  );

  if (loading) {
    return <Spinner />;
  }

  if (!filteredStats) {
    return <Text>Could not load pitching stats</Text>;
  }

  return <PitchingStatsTable stats={filteredStats} />;
}


export function FieldingStatsTableWithData(): JSX.Element {
  const { data, loading } = useGetCareerFieldingStatsQuery({
    variables: {
      first: 25,
      orderBy: CareerFieldingsOrderBy.PoDesc,
    },
  });

  const stats = data?.careerFieldings?.nodes;

  const filteredStats = useMemo(
    () => stats?.filter((s) => s !== undefined && s !== null),
    [stats],
  );

  if (loading) {
    return <Spinner />;
  }

  if (!filteredStats) {
    return <Text>Could not load fielding stats</Text>;
  }

  return <FieldingStatsTable stats={filteredStats} />;
}
