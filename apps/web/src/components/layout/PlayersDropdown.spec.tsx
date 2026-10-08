/**
 * Regression guard for LS-10677: the header Players → Compare link always
 * opened the MLB comparison (/players/compare), so NFL viewers compared
 * quarterbacks on batting/pitching scores. The link must follow the sport the
 * user is viewing.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { USER_PREFERENCES_STORAGE_KEY } from '@legacy-sports/shared-components/utils';

import { PlayersDropdown, resolveCompareHref } from './PlayersDropdown';

let mockFootballEnabled = true;
jest.mock('../../context/GrowthBookProvider', () => ({
  useFeatureValue: () => mockFootballEnabled,
}));

const setDefaultSport = (defaultSport: 'baseball' | 'football') =>
  localStorage.setItem(
    USER_PREFERENCES_STORAGE_KEY,
    JSON.stringify({ defaultSport }),
  );

describe('resolveCompareHref (LS-10677)', () => {
  beforeEach(() => localStorage.clear());

  it('routes the NFL Players view to the football comparison', () => {
    expect(resolveCompareHref('/players', '?sport=nfl', true)).toBe(
      '/football/players/compare',
    );
  });

  it('keeps the MLB Players view on /players/compare', () => {
    expect(resolveCompareHref('/players', '?sport=mlb', true)).toBe(
      '/players/compare',
    );
  });

  it('treats any /football route as NFL', () => {
    expect(resolveCompareHref('/football/players/12', '', true)).toBe(
      '/football/players/compare',
    );
  });

  it('lets an explicit sport param beat the saved preference', () => {
    setDefaultSport('football');
    expect(resolveCompareHref('/players', '?sport=mlb', true)).toBe(
      '/players/compare',
    );
  });

  it('falls back to the saved default sport without a sport param', () => {
    setDefaultSport('football');
    expect(resolveCompareHref('/players', '', true)).toBe(
      '/football/players/compare',
    );
    expect(resolveCompareHref('/', '', true)).toBe('/football/players/compare');
  });

  it('defaults to MLB with no sport signal', () => {
    expect(resolveCompareHref('/', '', true)).toBe('/players/compare');
  });

  it('never offers the football route while football is disabled', () => {
    expect(resolveCompareHref('/players', '?sport=nfl', false)).toBe(
      '/players/compare',
    );
  });
});

describe('PlayersDropdown Compare link (LS-10677)', () => {
  beforeEach(() => {
    localStorage.clear();
    mockFootballEnabled = true;
  });

  const openMenu = (path: string) => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <PlayersDropdown />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Players/ }));
    return screen.getByText('Compare Players').closest('a');
  };

  it('links NFL viewers to /football/players/compare', () => {
    expect(openMenu('/players?sport=nfl')).toHaveAttribute(
      'href',
      '/football/players/compare',
    );
  });

  it('links MLB viewers to /players/compare', () => {
    expect(openMenu('/players?sport=mlb')).toHaveAttribute(
      'href',
      '/players/compare',
    );
  });
});
