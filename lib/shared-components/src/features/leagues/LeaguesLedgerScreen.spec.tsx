import React from 'react';
import { fireEvent, render, within } from '@testing-library/react';
import { formatDraftDate } from '@legacy-sports/utils';
import {
  LeaguesLedgerScreen,
  type LeaguesLedgerScreenProps,
} from './LeaguesLedgerScreen';
import { formatDraftDayShort } from '../home/homeSummaryFormatters';
import type { HomeLeagueSummary } from '../home/leagueSummaryStats';

const baseProps: LeaguesLedgerScreenProps = {
  leagues: [],
  onViewLeague: jest.fn(),
  onCreateLeague: jest.fn(),
  onJoinLeague: jest.fn(),
  onBrowseLeagues: jest.fn(),
};

const activeLeague: HomeLeagueSummary = {
  leagueId: 2,
  leagueName: 'Deadball Dynasty',
  sport: 'baseball',
  leaguePhase: 'active',
  eraFilter: 'dead_ball',
  teamCount: 12,
  wins: 8,
  losses: 15,
  rank: 7,
  totalTeams: 12,
};

const liveLeague: HomeLeagueSummary = {
  leagueId: 1,
  leagueName: 'Cooperstown Classic',
  sport: 'baseball',
  leaguePhase: 'active',
  teamCount: 10,
  wins: 14,
  losses: 9,
  rank: 2,
  totalTeams: 10,
  matchupId: 55,
  matchupStatus: 'in_progress',
  userScore: 84.2,
  opponentScore: 76.8,
  opponentTeamName: 'Bronx Bombers',
};

const DRAFT_AT = '2026-08-02T19:00:00.000Z';

const preDraftLeague: HomeLeagueSummary = {
  leagueId: 3,
  leagueName: 'Century Draft League',
  sport: 'baseball',
  leaguePhase: 'pre-draft',
  draftScheduledAt: DRAFT_AT,
  teamCount: 10,
  isCommissioner: true,
};

describe('LeaguesLedgerScreen', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('loading', () => {
    it('renders only a spinner while leagues are fetching', () => {
      const { queryByTestId } = render(
        <LeaguesLedgerScreen {...baseProps} loading />,
      );
      expect(queryByTestId('leagues-list')).toBeNull();
      expect(queryByTestId('leagues-masthead')).toBeNull();
    });
  });

  describe('safe-area handling', () => {
    // LS-8758: the header must clear the Android status bar, mirroring the
    // Home tab's `topInset` treatment (LS-8625).
    it('pads the loading state by the top safe-area inset', () => {
      const { getByTestId } = render(
        <LeaguesLedgerScreen {...baseProps} loading topInset={44} />,
      );
      // jest-dom's toHaveStyle coerces a bare number through the CSSOM,
      // which rejects an un-suffixed length value and leaves the check
      // vacuous — assert the CSS string form instead (see jest-setup-web.js
      // and jest-setup-mobile.js's LS-9459 notes).
      expect(getByTestId('leagues-ledger-loading')).toHaveStyle({
        paddingTop: '44px',
      });
    });

    it('pads the ledger scroll view by the top safe-area inset', () => {
      const { getByTestId } = render(
        <LeaguesLedgerScreen {...baseProps} topInset={44} />,
      );
      expect(getByTestId('leagues-ledger-scroll')).toHaveStyle({
        paddingTop: '44px',
      });
    });
  });

  describe('masthead', () => {
    it('shows the league count and the active-only aggregate record', () => {
      const { getByTestId } = render(
        <LeaguesLedgerScreen
          {...baseProps}
          leagues={[liveLeague, activeLeague, preDraftLeague]}
        />,
      );
      // 14-9 and 8-15 are active; the pre-draft league contributes nothing.
      expect(getByTestId('leagues-masthead-meta').textContent).toBe(
        '3 leagues · 22-24',
      );
    });

    it('singularizes the league count', () => {
      const { getByTestId } = render(
        <LeaguesLedgerScreen {...baseProps} leagues={[activeLeague]} />,
      );
      expect(getByTestId('leagues-masthead-meta').textContent).toBe(
        '1 league · 8-15',
      );
    });

    it('includes ties in the aggregate record when any league has them', () => {
      const { getByTestId } = render(
        <LeaguesLedgerScreen
          {...baseProps}
          leagues={[{ ...activeLeague, ties: 2 }]}
        />,
      );
      expect(getByTestId('leagues-masthead-meta').textContent).toBe(
        '1 league · 8-15-2',
      );
    });

    it('omits the record when no league is active', () => {
      const { getByTestId } = render(
        <LeaguesLedgerScreen {...baseProps} leagues={[preDraftLeague]} />,
      );
      expect(getByTestId('leagues-masthead-meta').textContent).toBe('1 league');
    });
  });

  describe('rows', () => {
    it('renders a row per league with the column header', () => {
      const { getByTestId, getByText } = render(
        <LeaguesLedgerScreen
          {...baseProps}
          leagues={[liveLeague, activeLeague]}
        />,
      );
      expect(getByText('LEAGUE')).toBeTruthy();
      expect(getByText('W-L')).toBeTruthy();
      expect(getByText('RK')).toBeTruthy();
      expect(getByTestId('league-row-1')).toBeTruthy();
      expect(getByTestId('league-row-2')).toBeTruthy();
    });

    it('renders the record and rank for an active league', () => {
      const { getByTestId } = render(
        <LeaguesLedgerScreen {...baseProps} leagues={[activeLeague]} />,
      );
      // Scoped to the row — the footer aggregate repeats the same record when
      // there is only one active league.
      const row = within(getByTestId('league-row-2'));
      expect(row.getByText('8-15')).toBeTruthy();
      expect(row.getByText('/12')).toBeTruthy();
    });

    it('renders an em dash when the league is unranked', () => {
      const { getByText } = render(
        <LeaguesLedgerScreen
          {...baseProps}
          leagues={[{ ...activeLeague, rank: null, totalTeams: null }]}
        />,
      );
      expect(getByText('—')).toBeTruthy();
    });

    it('renders the era and team-count sub-line by default', () => {
      const { getByText } = render(
        <LeaguesLedgerScreen {...baseProps} leagues={[activeLeague]} />,
      );
      expect(getByText('Dead Ball era · 12 teams')).toBeTruthy();
    });

    it('renders the live score sub-line for a league with a matchup in progress', () => {
      const { getByText } = render(
        <LeaguesLedgerScreen {...baseProps} leagues={[liveLeague]} />,
      );
      expect(getByText('Live — 84.2 to 76.8 over Bronx Bombers')).toBeTruthy();
    });

    it('shows the day-only draft date instead of a record when a pre-draft league is scheduled', () => {
      const { getByText, getByTestId, queryByText } = render(
        <LeaguesLedgerScreen {...baseProps} leagues={[preDraftLeague]} />,
      );
      // The narrow W-L column gets the day; the sub-line keeps the full
      // date-and-time string.
      const row = within(getByTestId('league-row-3'));
      expect(
        row.getByText(formatDraftDayShort(DRAFT_AT).toUpperCase()),
      ).toBeTruthy();
      expect(getByText(`Drafts ${formatDraftDate(DRAFT_AT)}`)).toBeTruthy();
      expect(queryByText('0-0')).toBeNull();
    });

    it('falls back to the record when a pre-draft league has no scheduled date', () => {
      const { getByTestId, queryByText, getByText } = render(
        <LeaguesLedgerScreen
          {...baseProps}
          leagues={[{ ...preDraftLeague, draftScheduledAt: null }]}
        />,
      );
      // An em dash, not "0-0": this league carries no standings, and inventing
      // a zeroed record is the wrong-then-corrected flash LS-9528 removes.
      // Scoped to the row — the aggregate footer renders its own dash, so a
      // document-wide count would be asserting on unrelated markup.
      const row = within(getByTestId('league-row-3'));
      expect(row.getAllByText('—')).toHaveLength(2); // record + rank
      expect(queryByText('0-0')).toBeNull();
      expect(getByText('10 teams · pre-draft')).toBeTruthy();
    });

    it('shows a real 0-0 record rather than an em dash once standings land', () => {
      const { getByText } = render(
        <LeaguesLedgerScreen
          {...baseProps}
          leagues={[
            {
              ...preDraftLeague,
              draftScheduledAt: null,
              wins: 0,
              losses: 0,
              ties: 0,
            },
          ]}
        />,
      );
      expect(getByText('0-0')).toBeTruthy();
    });

    it('renders the COMM chip only for leagues the user commissions', () => {
      const { queryByTestId } = render(
        <LeaguesLedgerScreen
          {...baseProps}
          leagues={[preDraftLeague, activeLeague]}
        />,
      );
      expect(queryByTestId('league-row-3-comm')).toBeTruthy();
      expect(queryByTestId('league-row-2-comm')).toBeNull();
    });

    it('falls back to "Unnamed League" when the name is missing', () => {
      const { getByText } = render(
        <LeaguesLedgerScreen
          {...baseProps}
          leagues={[{ ...activeLeague, leagueName: null }]}
        />,
      );
      expect(getByText('Unnamed League')).toBeTruthy();
    });

    it('calls onViewLeague with the pressed summary', () => {
      const onViewLeague = jest.fn();
      const { getByTestId } = render(
        <LeaguesLedgerScreen
          {...baseProps}
          leagues={[activeLeague]}
          onViewLeague={onViewLeague}
        />,
      );
      fireEvent.click(getByTestId('league-row-2'));
      expect(onViewLeague).toHaveBeenCalledWith(activeLeague);
    });
  });

  describe('ordering', () => {
    it('puts live matchups first, then active leagues by rank, then pre-draft', () => {
      const secondPlace = { ...activeLeague, leagueId: 4, rank: 3 };
      const { container } = render(
        <LeaguesLedgerScreen
          {...baseProps}
          leagues={[preDraftLeague, activeLeague, secondPlace, liveLeague]}
        />,
      );
      const order = Array.from(
        container.querySelectorAll('[data-testid^="league-row-"]'),
      )
        .map((el) => el.getAttribute('data-testid'))
        .filter((id) => id !== null && !id.endsWith('-comm'));
      expect(order).toEqual([
        'league-row-1', // live
        'league-row-4', // active, rank 3
        'league-row-2', // active, rank 7
        'league-row-3', // pre-draft
      ]);
    });
  });

  describe('footer', () => {
    it('shows the season-to-date aggregate matching the masthead', () => {
      const { getByTestId } = render(
        <LeaguesLedgerScreen
          {...baseProps}
          leagues={[liveLeague, activeLeague, preDraftLeague]}
        />,
      );
      const footer = getByTestId('leagues-ledger-footer');
      expect(footer.textContent).toContain('Season to date across all leagues');
      expect(footer.textContent).toContain('22-24');
    });

    it('shows an em dash when no league is active', () => {
      const { getByTestId } = render(
        <LeaguesLedgerScreen {...baseProps} leagues={[preDraftLeague]} />,
      );
      expect(getByTestId('leagues-ledger-footer').textContent).toContain('—');
    });
  });

  describe('actions', () => {
    it('renders both editorial buttons and wires their callbacks', () => {
      const onCreateLeague = jest.fn();
      const onJoinLeague = jest.fn();
      const { getByTestId, getByText } = render(
        <LeaguesLedgerScreen
          {...baseProps}
          leagues={[activeLeague]}
          onCreateLeague={onCreateLeague}
          onJoinLeague={onJoinLeague}
        />,
      );
      expect(getByText('CREATE LEAGUE')).toBeTruthy();
      expect(getByText('JOIN LEAGUE')).toBeTruthy();

      fireEvent.click(getByTestId('leagues-create-button'));
      expect(onCreateLeague).toHaveBeenCalledTimes(1);

      fireEvent.click(getByTestId('leagues-add-button'));
      expect(onJoinLeague).toHaveBeenCalledTimes(1);
    });

    it('keeps the add button available in the empty state', () => {
      const { getByTestId } = render(<LeaguesLedgerScreen {...baseProps} />);
      expect(getByTestId('leagues-add-button')).toBeTruthy();
    });
  });

  describe('empty state', () => {
    it('renders the trophy copy and browse CTA instead of the ledger', () => {
      const onBrowseLeagues = jest.fn();
      const { getByTestId, getByText, queryByTestId } = render(
        <LeaguesLedgerScreen
          {...baseProps}
          onBrowseLeagues={onBrowseLeagues}
        />,
      );
      expect(queryByTestId('leagues-list')).toBeNull();
      expect(getByText('You are not in any leagues yet.')).toBeTruthy();

      fireEvent.click(getByTestId('leagues-browse-cta'));
      expect(onBrowseLeagues).toHaveBeenCalledTimes(1);
    });

    it('still renders the masthead above the empty state', () => {
      const { getByTestId, getByText } = render(
        <LeaguesLedgerScreen {...baseProps} />,
      );
      expect(getByText('THE CLUBHOUSE')).toBeTruthy();
      expect(getByTestId('leagues-masthead-meta').textContent).toBe(
        '0 leagues',
      );
    });
  });
});
