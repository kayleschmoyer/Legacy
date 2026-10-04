import React from 'react';
import { act, fireEvent, waitFor } from '@testing-library/react';
import {
  JoinLeagueScreen,
  type JoinLeagueScreenProps,
} from './JoinLeagueScreen';
import { INVITE_CODE_DEBOUNCE_MS } from './useInviteCodeValidation';
import type { InviteCodeLeague, PublicLeagueRow } from './joinLeagueTypes';
import { render } from '../../../test-utils';

// Tamagui's `Sheet.Overlay` and `Sheet.Handle` resolve to undefined under this
// package's jsdom/babel-jest setup, so the real bottom sheet cannot mount here
// (a pre-existing environment limitation — the component ships fine on native).
// This stand-in renders the sheet body inline when open so the sheet's own
// content stays under test.
jest.mock('../../../components/Sheet', () => ({
  Sheet: ({
    open,
    title,
    children,
  }: {
    open: boolean;
    title?: string;
    children?: React.ReactNode;
  }) =>
    open ? (
      <div data-testid="mock-sheet">
        {title ? <span>{title}</span> : null}
        {children}
      </div>
    ) : null,
}));

const VALID_LEAGUE: InviteCodeLeague = {
  leagueId: 7,
  leagueName: 'Legacy League',
  totalSpots: 12,
  availableSpots: 4,
  isFull: false,
  isAlreadyMember: false,
};

const OPEN_ROW: PublicLeagueRow = {
  id: 1,
  name: 'Sandlot Classic',
  sport: 'baseball',
  numberOfTeams: 12,
  totalSpots: 12,
  availableSpots: 8,
  maxRosterSize: 25,
  eraFilter: 'golden_age',
  selectionMethod: 'auction',
  isFull: false,
};

const FULL_ROW: PublicLeagueRow = {
  id: 2,
  name: 'Packed House',
  sport: 'baseball',
  numberOfTeams: 10,
  totalSpots: 10,
  availableSpots: 0,
  isFull: true,
};

function renderScreen(overrides: Partial<JoinLeagueScreenProps> = {}) {
  const props: JoinLeagueScreenProps = {
    sport: 'baseball',
    onClose: jest.fn(),
    validateInviteCode: jest.fn().mockResolvedValue(null),
    onJoinByCode: jest.fn(),
    onGoToLeague: jest.fn(),
    onBrowseQueryChange: jest.fn(),
    onJoinPublic: jest.fn(),
    ...overrides,
  };
  return { props, ...render(<JoinLeagueScreen {...props} />) };
}

/** Enter a complete code and let the debounce + validation settle. */
async function enterCode(input: HTMLElement, code: string): Promise<void> {
  fireEvent.change(input, { target: { value: code } });
  await act(async () => {
    jest.advanceTimersByTime(INVITE_CODE_DEBOUNCE_MS);
    // Flush the validation promise the timer just kicked off.
    await Promise.resolve();
  });
}

describe('JoinLeagueScreen (LS-8812)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('shared chrome (AC1)', () => {
    it('renders the header and both tab cells', () => {
      const { getByText, getByTestId } = renderScreen();

      expect(getByText('Join a League')).toBeTruthy();
      expect(getByTestId('join-tab-invite')).toBeTruthy();
      expect(getByTestId('join-tab-browse')).toBeTruthy();
      expect(getByText('INVITE CODE')).toBeTruthy();
      expect(getByText('BROWSE PUBLIC')).toBeTruthy();
    });

    it('closes via the header X', () => {
      const { props, getByTestId } = renderScreen();
      fireEvent.click(getByTestId('join-close'));
      expect(props.onClose).toHaveBeenCalled();
    });

    it('reports tab changes so the wrapper can lazily start the browse query', () => {
      const onTabChange = jest.fn();
      const { getByTestId } = renderScreen({ onTabChange });

      fireEvent.click(getByTestId('join-tab-browse'));
      expect(onTabChange).toHaveBeenCalledWith('browse');
    });

    it('keeps entered code and team name when switching tabs and back', () => {
      const { getByTestId } = renderScreen();

      fireEvent.change(getByTestId('join-invite-code-input'), {
        target: { value: 'ABC12XYZ' },
      });
      fireEvent.change(getByTestId('join-team-name-input'), {
        target: { value: 'My Team' },
      });

      fireEvent.click(getByTestId('join-tab-browse'));
      fireEvent.click(getByTestId('join-tab-invite'));

      expect(
        (getByTestId('join-invite-code-input') as HTMLInputElement).value,
      ).toBe('ABC12XYZ');
      expect(
        (getByTestId('join-team-name-input') as HTMLInputElement).value,
      ).toBe('My Team');
    });

    it('has no in-form sport selector (AC2)', () => {
      const { queryByText } = renderScreen();
      expect(queryByText(/Baseball/)).toBeNull();
      expect(queryByText(/Football/)).toBeNull();
    });
  });

  describe('invite code deep link (AC3)', () => {
    it('pre-fills the code and starts validating immediately', async () => {
      const validateInviteCode = jest.fn().mockResolvedValue(VALID_LEAGUE);
      const { getByTestId } = renderScreen({
        initialInviteCode: 'abc12xyz',
        validateInviteCode,
      });

      expect(
        (getByTestId('join-invite-code-input') as HTMLInputElement).value,
      ).toBe('ABC12XYZ');

      await act(async () => {
        jest.advanceTimersByTime(INVITE_CODE_DEBOUNCE_MS);
        // Flush the validation promise the timer just kicked off.
        await Promise.resolve();
      });
      expect(validateInviteCode).toHaveBeenCalledWith('ABC12XYZ');
    });
  });

  describe('validation card states (AC4)', () => {
    it('shows the checking state while in flight', () => {
      const { getByTestId } = renderScreen({
        validateInviteCode: jest.fn(() => new Promise(() => undefined)),
      });

      fireEvent.change(getByTestId('join-invite-code-input'), {
        target: { value: 'ABC12XYZ' },
      });

      expect(getByTestId('join-validation-card-checking')).toBeTruthy();
    });

    it('shows the valid state with league name and spot meter', async () => {
      const { getByTestId, getByText } = renderScreen({
        validateInviteCode: jest.fn().mockResolvedValue(VALID_LEAGUE),
      });

      await enterCode(getByTestId('join-invite-code-input'), 'ABC12XYZ');

      await waitFor(() =>
        expect(getByTestId('join-validation-card-valid')).toBeTruthy(),
      );
      expect(getByText('CODE VALID')).toBeTruthy();
      expect(getByText('Legacy League')).toBeTruthy();
      expect(getByTestId('join-spot-meter')).toBeTruthy();
      expect(getByText('4 of 12 spots left')).toBeTruthy();
    });

    it('shows the invalid state for an unknown code', async () => {
      const { getByTestId, getByText } = renderScreen({
        validateInviteCode: jest.fn().mockResolvedValue(null),
      });

      await enterCode(getByTestId('join-invite-code-input'), 'NOPENOPE');

      await waitFor(() =>
        expect(getByTestId('join-validation-card-invalid')).toBeTruthy(),
      );
      expect(getByText('INVALID CODE')).toBeTruthy();
    });

    it('shows the full state and disables joining', async () => {
      const { props, getByTestId, getByText } = renderScreen({
        validateInviteCode: jest.fn().mockResolvedValue({
          ...VALID_LEAGUE,
          isFull: true,
          availableSpots: 0,
        }),
      });

      await enterCode(getByTestId('join-invite-code-input'), 'ABC12XYZ');
      await waitFor(() =>
        expect(getByTestId('join-validation-card-full')).toBeTruthy(),
      );
      expect(getByText(/LEAGUE FULL — ALL 12 SPOTS TAKEN/)).toBeTruthy();

      fireEvent.change(getByTestId('join-team-name-input'), {
        target: { value: 'My Team' },
      });
      fireEvent.click(getByTestId('join-invite-submit'));
      expect(props.onJoinByCode).not.toHaveBeenCalled();
    });

    it('shows GO TO LEAGUE instead of the join CTA when already a member', async () => {
      const onGoToLeague = jest.fn();
      const { getByTestId, getByText, queryByTestId } = renderScreen({
        validateInviteCode: jest
          .fn()
          .mockResolvedValue({ ...VALID_LEAGUE, isAlreadyMember: true }),
        onGoToLeague,
      });

      await enterCode(getByTestId('join-invite-code-input'), 'ABC12XYZ');
      await waitFor(() =>
        expect(getByTestId('join-validation-card-alreadyMember')).toBeTruthy(),
      );

      expect(getByText("YOU'RE ALREADY IN LEGACY LEAGUE")).toBeTruthy();
      expect(queryByTestId('join-invite-submit')).toBeNull();

      fireEvent.click(getByTestId('join-go-to-league'));
      expect(onGoToLeague).toHaveBeenCalledWith(7);
    });
  });

  describe('join CTA (AC6)', () => {
    it('personalizes the label once the code resolves', async () => {
      const { getByTestId, getByText } = renderScreen({
        validateInviteCode: jest.fn().mockResolvedValue(VALID_LEAGUE),
      });

      expect(getByText('JOIN LEAGUE')).toBeTruthy();

      await enterCode(getByTestId('join-invite-code-input'), 'ABC12XYZ');
      await waitFor(() => expect(getByText('JOIN LEGACY LEAGUE')).toBeTruthy());
    });

    it('stays inert until the code is valid and a team name is entered', async () => {
      const { props, getByTestId } = renderScreen({
        validateInviteCode: jest.fn().mockResolvedValue(VALID_LEAGUE),
      });

      await enterCode(getByTestId('join-invite-code-input'), 'ABC12XYZ');
      await waitFor(() =>
        expect(getByTestId('join-validation-card-valid')).toBeTruthy(),
      );

      // Valid code but no team name yet.
      fireEvent.click(getByTestId('join-invite-submit'));
      expect(props.onJoinByCode).not.toHaveBeenCalled();

      fireEvent.change(getByTestId('join-team-name-input'), {
        target: { value: 'My Team' },
      });
      fireEvent.click(getByTestId('join-invite-submit'));
      expect(props.onJoinByCode).toHaveBeenCalledWith('ABC12XYZ', 'My Team');
    });

    it('shows JOINING… while the mutation is in flight', () => {
      const { getByText } = renderScreen({ joiningByCode: true });
      expect(getByText('JOINING…')).toBeTruthy();
    });

    it('renders a join failure inline', () => {
      const { getByTestId, getByText } = renderScreen({
        inviteError: 'Already a member',
      });
      expect(getByTestId('join-invite-error')).toBeTruthy();
      expect(getByText('Already a member')).toBeTruthy();
    });

    it('counts team-name characters against the 50-char cap', () => {
      const { getByTestId } = renderScreen();
      fireEvent.change(getByTestId('join-team-name-input'), {
        target: { value: 'Sluggers' },
      });
      expect(getByTestId('join-team-name-counter').textContent).toContain(
        '8/50',
      );
    });
  });

  describe('browse ledger (AC7, AC12)', () => {
    it('renders a row per league with meta line and spots fraction', () => {
      const { getByTestId, getByText } = renderScreen({
        browseLeagues: [OPEN_ROW],
        browseTotalCount: 1,
      });

      expect(getByTestId('browse-row-1')).toBeTruthy();
      expect(getByText('Sandlot Classic')).toBeTruthy();
      expect(getByText('12 tm · R25 · Golden Age · Auction')).toBeTruthy();
      expect(getByText('8/12')).toBeTruthy();
      expect(getByTestId('browse-badge-open')).toBeTruthy();
    });

    it('renders FULL rows as inert', () => {
      const { props, getByTestId } = renderScreen({
        browseLeagues: [FULL_ROW],
      });

      expect(getByTestId('browse-badge-full')).toBeTruthy();
      fireEvent.click(getByTestId('browse-row-2'));
      expect(props.onJoinPublic).not.toHaveBeenCalled();
    });

    it('reports the server-side total in the results header', () => {
      const { getByTestId } = renderScreen({
        browseLeagues: [OPEN_ROW],
        browseTotalCount: 37,
      });
      expect(getByTestId('browse-results-count').textContent).toContain(
        '37 LEAGUES',
      );
    });

    it('renders exactly three skeleton rows while loading with no data', () => {
      const { getByTestId, queryByTestId } = renderScreen({
        browseLoading: true,
        browseLeagues: [],
      });

      expect(getByTestId('browse-skeleton-row-0')).toBeTruthy();
      expect(getByTestId('browse-skeleton-row-1')).toBeTruthy();
      expect(getByTestId('browse-skeleton-row-2')).toBeTruthy();
      expect(queryByTestId('browse-skeleton-row-3')).toBeNull();
      // Skeletons stand in for the empty state, not alongside it.
      expect(queryByTestId('browse-empty-state')).toBeNull();
    });

    it('shows rows rather than skeletons when a refetch loads over cached data', () => {
      const { getByTestId, queryByTestId } = renderScreen({
        browseLoading: true,
        browseLeagues: [OPEN_ROW],
      });

      expect(getByTestId('browse-row-1')).toBeTruthy();
      expect(queryByTestId('browse-skeleton-row-0')).toBeNull();
    });

    it('renders the empty state with a clear-filters action', () => {
      const { getByTestId } = renderScreen({
        browseLeagues: [],
        browseLoading: false,
      });
      expect(getByTestId('browse-empty-state')).toBeTruthy();
      expect(getByTestId('browse-clear-filters')).toBeTruthy();
    });
  });

  describe('browse query (AC8, AC9, AC10)', () => {
    it('scopes the initial query to the entry sport', () => {
      const onBrowseQueryChange = jest.fn();
      renderScreen({ sport: 'football', onBrowseQueryChange });

      expect(onBrowseQueryChange).toHaveBeenCalledWith(
        expect.objectContaining({ sport: 'football', sortBy: 'spotsLeft' }),
      );
    });

    it('debounces the search term before emitting a new query', () => {
      const onBrowseQueryChange = jest.fn();
      const { getByTestId } = renderScreen({ onBrowseQueryChange });
      onBrowseQueryChange.mockClear();

      fireEvent.change(getByTestId('browse-search-input'), {
        target: { value: 'sandlot' },
      });
      expect(onBrowseQueryChange).not.toHaveBeenCalled();

      act(() => {
        jest.advanceTimersByTime(300);
      });
      expect(onBrowseQueryChange).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'sandlot' }),
      );
    });

    it('cycles the sort control through all three orders', () => {
      const onBrowseQueryChange = jest.fn();
      const { getByTestId, getByText } = renderScreen({ onBrowseQueryChange });

      expect(getByText('Spots left ▾')).toBeTruthy();

      fireEvent.click(getByTestId('browse-sort-control'));
      expect(getByText('Draft date ▾')).toBeTruthy();
      expect(onBrowseQueryChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ sortBy: 'draftDate' }),
      );

      fireEvent.click(getByTestId('browse-sort-control'));
      expect(getByText('Newest ▾')).toBeTruthy();

      fireEvent.click(getByTestId('browse-sort-control'));
      expect(getByText('Spots left ▾')).toBeTruthy();
    });

    it('shows no filter count and no applied chips by default', () => {
      const { queryByTestId } = renderScreen();
      expect(queryByTestId('browse-filter-count')).toBeNull();
      expect(queryByTestId('browse-applied-filters')).toBeNull();
    });

    it('applies a filter from the sheet, surfacing a chip, a count and a narrowed query', () => {
      const onBrowseQueryChange = jest.fn();
      const { getByTestId } = renderScreen({ onBrowseQueryChange });
      onBrowseQueryChange.mockClear();

      fireEvent.click(getByTestId('browse-filter-button'));
      fireEvent.click(getByTestId('browse-filter-open-spots'));
      fireEvent.click(getByTestId('browse-filter-era-golden_age'));
      fireEvent.click(getByTestId('browse-filter-apply'));

      // Two filters active → count badge reads 2 and both chips render.
      expect(getByTestId('browse-filter-count').textContent).toContain('2');
      expect(getByTestId('browse-applied-openSpots')).toBeTruthy();
      expect(getByTestId('browse-applied-era')).toBeTruthy();

      expect(onBrowseQueryChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          hasOpenSpots: true,
          eraFilter: 'golden_age',
        }),
      );
    });

    it('removes a single filter when its chip is tapped, leaving the rest', () => {
      const onBrowseQueryChange = jest.fn();
      const { getByTestId, queryByTestId } = renderScreen({
        onBrowseQueryChange,
      });

      fireEvent.click(getByTestId('browse-filter-button'));
      fireEvent.click(getByTestId('browse-filter-open-spots'));
      fireEvent.click(getByTestId('browse-filter-era-golden_age'));
      fireEvent.click(getByTestId('browse-filter-apply'));

      fireEvent.click(getByTestId('browse-applied-era'));

      expect(queryByTestId('browse-applied-era')).toBeNull();
      expect(getByTestId('browse-applied-openSpots')).toBeTruthy();
      expect(getByTestId('browse-filter-count').textContent).toContain('1');
      expect(onBrowseQueryChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          hasOpenSpots: true,
          eraFilter: undefined,
        }),
      );
    });

    it('maps a roster-size range onto min/max roster args', () => {
      const onBrowseQueryChange = jest.fn();
      const { getByTestId } = renderScreen({ onBrowseQueryChange });

      fireEvent.click(getByTestId('browse-filter-button'));
      fireEvent.click(getByTestId('browse-filter-roster-standard'));
      fireEvent.click(getByTestId('browse-filter-apply'));

      expect(onBrowseQueryChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ minRosterSize: 21, maxRosterSize: 30 }),
      );
    });

    it('clears every filter back to the entry sport from the sheet', () => {
      const onBrowseQueryChange = jest.fn();
      const { getByTestId, queryByTestId } = renderScreen({
        sport: 'football',
        onBrowseQueryChange,
      });

      fireEvent.click(getByTestId('browse-filter-button'));
      fireEvent.click(getByTestId('browse-filter-open-spots'));
      fireEvent.click(getByTestId('browse-filter-apply'));
      expect(getByTestId('browse-filter-count')).toBeTruthy();

      fireEvent.click(getByTestId('browse-filter-button'));
      fireEvent.click(getByTestId('browse-filter-clear'));
      fireEvent.click(getByTestId('browse-filter-apply'));

      expect(queryByTestId('browse-filter-count')).toBeNull();
      expect(onBrowseQueryChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ sport: 'football', hasOpenSpots: undefined }),
      );
    });
  });

  describe('league detail sheet (AC11)', () => {
    it('opens on row tap and submits the join with the entered team name', async () => {
      const onJoinPublic = jest.fn();
      const { getByTestId } = renderScreen({
        browseLeagues: [OPEN_ROW],
        onJoinPublic,
      });

      fireEvent.click(getByTestId('browse-row-1'));

      await waitFor(() =>
        expect(getByTestId('browse-sheet-team-name')).toBeTruthy(),
      );

      fireEvent.change(getByTestId('browse-sheet-team-name'), {
        target: { value: 'Sluggers' },
      });
      fireEvent.click(getByTestId('browse-sheet-join'));

      expect(onJoinPublic).toHaveBeenCalledWith(OPEN_ROW, 'Sluggers');
    });

    it('renders a join failure inline in the sheet', async () => {
      const { getByTestId, getByText } = renderScreen({
        browseLeagues: [OPEN_ROW],
        browseJoinError: 'League is full',
      });

      fireEvent.click(getByTestId('browse-row-1'));

      await waitFor(() =>
        expect(getByTestId('browse-sheet-error')).toBeTruthy(),
      );
      expect(getByText('League is full')).toBeTruthy();
    });
  });
});
