/**
 * Scoreboard — web wrapper around the shared, cross-platform
 * `ScoreboardContainer` (LS-7803). This file now owns only the web concerns:
 *  - the GraphQL query + Apollo live polling
 *  - the web-native date navigation control (`<input type="date">` + arrows)
 *
 * All page layout (marquee header, sport filter, counters, status-grouped game
 * grid, and loading/error/empty states) lives in
 * `@legacy-sports/shared-components` so web and native render identical UI
 * (web-canonical principle LS-7790).
 */
import React from 'react';
import { XStack } from 'tamagui';
import {
  offsetDate,
  ScoreboardContainer,
  type ScoreboardGame,
  type SportKey,
  todayISO,
  useScoreboardLivePolling,
} from '@legacy-sports/shared-components';
import { useGetScoreboardQuery } from '@legacy-sports/graphql';

// Re-export so existing unit tests (and callers) can keep importing the pure
// bucketing helper from this module; the implementation now lives in shared.
export { partitionScoreboardGames } from '@legacy-sports/shared-components';

// ─── DateNav (web-only date picker) ─────────────────────────────────────────

function DateNav({
  date,
  onChange,
}: {
  date: string;
  onChange: (d: string) => void;
}) {
  const today = todayISO();
  const isToday = date >= today;

  return (
    <XStack
      alignItems="center"
      gap="$2"
      backgroundColor="$surfacePanel"
      borderColor="$borderColor"
      borderWidth={1}
      borderRadius="$10"
      padding="$1.5"
      role="group"
      aria-label="Scoreboard date navigation"
    >
      <button
        type="button"
        aria-label="Previous day"
        onClick={() => onChange(offsetDate(date, -1))}
        className="date-nav-btn"
      >
        ←
      </button>

      <input
        type="date"
        value={date}
        max={today}
        onChange={(e) => {
          const val = e.target.value;
          if (val) onChange(val <= today ? val : today);
        }}
        aria-label="Scoreboard date"
        data-testid="scoreboard-date-picker"
        className="scoreboard-date-input"
      />

      <button
        type="button"
        aria-label="Next day"
        disabled={isToday}
        onClick={() => !isToday && onChange(offsetDate(date, 1))}
        className="date-nav-btn"
      >
        →
      </button>
    </XStack>
  );
}

// ─── Main component ────────────────────────────────────────────────────────

export function Scoreboard() {
  const [date, setDate] = React.useState(todayISO());
  const [sport, setSport] = React.useState<SportKey>('all');

  const { data, loading, error, startPolling, stopPolling } =
    useGetScoreboardQuery({
      variables: { date },
      fetchPolicy: 'cache-and-network',
      // Keep previously-fetched data on poll errors (e.g. a transient 504 from
      // the upstream MLB feed while the tab is backgrounded). Without this,
      // Apollo's default 'none' policy nulls out `data` on any network error,
      // which would make the rendered scoreboard vanish — see LS-4741.
      errorPolicy: 'all',
      // Skip the network round-trip while NFL is selected — there is no NFL
      // backend yet, and reusing MLB data under an "NFL" label would be
      // misleading.
      skip: sport === 'nfl',
    });

  // The generated `GetScoreboardQuery` shape is structurally compatible with
  // the shared `ScoreboardGame` type — both mirror the same GraphQL fields,
  // so a direct assignment works without a runtime mapping step.
  const games: ScoreboardGame[] = data?.scoreboard?.games ?? [];

  useScoreboardLivePolling({ games, date, startPolling, stopPolling });

  return (
    <ScoreboardContainer
      date={date}
      sport={sport}
      onSportChange={setSport}
      games={games}
      lastUpdated={data?.scoreboard?.lastUpdated}
      loading={loading && !data}
      hasError={!!error && !data?.scoreboard}
      isUnavailable={!loading && !error && !!data && data.scoreboard === null}
      dateNav={<DateNav date={date} onChange={setDate} />}
    />
  );
}
