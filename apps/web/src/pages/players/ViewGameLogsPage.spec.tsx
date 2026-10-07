/**
 * LS-7463 — ViewGameLogsPage passes isPremium from useIsPremium() down to
 * GameLogsTable so advanced stat columns (wOBA, xBA, EV, barrels) are visible
 * to premium users and hidden from free users.
 */
import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ViewGameLogsPage } from './ViewGameLogsPage';

// ── Mocks ────────────────────────────────────────────────────────────────────

let mockIsPremium = false;
jest.mock('../../hooks/useIsPremium', () => ({
  useIsPremium: () => mockIsPremium,
}));

jest.mock('../../components/PageMeta', () => ({
  PageMeta: () => null,
}));

jest.mock('../../components/PremiumGate', () => ({
  PremiumGate: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

let capturedGameLogsTableProps: Record<string, unknown> = {};
jest.mock('@legacy-sports/shared-components/stats', () => ({
  GameLogsTable: (props: Record<string, unknown>) => {
    capturedGameLogsTableProps = props;
    return null;
  },
  useGameLogsPlayerName: (brefId: string | undefined) =>
    brefId === 'fosteru01' ? 'Rube Foster' : brefId ? '' : undefined,
}));

// ── Tests ────────────────────────────────────────────────────────────────────

describe('ViewGameLogsPage — isPremium prop wiring (LS-7463)', () => {
  beforeEach(() => {
    capturedGameLogsTableProps = {};
    jest.clearAllMocks();
  });

  it('passes isPremium=true to GameLogsTable for a premium user', () => {
    mockIsPremium = true;
    render(
      <MemoryRouter>
        <ViewGameLogsPage />
      </MemoryRouter>,
    );
    expect(capturedGameLogsTableProps.isPremium).toBe(true);
  });

  it('passes isPremium=false to GameLogsTable for a free user', () => {
    mockIsPremium = false;
    render(
      <MemoryRouter>
        <ViewGameLogsPage />
      </MemoryRouter>,
    );
    expect(capturedGameLogsTableProps.isPremium).toBe(false);
  });
});

describe('ViewGameLogsPage — query param deep-link (LS-9763)', () => {
  beforeEach(() => {
    capturedGameLogsTableProps = {};
    jest.clearAllMocks();
  });

  it('passes playerId/startDate/endDate query params through as initial* props', () => {
    render(
      <MemoryRouter
        initialEntries={[
          '/players/view-game-logs?playerId=ruthba01&startDate=1927-09-30&endDate=1927-09-30',
        ]}
      >
        <ViewGameLogsPage />
      </MemoryRouter>,
    );
    expect(capturedGameLogsTableProps.initialPlayerId).toBe('ruthba01');
    expect(capturedGameLogsTableProps.initialStartDate).toBe('1927-09-30');
    expect(capturedGameLogsTableProps.initialEndDate).toBe('1927-09-30');
  });

  it('leaves the initial* props undefined when no query params are present', () => {
    render(
      <MemoryRouter>
        <ViewGameLogsPage />
      </MemoryRouter>,
    );
    expect(capturedGameLogsTableProps.initialPlayerId).toBeUndefined();
    expect(capturedGameLogsTableProps.initialStartDate).toBeUndefined();
    expect(capturedGameLogsTableProps.initialEndDate).toBeUndefined();
  });
});

describe('ViewGameLogsPage — deep-linked player name (LS-10661)', () => {
  beforeEach(() => {
    capturedGameLogsTableProps = {};
    jest.clearAllMocks();
  });

  it('passes the resolved player name so the raw bref id is not shown', () => {
    render(
      <MemoryRouter
        initialEntries={[
          '/players/view-game-logs?playerId=fosteru01&startDate=1914-10-06&endDate=1914-10-06',
        ]}
      >
        <ViewGameLogsPage />
      </MemoryRouter>,
    );
    expect(capturedGameLogsTableProps.playerName).toBe('Rube Foster');
  });

  it('leaves playerName undefined without a playerId param', () => {
    render(
      <MemoryRouter>
        <ViewGameLogsPage />
      </MemoryRouter>,
    );
    expect(capturedGameLogsTableProps.playerName).toBeUndefined();
  });
});
