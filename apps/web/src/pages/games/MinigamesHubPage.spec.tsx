/**
 * LS-10460 — every Minigames hub card routes to its own game.
 *
 * `MinigamesHub` is stubbed to one button per game id so this spec isolates
 * the page's id → route wiring; the shared component's card → id wiring is
 * covered in `MinigamesHub.spec.tsx`.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MINIGAME_ROUTES, MinigamesHubPage } from './MinigamesHubPage';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual<typeof import('react-router-dom')>('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

jest.mock('@legacy-sports/shared-components/games', () => ({
  MinigamesHub: ({
    onNavigate,
  }: {
    onNavigate: (id: string) => void;
  }): React.JSX.Element => (
    <>
      {['season-draft', 'disclosure', 'twenty-questions', 'mock-draft'].map(
        (id) => (
          <button key={id} type="button" onClick={() => onNavigate(id)}>
            {id}
          </button>
        ),
      )}
    </>
  ),
}));

jest.mock('../../components/PageMeta', () => ({ PageMeta: () => null }));
jest.mock('../../components/ResumeMockDraftBanner', () => ({
  ResumeMockDraftBanner: () => null,
}));

describe('MinigamesHubPage', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it.each([
    ['season-draft', '/games/season-draft'],
    ['disclosure', '/games/disclosure'],
    ['twenty-questions', '/games/twenty-questions'],
    ['mock-draft', '/baseball/mock-draft'],
  ])('routes the %s card to %s', (id, path) => {
    render(<MinigamesHubPage />);

    fireEvent.click(screen.getByRole('button', { name: id }));

    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith(path);
  });

  it('gives every game a distinct route', () => {
    const routes = Object.values(MINIGAME_ROUTES);
    expect(new Set(routes).size).toBe(routes.length);
  });
});
