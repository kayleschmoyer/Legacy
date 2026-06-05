import React, { useMemo, useReducer, useState } from 'react';
import { Button, Input, ScrollView, Spinner, Text, YStack } from 'tamagui';
import { Platform, Table } from '../../platform-components';
import { handleError } from '../../utils/ErrorHandler';
import {
  expandMlbFranchiseAbbrs,
  expandNflFranchiseAbbrs,
  MLB_TEAMS,
  NFL_FRANCHISES,
} from '../../constants/teams';

// Platform-agnostic React components (no React Native imports)
// Using CSS-in-JS for styling instead of StyleSheet

// Cross-platform table implementation
interface TableProps {
  headers: string[];
  data: Array<Array<string | number>>;
  title?: string;
}

const CrossPlatformTable: React.FC<TableProps> = ({ headers, data, title }) => {
  if (Platform.OS === 'web') {
    return (
      <table
        style={{ width: '100%', borderCollapse: 'collapse', marginTop: 16 }}
      >
        <thead>
          <tr>
            {headers.map((header, index) => (
              <th
                key={index}
                style={{
                  padding: 8,
                  border: '1px solid #ddd',
                  backgroundColor: '#f5f5f5',
                  textAlign: 'left',
                }}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  style={{
                    padding: 8,
                    border: '1px solid #ddd',
                  }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  // React Native implementation
  return <Table headers={headers} data={data} title={title} />;
};

// ---------------------------------------------------------------------------
// Filter state machine (LS-7466).
//
// Single useReducer so this PR's opponent + home/away filters, the LS-5700
// date range chip (second-to-merge rebases onto this shape), and any future
// filter (LS-7463 advanced stats, LS-7464 column customization) flow through
// one shape. The dispatched-action surface keeps each control's wiring small
// and makes the API payload obvious from buildGameLogsRequestBody.
// ---------------------------------------------------------------------------

export type GameLogSport = 'mlb' | 'nfl';
export type Venue = 'all' | 'home' | 'away';

export interface FilterState {
  player: string;
  date: string;
  opponentFranchiseIds: string[];
  venue: Venue;
}

type FilterAction =
  | { type: 'setPlayer'; value: string }
  | { type: 'setDate'; value: string }
  | { type: 'setOpponents'; value: string[] }
  | { type: 'setVenue'; value: Venue }
  | { type: 'reset' };

const INITIAL_FILTERS: FilterState = {
  player: '',
  date: '',
  opponentFranchiseIds: [],
  venue: 'all',
};

function filterReducer(state: FilterState, action: FilterAction): FilterState {
  switch (action.type) {
    case 'setPlayer':
      return { ...state, player: action.value };
    case 'setDate':
      return { ...state, date: action.value };
    case 'setOpponents':
      return { ...state, opponentFranchiseIds: action.value };
    case 'setVenue':
      return { ...state, venue: action.value };
    case 'reset':
      return INITIAL_FILTERS;
  }
}

/**
 * Shape the POST body for `/baseball-game-logs`. Exported so unit tests can
 * assert opponent expansion + venue serialization without mocking fetch.
 * (LS-7466, LS-7478)
 */
export function buildGameLogsRequestBody(
  filters: FilterState,
  sport: GameLogSport,
): {
  player_id: string;
  game_date: string;
  opponent_franchise_ids?: string[];
  opponent_abbrs?: string[];
  venue?: 'home' | 'away';
} {
  const expand =
    sport === 'nfl' ? expandNflFranchiseAbbrs : expandMlbFranchiseAbbrs;

  // Relocations (LS-7478): the franchise id is the stable key but historical
  // game logs were stored under the old abbreviation. Expand to every abbr
  // the franchise has ever used so the resolver finds OAK + LV rows for the
  // Athletics, MTL + WSH + WAS rows for the Nationals, etc. Sent alongside
  // the franchise ids so a future resolver can prefer ids and the existing
  // resolver keeps working unchanged.
  const opponentAbbrs = filters.opponentFranchiseIds.flatMap(expand);

  return {
    player_id: filters.player,
    game_date: filters.date,
    ...(filters.opponentFranchiseIds.length > 0
      ? {
          opponent_franchise_ids: filters.opponentFranchiseIds,
          opponent_abbrs: opponentAbbrs,
        }
      : {}),
    ...(filters.venue !== 'all' ? { venue: filters.venue } : {}),
  };
}

// Strict format guards applied before sending to the API (defense-in-depth;
// backend must still use parameterized queries — see LS-5704 follow-up).
const PLAYER_ID_RE = /^[\w-]+$/; // alphanumeric, hyphens, underscores
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/; // YYYY-MM-DD

export interface GameLogsTableProps {
  /**
   * API endpoint for fetching game logs
   * @default 'http://localhost:5000/baseball-game-logs'
   */
  apiEndpoint?: string;
  /**
   * Drives which team list populates the opponent dropdown. The component is
   * sport-agnostic at the UI level; callers pass the sport appropriate to the
   * player being viewed. Defaults to 'mlb' since this is the baseball stats
   * viewer today; NFL is wired so it lights up the moment the football game
   * logs page mounts the component. (LS-7477)
   */
  sport?: GameLogSport;
  /**
   * When true the opponent filter renders as a multi-select so a premium user
   * can compare against a custom set (e.g. all AL East teams). Free users see
   * a single-select. The component never reads premium status itself — that
   * keeps shared-components free of web-only hooks; the app passes it in.
   * (LS-7480, LS-7469)
   */
  isPremium?: boolean;
}

function GameLogsTable({
  apiEndpoint = 'http://localhost:5000/baseball-game-logs',
  sport = 'mlb',
  isPremium = false,
}: GameLogsTableProps) {
  const [filters, dispatch] = useReducer(filterReducer, INITIAL_FILTERS);
  const [data, setData] = useState<
    Record<string, Record<string, string | number>> | undefined
  >(undefined);
  const [stats, setStats] = useState<Array<string>>([]);
  const [loading, setLoading] = useState(false);
  const [inputError, setInputError] = useState<string | null>(null);

  const teamOptions = useMemo(() => {
    if (sport === 'nfl') {
      return NFL_FRANCHISES.map((t) => ({
        id: t.franchiseId,
        label: `${t.currentAbbr} — ${t.currentName}`,
      }));
    }
    return MLB_TEAMS.map((t) => ({
      id: t.franchiseId,
      label: `${t.currentAbbr} — ${t.currentName}`,
    }));
  }, [sport]);

  const onOpponentChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (isPremium) {
      const selected = Array.from(
        e.target.selectedOptions,
        (o) => o.value,
      ).filter(Boolean);
      dispatch({ type: 'setOpponents', value: selected });
    } else {
      dispatch({
        type: 'setOpponents',
        value: e.target.value ? [e.target.value] : [],
      });
    }
  };

  const getGameLog = async () => {
    setInputError(null);

    const trimmedPlayer = filters.player.trim();
    if (!trimmedPlayer) {
      setInputError('Please enter a player ID');
      return;
    }
    if (!PLAYER_ID_RE.test(trimmedPlayer)) {
      setInputError(
        'Player ID may only contain letters, numbers, hyphens, and underscores',
      );
      return;
    }
    if (filters.date && !DATE_RE.test(filters.date)) {
      setInputError('Date must be in YYYY-MM-DD format (e.g. 2024-06-01)');
      return;
    }

    setLoading(true);
    try {
      // Use fetch for cross-platform compatibility
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(buildGameLogsRequestBody(filters, sport)),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- fetch response.json() returns any
      const serverData: Record<
        string,
        Record<string, string | number>
      > = await response.json();

      const games: Record<string, Record<string, string | number>> = {};
      const gameStats: Set<string> = new Set();

      for (const key of Object.keys(serverData)) {
        gameStats.add(key);
        const statData = serverData[key];

        for (const gameNum of Object.keys(statData)) {
          if (!(gameNum in games)) {
            games[gameNum] = {};
          }

          games[gameNum][key] = statData[gameNum];
        }
      }

      setData(games);
      setStats(Array.from(gameStats));
    } catch (error) {
      handleError(error);
    } finally {
      setLoading(false);
    }
  };

  // Prepare table data
  const tableData = data
    ? Object.keys(data).map((gameId) => stats.map((s) => data[gameId][s] || ''))
    : [];

  return (
    <ScrollView flex={1} padding="$4">
      <Text
        fontSize="$5"
        fontWeight="bold"
        marginBottom="$4"
        textAlign="center"
      >
        Retrieve stats for a player
      </Text>

      <YStack marginBottom="$4">
        <Text fontSize="$4" fontWeight="600" marginBottom="$2">
          Player ID:
        </Text>
        <Input
          borderWidth={1}
          borderColor="$gray8"
          borderRadius="$3"
          padding="$3"
          fontSize="$4"
          backgroundColor="$white"
          value={filters.player}
          onChangeText={(v: string) =>
            dispatch({ type: 'setPlayer', value: v })
          }
          placeholder="Enter player ID"
          editable={!loading}
        />
      </YStack>

      <YStack marginBottom="$4">
        <Text fontSize="$4" fontWeight="600" marginBottom="$2">
          Date (optional):
        </Text>
        <Input
          borderWidth={1}
          borderColor="$gray8"
          borderRadius="$3"
          padding="$3"
          fontSize="$4"
          backgroundColor="$white"
          value={filters.date}
          onChangeText={(v: string) => dispatch({ type: 'setDate', value: v })}
          placeholder="YYYY-MM-DD"
          editable={!loading}
        />
      </YStack>

      {/* Opponent filter (LS-7476/77/80). Native renders nothing here today —
          a follow-up will add a cross-platform picker; meanwhile native users
          keep the player + date set without an opponent restriction. */}
      {Platform.OS === 'web' ? (
        <YStack marginBottom="$4">
          <Text fontSize="$4" fontWeight="600" marginBottom="$2">
            Opponent{isPremium ? ' (hold Ctrl/Cmd to select multiple)' : ''}:
          </Text>
          <select
            data-testid="opponent-filter"
            aria-label="Opponent"
            multiple={isPremium}
            value={
              isPremium
                ? filters.opponentFranchiseIds
                : (filters.opponentFranchiseIds[0] ?? '')
            }
            onChange={onOpponentChange}
            disabled={loading}
            style={{
              padding: 8,
              fontSize: 16,
              borderRadius: 4,
              border: '1px solid #ccc',
              minHeight: isPremium ? 120 : undefined,
              width: '100%',
              boxSizing: 'border-box',
            }}
          >
            {!isPremium ? <option value="">All opponents</option> : null}
            {teamOptions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </YStack>
      ) : null}

      {/* Home/Away tri-state (LS-7465). Buttons rather than radio so the
          control styles consistently across web + native via tamagui. */}
      <YStack marginBottom="$4">
        <Text fontSize="$4" fontWeight="600" marginBottom="$2">
          Venue:
        </Text>
        <YStack flexDirection="row" gap="$2">
          {(['all', 'home', 'away'] as const).map((v) => (
            <Button
              key={v}
              data-testid={`venue-${v}`}
              backgroundColor={filters.venue === v ? '$blue10' : '$gray4'}
              onPress={() => dispatch({ type: 'setVenue', value: v })}
              disabled={loading}
              paddingHorizontal="$4"
              paddingVertical="$2"
            >
              <Text
                color={filters.venue === v ? '$white' : '$gray12'}
                fontWeight="600"
              >
                {v === 'all' ? 'All' : v === 'home' ? 'Home' : 'Away'}
              </Text>
            </Button>
          ))}
        </YStack>
      </YStack>

      <Button
        backgroundColor={loading ? '$gray8' : '$blue10'}
        paddingVertical="$3"
        paddingHorizontal="$6"
        borderRadius="$3"
        alignItems="center"
        marginBottom="$4"
        onPress={() => void getGameLog()}
        disabled={loading}
        opacity={loading ? 0.5 : 1}
      >
        {loading ? (
          <Spinner size="small" color="$white" />
        ) : (
          <Text color="$white" fontSize="$4" fontWeight="600">
            Get Player Data
          </Text>
        )}
      </Button>

      {inputError ? (
        <Text color="$red10" fontSize="$3" marginBottom="$4" role="alert">
          {inputError}
        </Text>
      ) : null}

      {data && stats.length > 0 ? (
        <YStack marginTop="$4">
          <CrossPlatformTable headers={stats} data={tableData} />
        </YStack>
      ) : null}
    </ScrollView>
  );
}

export { GameLogsTable };
export default GameLogsTable;
