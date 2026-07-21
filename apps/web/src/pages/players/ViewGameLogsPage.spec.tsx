/**
 * LS-7463 — ViewGameLogsPage passes isPremium from useIsPremium() down to
 * GameLogsTable so advanced stat columns (wOBA, xBA, EV, barrels) are visible
 * to premium users and hidden from free users.
 */
import React from 'react';
import { render } from '@testing-library/react';
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
}));

// ── Tests ────────────────────────────────────────────────────────────────────

describe('ViewGameLogsPage — isPremium prop wiring (LS-7463)', () => {
  beforeEach(() => {
    capturedGameLogsTableProps = {};
    jest.clearAllMocks();
  });

  it('passes isPremium=true to GameLogsTable for a premium user', () => {
    mockIsPremium = true;
    render(<ViewGameLogsPage />);
    expect(capturedGameLogsTableProps.isPremium).toBe(true);
  });

  it('passes isPremium=false to GameLogsTable for a free user', () => {
    mockIsPremium = false;
    render(<ViewGameLogsPage />);
    expect(capturedGameLogsTableProps.isPremium).toBe(false);
  });
});
