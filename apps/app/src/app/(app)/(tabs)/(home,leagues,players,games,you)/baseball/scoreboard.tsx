/**
 * Mobile MLB scoreboard screen (LS-7803). Native data wrapper around the shared
 * cross-platform `ScoreboardContainer` — mirrors the web `Scoreboard` wrapper,
 * owning only the GraphQL query + Apollo live polling and supplying a native
 * date-navigation control. All page layout lives in `@legacy-sports/shared-components`
 * (web-canonical principle LS-7790).
 */
import { useState } from 'react';
import { ScrollView } from 'react-native';
import {
  ScoreboardContainer,
  type ScoreboardGame,
  type SportKey,
  todayISO,
  useScoreboardLivePolling,
} from '@legacy-sports/shared-components';
import { useGetScoreboardQuery } from '@legacy-sports/graphql';
import { SafeScreen } from '../../../../../components/SafeScreen';
import { ScoreboardDateNav } from '../../../../../components/scoreboard/ScoreboardDateNav';

export default function ScoreboardScreen(): React.JSX.Element {
  const [date, setDate] = useState(todayISO());
  const [sport, setSport] = useState<SportKey>('all');

  const { data, loading, error, startPolling, stopPolling } =
    useGetScoreboardQuery({
      variables: { date },
      fetchPolicy: 'cache-and-network',
      // Keep cached data on transient poll errors rather than blanking the
      // screen (parity with web — LS-4741).
      errorPolicy: 'all',
      // No NFL backend yet — skip the round-trip while NFL is selected.
      skip: sport === 'nfl',
    });

  const games: ScoreboardGame[] = data?.scoreboard?.games ?? [];

  useScoreboardLivePolling({ games, date, startPolling, stopPolling });

  return (
    <SafeScreen>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1 }}
        testID="scoreboard-screen"
      >
        <ScoreboardContainer
          date={date}
          sport={sport}
          onSportChange={setSport}
          games={games}
          lastUpdated={data?.scoreboard?.lastUpdated}
          loading={loading && !data}
          hasError={!!error && !data?.scoreboard}
          isUnavailable={
            !loading && !error && !!data && data.scoreboard === null
          }
          dateNav={<ScoreboardDateNav date={date} onChange={setDate} />}
        />
      </ScrollView>
    </SafeScreen>
  );
}

export { ScreenErrorBoundary as ErrorBoundary } from '../../../_screenErrorBoundary';
