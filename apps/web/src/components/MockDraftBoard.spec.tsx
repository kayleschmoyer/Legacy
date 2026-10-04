import React from 'react';
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { MockDraftBoardScreen } from './MockDraftBoard';

// The board itself is covered in shared-components; this suite only checks
// which sport and draft id the route hands it (LS-10489).
const mockBoardProps = jest.fn();

jest.mock('@legacy-sports/shared-components/elite-draft', () => ({
  DraftChatTab: () => null,
  EliteDraftBoardScreen: (props: Record<string, unknown>) => {
    mockBoardProps(props);
    return null;
  },
}));

jest.mock('@apollo/client/react', () => ({
  useQuery: () => ({ data: undefined, loading: false, refetch: jest.fn() }),
  useMutation: () => [jest.fn(), { loading: false }],
}));

jest.mock('@legacy-sports/graphql', () => ({
  GetDraftMessages: {},
  SendDraftMessage: {},
}));

jest.mock('../config/environment', () => ({
  env: { websocketUrl: 'ws://test' },
}));

function renderAt(path: string): void {
  const router = createMemoryRouter(
    [
      {
        path: '/baseball/mock-draft/:draftId',
        element: <MockDraftBoardScreen />,
      },
      {
        path: '/football/mock-draft/:draftId',
        element: <MockDraftBoardScreen />,
      },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
}

function lastBoardProps(): Record<string, unknown> {
  const calls = mockBoardProps.mock.calls;
  return calls[calls.length - 1][0] as Record<string, unknown>;
}

describe('MockDraftBoardScreen', () => {
  beforeEach(() => {
    mockBoardProps.mockClear();
  });

  it('renders the football board on the football mock draft route', () => {
    renderAt('/football/mock-draft/42');

    expect(lastBoardProps()).toMatchObject({
      sport: 'football',
      draftId: 42,
      leagueId: null,
    });
  });

  it('renders the baseball board on the baseball mock draft route', () => {
    renderAt('/baseball/mock-draft/7');

    expect(lastBoardProps()).toMatchObject({ sport: 'baseball', draftId: 7 });
  });
});
