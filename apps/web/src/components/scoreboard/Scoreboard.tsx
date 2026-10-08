/**
 * Scoreboard — web wrapper around the shared, cross-platform
 * `ScoreboardContainer` (LS-7803). This file now owns only the web concerns:
 *  - the GraphQL query + Apollo live polling
 *  - the web-native date navigation control (`<input type="date">` + arrows)
 *  - keeping the selected date in the URL (`?date=YYYY-MM-DD`, LS-10648)
 *
 * All page layout (marquee header, sport filter, counters, status-grouped game
 * grid, and loading/error/empty states) lives in
 * `@legacy-sports/shared-components` so web and native render identical UI
 * (web-canonical principle LS-7790).
 */
import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Text, XStack, YStack } from 'tamagui';
import {
  formatDisplayDate,
  maxScoreboardDateISO,
  offsetDate,
  ScoreboardContainer,
  type ScoreboardGame,
  type SportKey,
  todayISO,
  useScoreboardLivePolling,
} from '@legacy-sports/shared-components/scoreboard';
import { useGetScoreboardQuery } from '@legacy-sports/graphql';

// Re-export so existing unit tests (and callers) can keep importing the pure
// bucketing helper from this module; the implementation now lives in shared.
export { partitionScoreboardGames } from '@legacy-sports/shared-components/scoreboard';

// ─── DateNav (web-only date picker) ─────────────────────────────────────────
// Exported for unit tests.

export function DateNav({
  date,
  onChange,
}: {
  date: string;
  onChange: (d: string) => void;
}) {
  // Future dates are browsable so users can preview upcoming slates
  // (LS-10456), bounded by how far ahead the schedule feed publishes.
  const maxDate = maxScoreboardDateISO();
  const isAtMax = date >= maxDate;
  // A date typed past the bound is clamped to it — say so instead of
  // silently swapping the user's input for another date.
  const [isClamped, setIsClamped] = React.useState(false);

  const select = (next: string) => {
    setIsClamped(false);
    onChange(next);
  };

  return (
    <YStack alignItems="flex-end" gap="$1">
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
          onClick={() => select(offsetDate(date, -1))}
          className="date-nav-btn"
        >
          ←
        </button>

        <input
          type="date"
          value={date}
          max={maxDate}
          onChange={(e) => {
            const val = e.target.value;
            if (!val) return;
            if (val > maxDate) {
              onChange(maxDate);
              setIsClamped(true);
            } else {
              select(val);
            }
          }}
          aria-label="Scoreboard date"
          data-testid="scoreboard-date-picker"
          className="scoreboard-date-input"
        />

        <button
          type="button"
          aria-label="Next day"
          disabled={isAtMax}
          onClick={() => !isAtMax && select(offsetDate(date, 1))}
          className="date-nav-btn"
        >
          →
        </button>
      </XStack>
      {isClamped && (
        <Text
          role="status"
          fontSize={12}
          color="$color11"
          testID="scoreboard-date-clamped"
        >
          Schedules are only available through {formatDisplayDate(maxDate)}.
        </Text>
      )}
    </YStack>
  );
}

// ─── URL date state (LS-10648) ──────────────────────────────────────────────

const DATE_PARAM = 'date';

/**
 * Resolve the `?date=` search param to a selectable scoreboard date. Applies
 * the same rules as `DateNav` — a real `YYYY-MM-DD` calendar date no later
 * than `maxScoreboardDateISO()` — and falls back to today for a missing,
 * malformed, or out-of-range value. Exported for unit tests.
 */
export function resolveScoreboardDateParam(param: string | null): string {
  if (!param || !/^\d{4}-\d{2}-\d{2}$/.test(param)) return todayISO();
  // Round-tripping through a Date rejects impossible dates like 2026-02-30.
  if (offsetDate(param, 0) !== param) return todayISO();
  if (param > maxScoreboardDateISO()) return todayISO();
  return param;
}

/**
 * The selected date, backed by `?date=` so reload keeps it and Back/Forward
 * step through previously viewed dates. Each change pushes a history entry;
 * today is kept out of the URL so the ticker's plain `/scoreboard` link (and
 * a bookmark of it) always opens today's slate.
 */
function useScoreboardDateParam(): [string, (next: string) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const date = resolveScoreboardDateParam(searchParams.get(DATE_PARAM));

  const setDate = React.useCallback(
    (next: string) => {
      // Re-selecting the current date must not add a duplicate Back step.
      if (next === date) return;
      setSearchParams((prev) => {
        const params = new URLSearchParams(prev);
        if (next === todayISO()) params.delete(DATE_PARAM);
        else params.set(DATE_PARAM, next);
        return params;
      });
    },
    [date, setSearchParams],
  );

  return [date, setDate];
}

// ─── Main component ────────────────────────────────────────────────────────

export function Scoreboard() {
  const [date, setDate] = useScoreboardDateParam();
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
