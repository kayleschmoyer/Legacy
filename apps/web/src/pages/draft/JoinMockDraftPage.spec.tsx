/**
 * LS-9181 — JoinMockDraftPage wires the shared JoinMockDraftForm to the
 * joinMockDraft mutation and navigates into the draft room on success.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { JoinMockDraftPage } from './JoinMockDraftPage';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => {
  const actual: typeof import('react-router-dom') =
    jest.requireActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({ inviteCode: undefined }),
  };
});

jest.mock('../../components/PageMeta', () => ({ PageMeta: () => null }));

jest.mock('../../constants/colors', () => ({
  BRAND_GOLD: 'brand-gold',
  GRADIENT_BOARD_BG: 'board-bg-gradient',
  OVERLAY_WHITE_10: 'overlay-white-10',
  SURFACE_CARD: 'surface-card',
}));

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

jest.mock('@legacy-sports/shared-components/ui', () => ({
  H1: ({ children }: { children?: React.ReactNode }) => <h1>{children}</h1>,
  Paragraph: ({ children }: { children?: React.ReactNode }) => (
    <p>{children}</p>
  ),
  YStack: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

jest.mock('tamagui', () => ({
  createTokens: (tokens: unknown) => tokens,
  Text: ({ children }: { children?: React.ReactNode }) => (
    <span>{children}</span>
  ),
}));

jest.mock('@legacy-sports/shared-components/draft', () => ({
  JoinMockDraftForm: ({
    onSubmit,
    onCancel,
    loading,
    error,
  }: {
    onSubmit: (code: string, teamName: string) => void;
    onCancel: () => void;
    loading?: boolean;
    error?: string | null;
  }) => (
    <div>
      {error ? <p>{error}</p> : null}
      <button
        disabled={loading}
        onClick={() => onSubmit('ABC12XYZ', 'My Team')}
      >
        Join Draft
      </button>
      <button onClick={onCancel}>Cancel</button>
    </div>
  ),
}));

let mockJoinResult: () => Promise<unknown> = () =>
  Promise.resolve({ data: { joinMockDraft: { leagueId: 42 } } });
const mockJoinMockDraft = jest.fn(() => mockJoinResult());

jest.mock('@legacy-sports/graphql', () => ({
  useJoinMockDraftMutation: () => [mockJoinMockDraft, { loading: false }],
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/baseball/mock-draft/join']}>
      <Routes>
        <Route
          path="/baseball/mock-draft/join"
          element={<JoinMockDraftPage />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('JoinMockDraftPage', () => {
  afterEach(() => jest.clearAllMocks());

  it('joins and navigates to the draft room on success', async () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /Join Draft/i }));

    expect(mockJoinMockDraft).toHaveBeenCalledWith({
      variables: { inviteCode: 'ABC12XYZ', teamName: 'My Team' },
    });
    expect(await screen.findByText(/Join Mock Draft/i)).toBeInTheDocument();
    await screen.findByRole('button', { name: /Join Draft/i });
    expect(mockNavigate).toHaveBeenCalledWith('/baseball/league/42/draft');
  });

  it('surfaces the mutation error inline without navigating', async () => {
    mockJoinResult = () =>
      Promise.reject(new Error('This mock draft is full.'));
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /Join Draft/i }));

    expect(
      await screen.findByText('This mock draft is full.'),
    ).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('navigates back to the setup page on cancel', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/baseball/mock-draft');
  });
});
