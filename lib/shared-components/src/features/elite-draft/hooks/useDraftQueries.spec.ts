/**
 * useDraftQueries — GET_DRAFT_TEAM_ORDER skip gating (LS-9245).
 *
 * The compact/native draft board always renders DraftMiniBoard off
 * `boardOrderedTeams` regardless of `viewMode` (it has no view-tab switcher
 * to ever set `viewMode: 'board'`). Once a draft went live, the team-order
 * query was skipped for every non-'board' viewMode — including the compact
 * board — so `boardOrderedTeams` silently fell back to unsorted
 * `leagueTeams`, showing users at the wrong visual draft position on
 * Android. `isCompact: true` must keep the query mounted for a live draft.
 */
import { renderHook } from '@testing-library/react';
import { ServerError } from '@apollo/client';
import { useDraftQueries } from './useDraftQueries';

// Variable and helper names are prefixed `mock` — Jest's module-factory
// sandbox otherwise forbids `jest.mock()` from closing over out-of-scope
// declarations. Matched by GraphQL operation name rather than document
// identity: this repo's jest resolution can load '@legacy-sports/graphql'
// as more than one module instance depending on how the importing file is
// resolved, which makes `document === SomeQuery` comparisons unreliable
// across that boundary.
const mockRecordedCalls: {
  operationName: string | undefined;
  options: { skip?: boolean } | undefined;
}[] = [];

// Settable by individual tests (LS-9492) to simulate a `getLeagueDraft`
// query failure without needing a real Apollo error shape per case.
let mockDraftError: unknown;

// Settable by individual tests (LS-10501) to give a mock draft a
// `draftRoom` payload — its roster slots arrive on `rules`.
let mockDraftRoom: unknown;

// One stable refetch spy per operation (LS-10464), so a test can tell which
// query a returned `refetch*` callback actually re-runs.
const mockRefetchByOperation = new Map<string, jest.Mock>();
function mockRefetchFor(opName: string | undefined): jest.Mock {
  const key = opName ?? '';
  let fn = mockRefetchByOperation.get(key);
  if (!fn) {
    fn = jest.fn();
    mockRefetchByOperation.set(key, fn);
  }
  return fn;
}

const mockLoggerError = jest.fn();
const mockLoggerWarn = jest.fn();
jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    warn: (...args: unknown[]): void => {
      mockLoggerWarn(...args);
    },
    error: (...args: unknown[]): void => {
      mockLoggerError(...args);
    },
    info: jest.fn(),
  },
}));

function mockOperationName(document: {
  definitions: readonly { kind: string; name?: { value: string } }[];
}): string | undefined {
  return document.definitions.find((d) => d.kind === 'OperationDefinition')
    ?.name?.value;
}

jest.mock('@apollo/client/react', () => ({
  useApolloClient: (): unknown => ({}),
  useQuery: (
    document: Parameters<typeof mockOperationName>[0],
    options: { skip?: boolean } | undefined,
  ): unknown => {
    const opName = mockOperationName(document);
    mockRecordedCalls.push({ operationName: opName, options });
    if (opName === 'GetLeagueById') {
      return {
        data: { league: { id: 1, draftStatus: 'in-progress' } },
        loading: false,
        error: undefined,
        refetch: mockRefetchFor(opName),
      };
    }
    if (opName === 'GetDraftRoom' && mockDraftRoom) {
      return {
        data: { draftRoom: mockDraftRoom },
        loading: false,
        error: undefined,
        refetch: mockRefetchFor(opName),
      };
    }
    if (opName === 'GetLiveDraftLeagueDraft') {
      return {
        data: mockDraftError
          ? undefined
          : { getLeagueDraft: { id: 99, selectionMethod: 'snake' } },
        loading: false,
        error: mockDraftError,
        refetch: mockRefetchFor(opName),
      };
    }
    return {
      data: undefined,
      loading: false,
      error: undefined,
      refetch: mockRefetchFor(opName),
    };
  },
}));

function makeServerError(statusCode: number): ServerError {
  // The jest env here has no global `Response`; ServerError only reads
  // `response.status`, so a minimal stand-in is sufficient.
  return new ServerError('Response not successful', {
    response: { status: statusCode } as Response,
    bodyText: '',
  });
}

function draftTeamOrderSkip(): boolean | undefined {
  const call = mockRecordedCalls.find(
    (c) => c.operationName === 'GetDraftTeamOrder',
  );
  return call?.options?.skip;
}

describe('useDraftQueries — GET_DRAFT_TEAM_ORDER skip gating', () => {
  beforeEach(() => {
    mockRecordedCalls.length = 0;
    mockDraftError = undefined;
  });

  it('mounts the team-order query for the compact/native board during a live draft', () => {
    renderHook(() =>
      useDraftQueries({
        leagueId: 1,
        playerSearch: '',
        selectedPosition: '',
        viewMode: 'grid',
        isCompact: true,
      }),
    );

    expect(draftTeamOrderSkip()).toBe(false);
  });

  it('skips the team-order query on the wide desktop grid view during a live draft', () => {
    renderHook(() =>
      useDraftQueries({
        leagueId: 1,
        playerSearch: '',
        selectedPosition: '',
        viewMode: 'grid',
        isCompact: false,
      }),
    );

    expect(draftTeamOrderSkip()).toBe(true);
  });

  it('still mounts the team-order query for the desktop "board" view during a live draft', () => {
    renderHook(() =>
      useDraftQueries({
        leagueId: 1,
        playerSearch: '',
        selectedPosition: '',
        viewMode: 'board',
        isCompact: false,
      }),
    );

    expect(draftTeamOrderSkip()).toBe(false);
  });
});

// LS-9492 (reopened) — the `getLeagueDraft` query on the draft board kept
// unconditionally LOGGER.error-ing a transient upstream-gateway 504, which
// RollbarOutputDestination forwards to Rollbar for every error/fatal log —
// the same class of bug the league-create submit handlers were fixed for,
// but in this unrelated third code path.
describe('useDraftQueries — getLeagueDraft error log level (LS-9492)', () => {
  beforeEach(() => {
    mockRecordedCalls.length = 0;
    mockDraftError = undefined;
    mockLoggerError.mockClear();
    mockLoggerWarn.mockClear();
  });

  it.each([502, 503, 504])(
    'logs a %d getLeagueDraft ServerError at warn, not error',
    (statusCode) => {
      mockDraftError = makeServerError(statusCode);

      renderHook(() =>
        useDraftQueries({
          leagueId: 1,
          playerSearch: '',
          selectedPosition: '',
          viewMode: 'grid',
        }),
      );

      expect(mockLoggerError).not.toHaveBeenCalled();
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        '[Draft] getLeagueDraft: upstream unreachable',
        mockDraftError,
      );
    },
  );

  it('still logs a non-gateway getLeagueDraft ServerError at error', () => {
    mockDraftError = makeServerError(500);

    renderHook(() =>
      useDraftQueries({
        leagueId: 1,
        playerSearch: '',
        selectedPosition: '',
        viewMode: 'grid',
      }),
    );

    expect(mockLoggerWarn).not.toHaveBeenCalled();
    expect(mockLoggerError).toHaveBeenCalledWith(
      '[Draft] getLeagueDraft error:',
      mockDraftError,
    );
  });
});

// LS-10464 — the mock-draft room has no league, so GetLiveDraftLeagueDraft
// (`$leagueId: Int!`) is skipped. Its `refetch` still fires a network request
// with `leagueId: null` when the timer/websocket call `refetchDraft`, so in
// room mode `refetchDraft` must re-run the draft-room query instead.
describe('useDraftQueries — refetchDraft in draft-room mode (LS-10464)', () => {
  beforeEach(() => {
    mockRecordedCalls.length = 0;
    mockRefetchByOperation.clear();
    mockDraftError = undefined;
  });

  it('refetches the draft room, never the league draft, for a mock draft', () => {
    const { result } = renderHook(() =>
      useDraftQueries({
        leagueId: null,
        draftId: 13800,
        playerSearch: '',
        selectedPosition: '',
        viewMode: 'grid',
      }),
    );

    void result.current.refetchDraft();

    expect(mockRefetchFor('GetDraftRoom')).toHaveBeenCalledTimes(1);
    expect(mockRefetchFor('GetLiveDraftLeagueDraft')).not.toHaveBeenCalled();
  });

  it('still refetches the league draft on a league draft board', () => {
    const { result } = renderHook(() =>
      useDraftQueries({
        leagueId: 1,
        playerSearch: '',
        selectedPosition: '',
        viewMode: 'grid',
      }),
    );

    void result.current.refetchDraft();

    expect(mockRefetchFor('GetLiveDraftLeagueDraft')).toHaveBeenCalledTimes(1);
  });
});

// LS-10501 — a mock draft has no `league_positions`, so every roster summary
// on the draft screen (depth chart, slot strip, My Roster rail) reads the
// sport defaults the draft room delivers on `rules`.
describe('useDraftQueries — mock-draft roster slots (LS-10501)', () => {
  beforeEach(() => {
    mockRecordedCalls.length = 0;
    mockRefetchByOperation.clear();
    mockDraftError = undefined;
  });

  afterEach(() => {
    mockDraftRoom = undefined;
  });

  it('derives leaguePositions and maxRosterSize from draftRoom.rules', () => {
    mockDraftRoom = {
      id: 13800,
      seats: [],
      rules: {
        sport: 'football',
        rosterPositions: ['QB', 'RB', 'RB', 'DST'],
        maxRosterSize: 16,
      },
    };
    const { result } = renderHook(() =>
      useDraftQueries({
        leagueId: null,
        draftId: 13800,
        playerSearch: '',
        selectedPosition: '',
        viewMode: 'grid',
      }),
    );

    expect(result.current.leaguePositions.map((p) => p.positionType)).toEqual([
      'QB',
      'RB',
      'RB',
      'DST',
    ]);
    expect(result.current.maxRosterSize).toBe(16);
  });
});
