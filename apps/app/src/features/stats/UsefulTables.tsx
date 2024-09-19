import { Spinner, Text } from '@ui-kitten/components';
import { useMemo } from 'react';
import { BattingStatsTable } from './BattingStatsTable';
import { PitchingStatsTable } from './PitchingStatsTable';
import { FieldingStatsTable } from './FieldingStatsTable';
import {
  useGetCareerBattingStatsQuery,
  useGetCareerFieldingStatsQuery,
  useGetCareerPitchingStatsQuery,
} from '../../api/db/stats/Stats.generated';
import {
  CareerBattingsOrderBy,
  CareerBattingStatsWithPlayerFragment,
  CareerFieldingsOrderBy,
  CareerPitchingsOrderBy,
} from '../../api/db/graphql.generated';

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
    [stats]
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
      orderBy: CareerPitchingsOrderBy.ErAsc,
    },
  });

  const stats = data?.careerPitchings?.nodes;

  const filteredStats = useMemo(
    () => stats?.filter((s) => s !== undefined && s !== null),
    [stats]
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
    [stats]
  );

  if (loading) {
    return <Spinner />;
  }

  if (!filteredStats) {
    return <Text>Could not load fielding stats</Text>;
  }

  return <FieldingStatsTable stats={filteredStats} />;
}
