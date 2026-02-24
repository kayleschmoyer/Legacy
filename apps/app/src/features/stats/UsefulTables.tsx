/* eslint-disable */
import { Spinner, Text } from 'tamagui';
import { useMemo } from 'react';
import { BattingStatsTable } from './BattingStatsTable';
import { PitchingStatsTable } from './PitchingStatsTable';
import { FieldingStatsTable } from './FieldingStatsTable';
import {
  useGetCareerBattingStatsQuery,
  useGetCareerFieldingStatsQuery,
  useGetCareerPitchingStatsQuery,
} from '../../api/db/graphql.generated';
import {
  CareerBattingsOrderBy,
  CareerBattingStatsFragment,
  CareerFieldingsOrderBy,
  CareerPitchingsOrderBy,
} from '../../api/db/graphql.generated';

export function BattingStatsTableWithData(): React.JSX.Element {
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
    return <Spinner color="$blue10" />;
  }

  if (!filteredStats) {
    return (
      <Text color="$color10" fontSize="$4" textAlign="center" padding="$4">
        Could not load batting stats
      </Text>
    );
  }

  return <BattingStatsTable stats={filteredStats} />;
}

export function PitchingStatsTableWithData(): React.JSX.Element {
  const { data, loading } = useGetCareerPitchingStatsQuery({
    variables: {
      first: 25,
      orderBy: CareerPitchingsOrderBy.ErAsc,
    },
  });

  const stats = data?.careerPitchings?.nodes;

  const filteredStats = useMemo(
    () => stats?.filter((s) => s !== undefined && s !== null),
    [stats],
  );

  if (loading) {
    return <Spinner color="$green10" />;
  }

  if (!filteredStats) {
    return (
      <Text color="$color10" fontSize="$4" textAlign="center" padding="$4">
        Could not load pitching stats
      </Text>
    );
  }

  return <PitchingStatsTable stats={filteredStats} />;
}

export function FieldingStatsTableWithData(): React.JSX.Element {
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
    return <Spinner color="$purple10" />;
  }

  if (!filteredStats) {
    return (
      <Text color="$color10" fontSize="$4" textAlign="center" padding="$4">
        Could not load fielding stats
      </Text>
    );
  }

  return <FieldingStatsTable stats={filteredStats} />;
}
