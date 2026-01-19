import { useEffect, useMemo, useState } from 'react';
import { gql, useApolloClient } from '@apollo/client';
import type {
  PlayerCareerStats,
  ScoringStatRecord,
} from '@legacy-sports/shared-components';
import type {
  CareerBatting,
  CareerFielding,
  CareerPitching,
} from '../../api/db/graphql.generated';
import {
  CareerBattingStatsFragmentDoc,
  CareerFieldingStatsFragmentDoc,
  CareerPitchingStatsFragmentDoc,
} from '../../api/db/graphql.generated';

interface GetPlayerCareerStatsQuery {
  readonly batting?: CareerBatting | null;
  readonly fielding?: CareerFielding | null;
  readonly pitching?: CareerPitching | null;
}

interface GetPlayerCareerStatsQueryVariables {
  readonly playerId: number;
}

const GetPlayerCareerStatsDocument = gql`
  query GetPlayerCareerStats($playerId: Int!) {
    batting: playerCareerBatting(playerId: $playerId) {
      ...CareerBattingStats
    }
    fielding: playerCareerFielding(playerId: $playerId) {
      ...CareerFieldingStats
    }
    pitching: playerCareerPitching(playerId: $playerId) {
      ...CareerPitchingStats
    }
  }
  ${CareerBattingStatsFragmentDoc}
  ${CareerFieldingStatsFragmentDoc}
  ${CareerPitchingStatsFragmentDoc}
`;

export interface CareerAverageStatsResult {
  readonly records: Map<number, PlayerCareerStats>;
  readonly loading: boolean;
  readonly error: Error | undefined;
}

function transformCareerStats(
  data: GetPlayerCareerStatsQuery,
): PlayerCareerStats {
  const toNumber = (value: unknown): number | undefined => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string') {
      const parsed = Number.parseFloat(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    }

    return undefined;
  };

  const batting: ScoringStatRecord = data.batting
    ? {
        g: data.batting.games ?? 0,
        pa: data.batting.plateAppearances ?? undefined,
        ab: data.batting.atBats ?? undefined,
        r: data.batting.runs ?? undefined,
        h: data.batting.hits ?? undefined,
        doubles: data.batting.doubles ?? undefined,
        triples: data.batting.triples ?? undefined,
        hr: data.batting.homeRuns ?? undefined,
        rbi: data.batting.rbi ?? undefined,
        sb: data.batting.stolenBases ?? undefined,
        cs: data.batting.caughtStealing ?? undefined,
        bb: data.batting.baseOnBalls ?? undefined,
        so: data.batting.strikeouts ?? undefined,
        gidp: data.batting.groundedIntoDoublePlays ?? undefined,
        hbp: data.batting.hitByPitch ?? undefined,
        sh: data.batting.sacrificeHits ?? undefined,
        tb: data.batting.totalBases ?? undefined,
        ibb: data.batting.intentionalBaseOnBalls ?? undefined,
        avg: toNumber(data.batting.battingAverage),
        obp: toNumber(data.batting.onBasePercentage),
        slg: toNumber(data.batting.sluggingPercentage),
      }
    : { g: 0 };

  const fielding: ScoringStatRecord = data.fielding
    ? {
        g: data.fielding.games ?? 0,
        po: data.fielding.putouts ?? undefined,
        a: data.fielding.assists ?? undefined,
        e: data.fielding.errors ?? undefined,
        dp: data.fielding.doublePlays ?? undefined,
        cs: data.fielding.caughtStealing ?? undefined,
        inn: data.fielding.inningsDefended ?? undefined,
        pct: toNumber(data.fielding.fieldingPercentage),
      }
    : { g: 0 };

  const pitching: ScoringStatRecord = data.pitching
    ? {
        g: data.pitching.games ?? 0,
        outsRecorded: data.pitching.outsRecorded ?? undefined,
        so: data.pitching.strikeouts ?? undefined,
        bb: data.pitching.baseOnBalls ?? undefined,
        er: data.pitching.earnedRuns ?? undefined,
        h: data.pitching.hits ?? undefined,
        w: data.pitching.wins ?? undefined,
        l: data.pitching.losses ?? undefined,
        sv: data.pitching.saves ?? undefined,
        battersFaced: data.pitching.battersFaced ?? undefined,
        era: toNumber(data.pitching.era),
        whip: toNumber(data.pitching.outRate),
      }
    : { g: 0 };

  return { batting, fielding, pitching };
}

function normalizePlayerIds(
  playerIds?: readonly number[] | null,
): readonly number[] {
  if (!Array.isArray(playerIds)) {
    return [];
  }

  const unique = new Set<number>();
  for (const id of playerIds) {
    if (typeof id === 'number' && Number.isFinite(id) && id > 0) {
      unique.add(id);
    }
  }

  return Array.from(unique);
}

export function useCareerAverageStats(
  playerIds?: readonly number[] | null,
): CareerAverageStatsResult {
  const client = useApolloClient();
  const [records, setRecords] = useState<Map<number, PlayerCareerStats>>(
    () => new Map(),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | undefined>(undefined);

  const normalizedIds = useMemo(() => normalizePlayerIds(playerIds), [playerIds]);

  useEffect(() => {
    if (normalizedIds.length === 0) {
      setLoading(false);
      setError(undefined);
      setRecords((previous) => (previous.size === 0 ? previous : new Map()));
      return;
    }

    const missingIds = normalizedIds.filter((id) => !records.has(id));
    if (missingIds.length === 0) {
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(undefined);

    void Promise.all(
      missingIds.map(async (playerId) => {
        const response = await client.query<
          GetPlayerCareerStatsQuery,
          GetPlayerCareerStatsQueryVariables
        >({
          query: GetPlayerCareerStatsDocument,
          variables: { playerId },
          fetchPolicy: 'cache-first',
        });

        return { playerId, data: response.data };
      }),
    )
      .then((results) => {
        if (cancelled) {
          return;
        }

        setRecords((previous) => {
          const next = new Map(previous);
          for (const { playerId, data } of results) {
            next.set(playerId, transformCareerStats(data));
          }
          return next;
        });
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (cancelled) {
          return;
        }

        const message =
          cause instanceof Error
            ? cause.message
            : typeof cause === 'string'
              ? cause
              : 'Unable to load career statistics';
        setError(cause instanceof Error ? cause : new Error(message));
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [client, normalizedIds, records]);

  return { records, loading, error } as const;
}
