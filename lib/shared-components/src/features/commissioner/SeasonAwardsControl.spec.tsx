/**
 * Regression guard for LS-8789: the season picker used a raw HTML `<select>`/
 * `<option>`. `SeasonAwardsControl` is rendered directly on native (via
 * apps/app's CommissionerScreen) with no `.native.tsx` split, so RN has no
 * view config for those lowercase host tags and crashes with "View config
 * getter callback for component `option` must be a function" — the same
 * class of bug fixed for `div` in LS-8669. The fix swaps in the shared
 * cross-platform `Select` component; this asserts the season picker still
 * renders and drives season-scoped queries correctly.
 */
import React from 'react';
import { SeasonAwardsControl } from './SeasonAwardsControl';
import { act, fireEvent, render, screen, within } from '../../test-utils';

jest.mock('@legacy-sports/graphql', () => ({
  useGetLeagueSeasonAwardsQuery: jest.fn(() => ({
    data: { leagueSeasonAwards: [] },
    loading: false,
  })),
  useGetAwardVotingPeriodQuery: jest.fn(() => ({
    data: { awardVotingPeriod: null },
    loading: false,
  })),
  useGetAwardVoteResultsQuery: jest.fn(() => ({
    data: { awardVoteResults: [] },
  })),
  useGetPlayersWithStatsQuery: jest.fn(() => ({
    data: { playersWithStats: [] },
    loading: false,
  })),
  useOpenAwardVotingMutation: jest.fn(() => [jest.fn()]),
  useCloseAwardVotingMutation: jest.fn(() => [jest.fn()]),
  useDeleteLeagueSeasonAwardMutation: jest.fn(() => [jest.fn()]),
  useUpsertLeagueSeasonAwardMutation: jest.fn(() => [jest.fn()]),
}));

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

describe('SeasonAwardsControl — LS-8789 native-safe season picker', () => {
  it('renders without throwing', () => {
    expect(() =>
      render(<SeasonAwardsControl leagueId={42} currentSeason={3} />),
    ).not.toThrow();
  });

  it('uses the shared cross-platform Select, not a raw <option> list', () => {
    render(<SeasonAwardsControl leagueId={42} currentSeason={3} />);

    // The season picker is the only <select> in the tree (award recipients
    // use a text search combobox, not a dropdown) — it comes from the shared
    // Select component's Tamagui-backed mock, not a literal <select> in
    // this component's source.
    const seasonSelect = screen.getByRole('combobox', {
      name: /select season/i,
    });
    expect(seasonSelect.tagName).toBe('SELECT');
    expect(seasonSelect).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Season 3' })).toBeTruthy();
  });

  it('re-queries season-scoped data when a different season is picked', () => {
    const graphql = jest.requireMock<typeof import('@legacy-sports/graphql')>(
      '@legacy-sports/graphql',
    );

    render(<SeasonAwardsControl leagueId={42} currentSeason={3} />);

    fireEvent.change(screen.getByRole('combobox', { name: /select season/i }), {
      target: { value: '2' },
    });

    expect(graphql.useGetLeagueSeasonAwardsQuery).toHaveBeenLastCalledWith({
      variables: { leagueId: 42, season: 2 },
    });
  });
});

describe('SeasonAwardsControl — LS-10847 consolidated web behaviour', () => {
  const graphql = jest.requireMock<typeof import('@legacy-sports/graphql')>(
    '@legacy-sports/graphql',
  );

  afterEach(() => {
    jest.mocked(graphql.useGetAwardVotingPeriodQuery).mockImplementation(
      () =>
        ({
          data: { awardVotingPeriod: null },
          loading: false,
        }) as unknown as ReturnType<
          typeof graphql.useGetAwardVotingPeriodQuery
        >,
    );
    jest
      .mocked(graphql.useCloseAwardVotingMutation)
      .mockImplementation(
        () =>
          [jest.fn()] as unknown as ReturnType<
            typeof graphql.useCloseAwardVotingMutation
          >,
      );
  });

  it('exposes the panel and per-award row testids used by web e2e', () => {
    render(<SeasonAwardsControl leagueId={42} currentSeason={3} />);

    expect(screen.getByTestId('season-awards-panel')).toBeTruthy();
    for (const key of [
      'mvp',
      'cy_young',
      'rookie_of_the_year',
      'gold_glove',
      'silver_slugger',
    ]) {
      expect(screen.getByTestId(`award-row-${key}`)).toBeTruthy();
    }
  });

  it('labels the season picker "Select season" for assistive tech', () => {
    render(<SeasonAwardsControl leagueId={42} currentSeason={3} />);

    expect(
      screen.getByRole('combobox', { name: /select season/i }),
    ).toBeTruthy();
  });

  it('fires closeVoting only once when Close Voting is double-clicked', () => {
    const closeVoting = jest.fn(() => new Promise<never>(() => undefined));
    jest
      .mocked(graphql.useCloseAwardVotingMutation)
      .mockImplementation(
        () =>
          [closeVoting] as unknown as ReturnType<
            typeof graphql.useCloseAwardVotingMutation
          >,
      );
    jest.mocked(graphql.useGetAwardVotingPeriodQuery).mockImplementation(
      () =>
        ({
          data: {
            awardVotingPeriod: {
              id: 1,
              status: 'open',
              awardTypes: ['mvp'],
            },
          },
          loading: false,
        }) as unknown as ReturnType<
          typeof graphql.useGetAwardVotingPeriodQuery
        >,
    );

    render(<SeasonAwardsControl leagueId={42} currentSeason={3} />);

    const closeButton = screen.getByText(/close voting & tally results/i);
    // Both clicks land before React re-renders with `disabled`, so only the
    // ref guard can stop the second one.
    act(() => {
      fireEvent.click(closeButton);
      fireEvent.click(closeButton);
    });

    expect(closeVoting).toHaveBeenCalledTimes(1);
  });
});

describe('SeasonAwardsControl — LS-10825 clearing the recipient', () => {
  const graphql = jest.requireMock<typeof import('@legacy-sports/graphql')>(
    '@legacy-sports/graphql',
  );

  beforeEach(() => {
    jest.mocked(graphql.useGetPlayersWithStatsQuery).mockImplementation(
      () =>
        ({
          data: {
            players: [
              { id: 7, firstName: 'Babe', lastName: 'Ruth' },
              { id: 8, firstName: 'Lou', lastName: 'Gehrig' },
            ],
          },
          loading: false,
        }) as unknown as ReturnType<typeof graphql.useGetPlayersWithStatsQuery>,
    );
  });

  afterEach(() => {
    jest.mocked(graphql.useGetPlayersWithStatsQuery).mockImplementation(
      () =>
        ({
          data: { playersWithStats: [] },
          loading: false,
        }) as unknown as ReturnType<typeof graphql.useGetPlayersWithStatsQuery>,
    );
  });

  function mvpRow() {
    const row = screen.getByTestId('award-row-mvp');
    const input = within(row).getByLabelText('Search for award recipient');
    const assign = () =>
      within(row).getByRole('button', { name: /assign award/i });
    return { row, input, assign };
  }

  function selectPlayer(input: HTMLElement, row: HTMLElement, name: string) {
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: name.slice(0, 3) } });
    fireEvent.click(within(row).getByText(name));
  }

  it('starts with Assign Award disabled', () => {
    render(<SeasonAwardsControl leagueId={42} currentSeason={3} />);
    expect(mvpRow().assign()).toBeDisabled();
  });

  it('disables Assign Award after the selected recipient is cleared (AC1)', () => {
    render(<SeasonAwardsControl leagueId={42} currentSeason={3} />);
    const { row, input, assign } = mvpRow();

    selectPlayer(input, row, 'Babe Ruth');
    expect(assign()).toBeEnabled();

    fireEvent.focus(input);
    expect(input).toHaveValue('Babe Ruth');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);

    expect(assign()).toBeDisabled();
  });

  it('disables Assign Award after the text is edited without picking a suggestion (AC2)', () => {
    render(<SeasonAwardsControl leagueId={42} currentSeason={3} />);
    const { row, input, assign } = mvpRow();

    selectPlayer(input, row, 'Babe Ruth');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Babe Ruthx' } });

    expect(assign()).toBeDisabled();
  });

  it('re-enables Assign Award when a new suggestion is picked (AC3)', async () => {
    const upsert = jest.fn<Promise<object>, [unknown]>(() =>
      Promise.resolve({}),
    );
    jest
      .mocked(graphql.useUpsertLeagueSeasonAwardMutation)
      .mockImplementation(
        () =>
          [upsert] as unknown as ReturnType<
            typeof graphql.useUpsertLeagueSeasonAwardMutation
          >,
      );
    render(<SeasonAwardsControl leagueId={42} currentSeason={3} />);
    const { row, input, assign } = mvpRow();

    selectPlayer(input, row, 'Babe Ruth');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '' } });
    expect(assign()).toBeDisabled();

    fireEvent.change(input, { target: { value: 'Lou' } });
    fireEvent.click(within(row).getByText('Lou Gehrig'));
    expect(assign()).toBeEnabled();

    fireEvent.click(assign());
    expect(upsert).toHaveBeenCalledWith({
      variables: {
        input: {
          leagueId: 42,
          season: 3,
          playerId: 8,
          awardType: 'mvp',
          notes: undefined,
        },
      },
    });
    expect(await within(row).findByText('Saved!')).toBeTruthy();
  });
});

describe('SeasonAwardsControl — LS-10799 keyboard-selectable recipient search', () => {
  const graphql = jest.requireMock<typeof import('@legacy-sports/graphql')>(
    '@legacy-sports/graphql',
  );

  beforeEach(() => {
    jest.mocked(graphql.useGetPlayersWithStatsQuery).mockImplementation(
      () =>
        ({
          data: {
            players: [
              { id: 21, firstName: 'Clayton', lastName: 'Kershaw' },
              { id: 22, firstName: 'Clay', lastName: 'Holmes' },
            ],
          },
          loading: false,
        }) as unknown as ReturnType<typeof graphql.useGetPlayersWithStatsQuery>,
    );
  });

  afterEach(() => {
    jest.mocked(graphql.useGetPlayersWithStatsQuery).mockImplementation(
      () =>
        ({
          data: { playersWithStats: [] },
          loading: false,
        }) as unknown as ReturnType<typeof graphql.useGetPlayersWithStatsQuery>,
    );
  });

  function cyYoungRow() {
    const row = screen.getByTestId('award-row-cy_young');
    const input = within(row).getByRole('combobox', {
      name: 'Search for award recipient',
    });
    const assign = () =>
      within(row).getByRole('button', { name: /assign award/i });
    return { row, input, assign };
  }

  // react-native-web's TextInput delivers every key (arrows included) to
  // onKeyPress from its keydown listener. The jest Tamagui Input mock forwards
  // onKeyPress as a DOM keypress handler, which React only dispatches for a
  // printable charCode (>= 32) — so give every key one.
  function press(input: HTMLElement, key: string) {
    fireEvent.keyPress(input, { key, charCode: 32 });
  }

  function search(input: HTMLElement, text: string) {
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: text } });
  }

  it('selects the recipient with ArrowDown then Enter and enables Assign Award (AC1)', () => {
    render(<SeasonAwardsControl leagueId={42} currentSeason={3} />);
    const { row, input, assign } = cyYoungRow();

    search(input, 'Clay');
    expect(assign()).toBeDisabled();

    press(input, 'ArrowDown');
    press(input, 'Enter');

    expect(assign()).toBeEnabled();
    expect(input).toHaveValue('Clayton Kershaw');
    expect(within(row).queryByRole('listbox')).toBeNull();
    expect(input).toHaveAttribute('aria-expanded', 'false');
  });

  it('moves the active option with ArrowDown/ArrowUp before Enter', () => {
    const upsert = jest.fn<Promise<object>, [unknown]>(() =>
      Promise.resolve({}),
    );
    jest
      .mocked(graphql.useUpsertLeagueSeasonAwardMutation)
      .mockImplementation(
        () =>
          [upsert] as unknown as ReturnType<
            typeof graphql.useUpsertLeagueSeasonAwardMutation
          >,
      );
    render(<SeasonAwardsControl leagueId={42} currentSeason={3} />);
    const { input, assign } = cyYoungRow();

    search(input, 'Clay');
    press(input, 'ArrowDown');
    press(input, 'ArrowDown');
    press(input, 'ArrowDown'); // clamps at the last option
    press(input, 'ArrowUp');
    press(input, 'ArrowDown');
    press(input, 'Enter');

    expect(input).toHaveValue('Clay Holmes');
    fireEvent.click(assign());
    expect(upsert).toHaveBeenCalledWith({
      variables: {
        input: {
          leagueId: 42,
          season: 3,
          playerId: 22,
          awardType: 'cy_young',
          notes: undefined,
        },
      },
    });
  });

  it('exposes combobox/listbox/option semantics and the active option (AC2)', () => {
    render(<SeasonAwardsControl leagueId={42} currentSeason={3} />);
    const { row, input } = cyYoungRow();

    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(input).toHaveAttribute('aria-autocomplete', 'list');
    expect(input).not.toHaveAttribute('aria-activedescendant');

    search(input, 'Clay');

    const listbox = within(row).getByRole('listbox', {
      name: 'Player suggestions',
    });
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(input).toHaveAttribute('aria-controls', listbox.id);

    const options = within(listbox).getAllByRole('option');
    expect(options.map((o) => o.getAttribute('aria-label'))).toEqual([
      'Clayton Kershaw',
      'Clay Holmes',
    ]);
    expect(
      options.every((o) => o.getAttribute('aria-selected') === 'false'),
    ).toBe(true);

    press(input, 'ArrowDown');

    const kershaw = within(listbox).getByRole('option', {
      name: 'Clayton Kershaw',
    });
    expect(kershaw).toHaveAttribute('aria-selected', 'true');
    expect(input).toHaveAttribute('aria-activedescendant', kershaw.id);
  });

  it('gives each award row its own listbox and option ids', () => {
    render(<SeasonAwardsControl leagueId={42} currentSeason={3} />);
    const cy = cyYoungRow().input;
    const mvp = within(screen.getByTestId('award-row-mvp')).getByRole(
      'combobox',
      { name: 'Search for award recipient' },
    );

    expect(cy.getAttribute('aria-controls')).toBeTruthy();
    expect(cy.getAttribute('aria-controls')).not.toBe(
      mvp.getAttribute('aria-controls'),
    );
  });

  it('closes the suggestions on Escape and reopens them with ArrowDown', () => {
    render(<SeasonAwardsControl leagueId={42} currentSeason={3} />);
    const { row, input, assign } = cyYoungRow();

    search(input, 'Clay');
    press(input, 'ArrowDown');
    press(input, 'Escape');

    expect(within(row).queryByRole('listbox')).toBeNull();
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(input).not.toHaveAttribute('aria-activedescendant');

    // Enter with the list closed must not pick the previously active option.
    press(input, 'Enter');
    expect(assign()).toBeDisabled();

    press(input, 'ArrowDown');
    expect(within(row).getByRole('listbox')).toBeTruthy();
    expect(
      within(row).getByRole('option', { name: 'Clayton Kershaw' }),
    ).toHaveAttribute('aria-selected', 'true');
  });

  it('ignores Enter when no option is active', () => {
    render(<SeasonAwardsControl leagueId={42} currentSeason={3} />);
    const { row, input, assign } = cyYoungRow();

    search(input, 'Clay');
    press(input, 'Enter');

    expect(assign()).toBeDisabled();
    expect(within(row).getByRole('listbox')).toBeTruthy();
  });
});

describe('SeasonAwardsControl — LS-10821 recipient search scoped to the league', () => {
  const graphql = jest.requireMock<typeof import('@legacy-sports/graphql')>(
    '@legacy-sports/graphql',
  );

  beforeEach(() => {
    jest.mocked(graphql.useGetPlayersWithStatsQuery).mockClear();
  });

  function searchRow(awardKey: string, text: string) {
    const row = screen.getByTestId(`award-row-${awardKey}`);
    const input = within(row).getByLabelText('Search for award recipient');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: text } });
  }

  /** Variables of every players search that actually ran (not skipped). */
  function activeSearchVariables() {
    return jest
      .mocked(graphql.useGetPlayersWithStatsQuery)
      .mock.calls.map(([options]) => options)
      .filter((options) => options && !options.skip)
      .map((options) => options?.variables);
  }

  it('passes leagueId to every recipient search so the league sport applies (AC1)', () => {
    render(<SeasonAwardsControl leagueId={42} currentSeason={3} />);
    searchRow('gold_glove', 'Babe Ruth');

    for (const [options] of jest.mocked(graphql.useGetPlayersWithStatsQuery)
      .mock.calls) {
      expect(options?.variables).toMatchObject({ leagueId: 42 });
    }
    expect(activeSearchVariables()).toContainEqual({
      search: 'Babe Ruth',
      limit: 8,
      leagueId: 42,
      rosteredOnly: false,
    });
  });

  it.each(['mvp', 'rookie_of_the_year'])(
    'limits %s recipients to league-rostered players (AC3)',
    (awardKey) => {
      render(<SeasonAwardsControl leagueId={42} currentSeason={3} />);
      searchRow(awardKey, 'Tom Brady');

      expect(activeSearchVariables()).toContainEqual({
        search: 'Tom Brady',
        limit: 8,
        leagueId: 42,
        rosteredOnly: true,
      });
    },
  );
});

describe('SeasonAwardsControl — LS-10694 football award set', () => {
  const BASEBALL_ONLY = ['cy_young', 'gold_glove', 'silver_slugger'];

  it('offers football leagues MVP and Rookie of the Year only', () => {
    render(
      <SeasonAwardsControl leagueId={42} currentSeason={3} sport="football" />,
    );

    expect(screen.getByTestId('award-row-mvp')).toBeTruthy();
    expect(screen.getByTestId('award-row-rookie_of_the_year')).toBeTruthy();
    for (const key of BASEBALL_ONLY) {
      expect(screen.queryByTestId(`award-row-${key}`)).toBeNull();
    }
    expect(screen.queryByText(/Cy Young/)).toBeNull();
    expect(screen.queryByText(/Gold Glove/)).toBeNull();
    expect(screen.queryByText(/Silver Slugger/)).toBeNull();
  });

  it('opens a football vote with only the football award types', () => {
    const openVoting = jest.fn(() => Promise.resolve({}));
    const graphql = jest.requireMock<typeof import('@legacy-sports/graphql')>(
      '@legacy-sports/graphql',
    );
    jest
      .mocked(graphql.useOpenAwardVotingMutation)
      .mockImplementation(
        () =>
          [openVoting] as unknown as ReturnType<
            typeof graphql.useOpenAwardVotingMutation
          >,
      );

    render(
      <SeasonAwardsControl leagueId={42} currentSeason={3} sport="football" />,
    );
    fireEvent.click(screen.getByText('Open Voting'));

    expect(openVoting).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: {
          leagueId: 42,
          season: 3,
          awardTypes: ['mvp', 'rookie_of_the_year'],
        },
      }),
    );
    jest
      .mocked(graphql.useOpenAwardVotingMutation)
      .mockImplementation(
        () =>
          [jest.fn()] as unknown as ReturnType<
            typeof graphql.useOpenAwardVotingMutation
          >,
      );
  });

  it('drops baseball-only awards from the vote when sport resolves after mount', () => {
    const openVoting = jest.fn(() => Promise.resolve({}));
    const graphql = jest.requireMock<typeof import('@legacy-sports/graphql')>(
      '@legacy-sports/graphql',
    );
    jest
      .mocked(graphql.useOpenAwardVotingMutation)
      .mockImplementation(
        () =>
          [openVoting] as unknown as ReturnType<
            typeof graphql.useOpenAwardVotingMutation
          >,
      );

    const { rerender } = render(
      <SeasonAwardsControl leagueId={42} currentSeason={3} />,
    );
    rerender(
      <SeasonAwardsControl leagueId={42} currentSeason={3} sport="football" />,
    );
    fireEvent.click(screen.getByText('Open Voting'));

    expect(openVoting).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: {
          leagueId: 42,
          season: 3,
          awardTypes: ['mvp', 'rookie_of_the_year'],
        },
      }),
    );
    jest
      .mocked(graphql.useOpenAwardVotingMutation)
      .mockImplementation(
        () =>
          [jest.fn()] as unknown as ReturnType<
            typeof graphql.useOpenAwardVotingMutation
          >,
      );
  });

  it('keeps the full baseball award set by default', () => {
    render(<SeasonAwardsControl leagueId={42} currentSeason={3} />);

    for (const key of BASEBALL_ONLY) {
      expect(screen.getByTestId(`award-row-${key}`)).toBeTruthy();
    }
  });
});

describe('SeasonAwardsControl — LS-10693 season picker uses league seasonNumber', () => {
  const graphql = jest.requireMock<typeof import('@legacy-sports/graphql')>(
    '@legacy-sports/graphql',
  );

  function seasonOptionLabels(): string[] {
    const select = screen.getByRole('combobox', { name: /select season/i });
    return within(select)
      .getAllByRole('option')
      .map((o) => o.textContent ?? '');
  }

  it('lists only the seasons the league has had, newest first (AC1, AC3)', () => {
    render(<SeasonAwardsControl leagueId={42} currentSeason={3} />);

    expect(seasonOptionLabels()).toEqual(['Season 3', 'Season 2', 'Season 1']);
  });

  it('offers just Season 1 for a first-season league — never a future season (AC3)', () => {
    render(<SeasonAwardsControl leagueId={42} currentSeason={1} />);

    expect(seasonOptionLabels()).toEqual(['Season 1']);
  });

  it('preselects the current season and queries with that same value (AC1, AC2)', () => {
    render(<SeasonAwardsControl leagueId={42} currentSeason={1} />);

    const select = screen.getByRole<HTMLSelectElement>('combobox', {
      name: /select season/i,
    });
    expect(select.value).toBe('1');
    const expected = { variables: { leagueId: 42, season: 1 } };
    expect(graphql.useGetLeagueSeasonAwardsQuery).toHaveBeenLastCalledWith(
      expected,
    );
    expect(graphql.useGetAwardVotingPeriodQuery).toHaveBeenLastCalledWith(
      expected,
    );
    expect(graphql.useGetAwardVoteResultsQuery).toHaveBeenLastCalledWith(
      expected,
    );
  });

  it('defaults to Season 1 when the league season is unknown, not the calendar year', () => {
    render(<SeasonAwardsControl leagueId={42} />);

    expect(seasonOptionLabels()).toEqual(['Season 1']);
    expect(graphql.useGetLeagueSeasonAwardsQuery).toHaveBeenLastCalledWith({
      variables: { leagueId: 42, season: 1 },
    });
  });

  it('follows currentSeason when the league loads after mount', () => {
    const { rerender } = render(<SeasonAwardsControl leagueId={42} />);
    rerender(<SeasonAwardsControl leagueId={42} currentSeason={2} />);

    const select = screen.getByRole<HTMLSelectElement>('combobox', {
      name: /select season/i,
    });
    expect(select.value).toBe('2');
    expect(graphql.useGetLeagueSeasonAwardsQuery).toHaveBeenLastCalledWith({
      variables: { leagueId: 42, season: 2 },
    });
  });
});
