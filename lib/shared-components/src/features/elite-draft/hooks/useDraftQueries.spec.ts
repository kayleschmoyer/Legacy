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
        refetch: jest.fn(),
      };
    }
    if (opName === 'GetLiveDraftLeagueDraft') {
      return {
        data: mockDraftError
          ? undefined
          : { getLeagueDraft: { id: 99, selectionMethod: 'snake' } },
        loading: false,
        error: mockDraftError,
        refetch: jest.fn(),
      };
    }
    return {
      data: undefined,
      loading: false,
      error: undefined,
      refetch: jest.fn(),
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
