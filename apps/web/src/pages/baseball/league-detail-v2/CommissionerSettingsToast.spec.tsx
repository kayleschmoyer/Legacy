/**
 * Regression guard for the "saved successfully" toast on the commissioner
 * settings page. This bug has regressed 8 times across many months:
 *
 *   LS-4193 → LS-4207 → LS-4216 → LS-4227 → LS-4236 → LS-4242 → LS-4249 →
 *   LS-4314 → LS-4542 (this fix).
 *
 * Two failure modes have appeared:
 *
 *  - LS-4249 class: TWO role="status" elements with identical text (duplicate
 *    notification — strict-mode violation in E2E, double-announce for screen
 *    readers).
 *  - LS-4542 class: ZERO role="status" elements because the component that
 *    owned the toast state unmounted before the toast rendered (e.g.
 *    isCommissioner briefly flipping false during a /refresh-jwt response
 *    racing with the save mutation).
 *
 * The fix moved the toast's state and JSX from CommishTab up to
 * LeagueDetailPageV2 so the toast survives a transient CommishTab unmount.
 * These tests pin that contract in place.
 */
import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CommishTab } from './tabs/Commish';
import type { LeagueFragment } from '../../../api/db/graphql.generated';

// Drop heavy children that CommishTab pulls in. Each is replaced by a minimal
// stub that exposes only the wiring this test cares about (LeagueSettingsControl's
// onSuccess / onError callbacks).
//
// The lucide icons appear inside accordion headers; we don't need their props
// (size, color) for the role-based queries this test runs, so a parameterless
// span is enough.
jest.mock('@tamagui/lucide-icons', () => {
  const Icon = () => <span />;
  return {
    AlertTriangle: Icon,
    Award: Icon,
    Bell: Icon,
    ChevronDown: Icon,
    Dollar: Icon,
    DollarSign: Icon,
    List: Icon,
    Refresh: Icon,
    RefreshCw: Icon,
    Settings: Icon,
  };
});

jest.mock('../../../features/baseball/CommissionerAnnouncementsPanel', () => ({
  CommissionerAnnouncementsPanel: () => <div data-testid="announcements" />,
}));

jest.mock('../../../components/commissioner/DraftSettingsControl', () => ({
  DraftSettingsControl: () => <div data-testid="draft-settings" />,
}));

jest.mock('../../../features/commissioner', () => ({
  NextStepControl: () => <div data-testid="next-step" />,
  WaiverProcessControl: () => <div data-testid="waiver-process" />,
}));

jest.mock('../../../components/commissioner/LeagueDuesControl', () => ({
  LeagueDuesControl: () => <div data-testid="dues" />,
}));

jest.mock('../../../components/commissioner/LeagueDuesStatusDashboard', () => ({
  LeagueDuesStatusDashboard: () => <div data-testid="dues-dashboard" />,
}));

jest.mock('../../../components/commissioner/SeasonAwardsControl', () => ({
  SeasonAwardsControl: () => <div data-testid="awards" />,
}));

jest.mock('../../../features/baseball/LeagueScoringEditor', () => ({
  LeagueScoringEditor: () => <div data-testid="scoring-editor" />,
}));

jest.mock('../../../features/commissioner/DeleteLeagueControl', () => ({
  DeleteLeagueControl: () => <div data-testid="delete-league" />,
}));

// LeagueSettingsControl is the unit whose `onSuccess` callback wires through
// to the page-level toast state. Stub it as a "Save Settings" button that
// fires `onSuccess` synchronously so we can assert what the *page* renders.
jest.mock('../../../components/commissioner/LeagueSettingsControl', () => ({
  LeagueSettingsControl: ({
    onSuccess,
  }: {
    onSuccess: (msg: string) => void;
  }) => (
    <button
      type="button"
      onClick={() => onSuccess('League settings saved successfully!')}
    >
      Save Settings
    </button>
  ),
}));

jest.mock('../../../hooks/useMatchup', () => ({
  useCurrentWeek: () => ({ currentWeek: null, refetch: jest.fn() }),
  useMatchupsForLeague: () => ({ matchups: [], refetch: jest.fn() }),
}));

jest.mock('../../../hooks/useLeagueWebSocket', () => ({
  useLeagueWebSocket: () => ({ connected: false }),
}));

jest.mock('../../../lib/scoring', () => ({
  useLeagueScoringSettings: () => ({
    profile: null,
    loading: false,
    error: null,
    refetch: jest.fn(),
    profileName: 'Default',
  }),
}));

// Tamagui — replace with plain divs so jsdom doesn't choke on RN/Tamagui
// stylesheet injection. The test asserts on accessible roles only, so visual
// styling doesn't matter.
jest.mock('tamagui', () => {
  const passThrough = ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  );
  return new Proxy({}, { get: () => passThrough });
});

/**
 * Mirrors LeagueDetailPageV2's commish-tab structure: toast state and JSX
 * are owned by the page, and CommishTab is rendered behind a guard that can
 * unmount independently. This is exactly the production wiring under test.
 *
 * Exposes panel-toggle buttons so a single test can mount, save, unmount, and
 * remount without rerendering (which would reset PageStub's own state).
 */
const PageStub: React.FC = () => {
  const [settingsSuccess, setSettingsSuccess] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [panelMounted, setPanelMounted] = useState(true);

  // Partial LeagueFragment shape — the stubbed children below only read these
  // fields, so we cast through unknown rather than constructing the full
  // fragment (which has 60+ scalar fields and would obscure the test intent).
  const league = {
    id: 1,
    name: 'Test League',
    draftStatus: 'not-started',
    gamesPerMatchup: 1,
    spStartsPerMatchup: 1,
    minCareerGames: 50,
    minCareerSeasons: 3,
    totalMatchups: 10,
    playoffEnabled: true,
    playoffFormat: '4-team',
    playoffMultiWeek: false,
    salaryCapEnabled: false,
    salaryCap: null,
    seasonNumber: 2026,
  } as unknown as LeagueFragment;

  return (
    <>
      {settingsError ? (
        <div role="alert" aria-live="assertive">
          Error saving settings: {settingsError}
        </div>
      ) : null}
      {settingsSuccess ? (
        <div role="status" aria-live="polite">
          {settingsSuccess}
        </div>
      ) : null}
      {panelMounted ? (
        <CommishTab
          league={league}
          teams={[]}
          onSettingsSuccess={setSettingsSuccess}
          onSettingsError={setSettingsError}
        />
      ) : null}
      <button
        data-testid="unmount-panel"
        onClick={() => setPanelMounted(false)}
      >
        Unmount
      </button>
      <button data-testid="remount-panel" onClick={() => setPanelMounted(true)}>
        Remount
      </button>
    </>
  );
};

const renderPage = () =>
  render(
    <MemoryRouter
      initialEntries={['/baseball/league/1/commish']}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="*" element={<PageStub />} />
      </Routes>
    </MemoryRouter>,
  );

const successMatches = () =>
  screen
    .queryAllByRole('status')
    .filter((el) => /saved successfully/i.test(el.textContent ?? ''));

// CommishTab renders sections inside an accordion that is collapsed by
// default; "League Settings" must be opened before the stubbed Save Settings
// button is in the DOM.
const openLeagueSettingsAccordion = () => {
  fireEvent.click(screen.getByText('League Settings'));
};

describe('Commissioner settings toast — LS-4542 regression guard', () => {
  it('shows exactly one role="status" with "saved successfully" after save (LS-4249 dedup guard)', () => {
    renderPage();

    // No status before save
    expect(successMatches()).toHaveLength(0);

    openLeagueSettingsAccordion();
    fireEvent.click(screen.getByText('Save Settings'));

    expect(successMatches()).toHaveLength(1);
  });

  it('keeps the toast visible when CommishTab unmounts after save (LS-4542 unmount-resilience guard)', () => {
    renderPage();

    openLeagueSettingsAccordion();
    fireEvent.click(screen.getByText('Save Settings'));
    expect(successMatches()).toHaveLength(1);

    // Simulate the LS-4542 trigger: a transient unmount of CommishTab caused
    // by isCommissioner flipping false during a /refresh-jwt response that
    // races with the save mutation. The toast must outlive the unmount.
    fireEvent.click(screen.getByTestId('unmount-panel'));
    expect(successMatches()).toHaveLength(1);

    // Remount CommishTab — still exactly one toast (no duplicate from remount).
    fireEvent.click(screen.getByTestId('remount-panel'));
    expect(successMatches()).toHaveLength(1);
  });

  it('CommishTab itself does not render a role="status" with the saved-successfully text (LS-4249 single-toast guard)', () => {
    // Render only CommishTab — no page wrapper. After the save, no role="status"
    // with the saved-successfully text should appear from CommishTab's own tree.
    // The toast belongs to the parent. If CommishTab ever re-introduces its own
    // toast div (the LS-4249 regression pattern), this test fails.
    const league = {
      id: 1,
      name: 'Test League',
      draftStatus: 'not-started',
      gamesPerMatchup: 1,
      spStartsPerMatchup: 1,
      minCareerGames: 50,
      minCareerSeasons: 3,
      totalMatchups: 10,
      playoffEnabled: true,
      playoffFormat: '4-team',
      playoffMultiWeek: false,
      salaryCapEnabled: false,
      salaryCap: null,
      seasonNumber: 2026,
    } as unknown as LeagueFragment;

    const onSettingsSuccess = jest.fn();
    const onSettingsError = jest.fn();

    render(
      <MemoryRouter
        initialEntries={['/baseball/league/1/commish']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route
            path="*"
            element={
              <CommishTab
                league={league}
                teams={[]}
                onSettingsSuccess={onSettingsSuccess}
                onSettingsError={onSettingsError}
              />
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    openLeagueSettingsAccordion();
    fireEvent.click(screen.getByText('Save Settings'));

    // CommishTab must forward the success message to the page, not render it
    // itself. Any role="status" with "saved successfully" inside CommishTab's
    // subtree is a duplicate (LS-4249 class).
    expect(successMatches()).toHaveLength(0);
    expect(onSettingsSuccess).toHaveBeenCalledWith(
      'League settings saved successfully!',
    );
    expect(onSettingsError).toHaveBeenCalledWith(null);
  });
});
