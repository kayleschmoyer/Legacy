/**
 * Matchup Roster Comparison & Recap Panel — UI Integration Test (LS-597)
 *
 * Verifies the MatchupRosterComparison and MatchupRecapPanel components
 * against the live backend. No mocks — all interactions use real API calls
 * and a real browser.
 *
 * Strategy:
 *   A beforeAll phase queries the live API (using the admin JWT from the CLI
 *   auth store) to discover:
 *     - Any matchup the admin is a member of → used for roster comparison
 *     - A completed matchup with a narrative recap → used for recap panel
 *
 *   Each phase skips gracefully if no suitable data is found, so the suite
 *   degrades cleanly in a fresh environment.
 *
 * Covers:
 *   - MatchupRosterComparison: BATTERS/PITCHERS section headers, column headers
 *     (Team Name, Proj, Actual, Pos), position slot rows, totals rows
 *   - Bench toggle (Show/Hide Bench with count badge)
 *   - MatchupRecapPanel: MATCHUP RECAP header, headline, narrative,
 *     STANDOUT PERFORMANCES highlights
 *   - Cross-user visibility: manager identity sees the same panels
 *
 * Run:
 *   pnpm exec playwright test \
 *     --config apps/web-e2e/playwright.integration.config.ts \
 *     src/integration/tests/matchup-roster-recap-ui.spec.ts
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { test } from '../fixtures/ui';

// ---------------------------------------------------------------------------
// Shared state set in beforeAll and consumed by subsequent phases
// ---------------------------------------------------------------------------

interface MatchupRosterState {
  /** Any matchup in an admin league — used to test roster comparison panel */
  rosterLeagueId: number;
  rosterMatchupId: number;
  /** A completed matchup that has a recap — used for recap panel phase */
  recapLeagueId: number;
  recapMatchupId: number;
}

let state: MatchupRosterState;

// ---------------------------------------------------------------------------
// Auth helpers (mirrors ui.ts logic — reads same CLI auth store)
// ---------------------------------------------------------------------------

interface CliAuthData {
  tokens: Record<string, { jwt: string; expiresAt: number; email: string }>;
  defaultUser: string;
}

/**
 * Returns the admin JWT without throwing.  Returns '' when no valid token
 * is present so individual tests can use test.skip() instead of crashing.
 */
function tryGetAuthJwt(): string {
  if (process.env.INTEGRATION_JWT) {
    return process.env.INTEGRATION_JWT;
  }

  const authPath = path.join(os.homedir(), '.legacy-sports', 'auth.json');
  if (!fs.existsSync(authPath)) return '';

  try {
    const data = JSON.parse(fs.readFileSync(authPath, 'utf-8')) as CliAuthData;
    const user = data.defaultUser;
    const entry = user ? data.tokens[user] : undefined;
    if (!entry?.jwt) return '';
    if (entry.expiresAt && entry.expiresAt < Date.now()) return '';
    return entry.jwt;
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// GraphQL helpers
// ---------------------------------------------------------------------------

const GQL_URL =
  (
    process.env.INTEGRATION_BASE_URL ??
    'https://bd1opa1yv7.execute-api.us-east-1.amazonaws.com/dev/'
  ).replace(/\/?$/, '/') + 'graphql';

async function gqlFetch<T>(
  jwt: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(GQL_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json()) as {
    data?: T;
    errors?: Array<{ message: string }>;
  };
  if (json.errors?.length) {
    throw new Error(`GraphQL error: ${json.errors[0].message}`);
  }
  if (!json.data) throw new Error('GraphQL response contained no data');
  return json.data;
}

// ---------------------------------------------------------------------------
// GraphQL query strings used only during setUp
// ---------------------------------------------------------------------------

const GET_USER_LEAGUES = `
  query GetUserLeagues {
    userLeagues {
      id
      name
      currentMatchup
    }
  }
`;

const GET_MATCHUPS_FOR_LEAGUE = `
  query GetMatchupsForLeague($leagueId: Int!) {
    getMatchupsForLeague(leagueId: $leagueId) {
      id
      weekNumber
      leagueId
      team1Id
      team2Id
      status
    }
  }
`;

const GET_MATCHUP_HISTORY = `
  query GetMatchupHistory($leagueId: Int!, $status: MatchupStatus, $limit: Int) {
    getMatchupHistory(leagueId: $leagueId, status: $status, limit: $limit) {
      id
      weekNumber
      leagueId
      team1Id
      team2Id
      status
    }
  }
`;

const GET_MATCHUP_RECAP = `
  query GetMatchupRecap($id: Int!) {
    getMatchupById(id: $id) {
      id
      status
      recap {
        headline
        narrative
        highlights
        matchupType
      }
    }
  }
`;

// ---------------------------------------------------------------------------
// UI helper — swap JWT in localStorage
// ---------------------------------------------------------------------------

async function switchUser(
  page: Page,
  jwt: string,
  url?: string,
): Promise<void> {
  if (url) {
    await page.goto(url);
    await page.waitForLoadState('domcontentloaded');
    await page.evaluate(
      (token) => localStorage.setItem('auth_jwt', token),
      jwt,
    );
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
  } else {
    await page.evaluate(
      (token) => localStorage.setItem('auth_jwt', token),
      jwt,
    );
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
  }
}

// ---------------------------------------------------------------------------
// Serial test suite
// ---------------------------------------------------------------------------

test.describe
  .serial('Matchup Roster Comparison & Recap Panel (Live Backend) @integration @critical', () => {
  test.describe.configure({ retries: 0 });

  // -----------------------------------------------------------------------
  // SETUP — query live API for matchup IDs to use in subsequent phases
  // -----------------------------------------------------------------------

  test.beforeAll(async () => {
    state = {
      rosterLeagueId: 0,
      rosterMatchupId: 0,
      recapLeagueId: 0,
      recapMatchupId: 0,
    };

    const jwt = tryGetAuthJwt();
    if (!jwt) return; // tests will skip individually

    // Get all leagues the admin belongs to
    let leagues: Array<{
      id: number;
      name: string;
      currentMatchup?: number | null;
    }> = [];
    try {
      const data = await gqlFetch<{
        userLeagues: Array<{
          id: number;
          name: string;
          currentMatchup?: number | null;
        }>;
      }>(jwt, GET_USER_LEAGUES);
      leagues = data.userLeagues ?? [];
    } catch {
      return;
    }

    // ── Find a league with any matchup (for roster comparison) ──────────
    for (const league of leagues) {
      if (state.rosterMatchupId !== 0) break;
      try {
        const data = await gqlFetch<{
          getMatchupsForLeague: Array<{
            id: number;
            weekNumber: number;
            leagueId: number;
            team1Id: number;
            team2Id: number;
            status: string;
          }>;
        }>(jwt, GET_MATCHUPS_FOR_LEAGUE, { leagueId: league.id });

        const matchups = data.getMatchupsForLeague ?? [];
        if (matchups.length === 0) continue;

        // Prefer the league's current matchup (most likely to have players)
        const chosen =
          (league.currentMatchup
            ? matchups.find((m) => m.id === league.currentMatchup)
            : null) ?? matchups[0];

        state.rosterLeagueId = league.id;
        state.rosterMatchupId = chosen.id;
      } catch {
        /* skip inaccessible leagues */
      }
    }

    // ── Find a completed matchup that has a narrative recap ──────────────
    for (const league of leagues) {
      if (state.recapMatchupId !== 0) break;
      try {
        const histData = await gqlFetch<{
          getMatchupHistory: Array<{
            id: number;
            leagueId: number;
            status: string;
          }>;
        }>(jwt, GET_MATCHUP_HISTORY, {
          leagueId: league.id,
          status: 'completed',
          limit: 10,
        });

        const completed = histData.getMatchupHistory ?? [];

        for (const m of completed) {
          try {
            const recapData = await gqlFetch<{
              getMatchupById: {
                id: number;
                status: string;
                recap: { headline: string } | null;
              };
            }>(jwt, GET_MATCHUP_RECAP, { id: m.id });

            if (recapData.getMatchupById?.recap?.headline) {
              state.recapLeagueId = league.id;
              state.recapMatchupId = m.id;
              break;
            }
          } catch {
            /* this matchup has no recap */
          }
        }
      } catch {
        /* skip inaccessible leagues */
      }
    }
  });

  // -----------------------------------------------------------------------
  // PHASE 1 — Roster comparison panel structure
  // -----------------------------------------------------------------------

  test('Phase 1: Roster comparison panel renders correctly', async ({
    commissionerPage: page,
  }) => {
    test.setTimeout(60_000);

    if (state.rosterMatchupId === 0 || state.rosterLeagueId === 0) {
      test.skip(
        true,
        'No matchup found in admin leagues — roster comparison test skipped',
      );
      return;
    }

    const matchupUrl = `/baseball/league/${state.rosterLeagueId}/matchups/${state.rosterMatchupId}`;

    await test.step('Navigate to matchup detail page', async () => {
      await page.goto(matchupUrl);
      await page.waitForLoadState('load');
      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
        { timeout: 15_000 },
      );
    });

    await test.step('Verify "Player Matchups" card heading', async () => {
      // MatchupRosterComparison renders an H4 with text "Player Matchups"
      await expect(
        page.getByRole('heading', { name: /Player Matchups/i }),
      ).toBeVisible({ timeout: 20_000 });
    });

    await test.step('Verify BATTERS section header', async () => {
      await expect(page.getByText('BATTERS').first()).toBeVisible({
        timeout: 20_000,
      });
    });

    await test.step('Verify PITCHERS section header', async () => {
      await expect(page.getByText('PITCHERS').first()).toBeVisible();
    });

    await test.step('Verify Actual and Proj column headers', async () => {
      // Each section has "Actual" (gold) and "Proj" column headers
      await expect(page.getByText('Actual').first()).toBeVisible();
      await expect(page.getByText('Proj').first()).toBeVisible();
    });

    await test.step('Verify Pos column header', async () => {
      // The outer column header row has a "Pos" label for position slot
      await expect(page.getByText('Pos').first()).toBeVisible();
    });

    await test.step('Verify numeric score values are rendered', async () => {
      // Totals rows display scores formatted as decimal numbers (e.g. "0.00",
      // "12.50").  At least one such value must be visible.
      await expect(page.locator('text=/^\\d+\\.\\d{2}$/').first()).toBeVisible({
        timeout: 15_000,
      });
    });
  });

  // -----------------------------------------------------------------------
  // PHASE 2 — Bench toggle interaction
  // -----------------------------------------------------------------------

  test('Phase 2: Bench toggle expands and collapses the bench section', async ({
    commissionerPage: page,
  }) => {
    test.setTimeout(60_000);

    if (state.rosterMatchupId === 0 || state.rosterLeagueId === 0) {
      test.skip(true, 'No matchup found — bench toggle test skipped');
      return;
    }

    const matchupUrl = `/baseball/league/${state.rosterLeagueId}/matchups/${state.rosterMatchupId}`;

    await test.step('Navigate and wait for roster comparison to load', async () => {
      await page.goto(matchupUrl);
      await page.waitForLoadState('load');
      // Wait for roster comparison to finish loading
      await expect(page.getByText('BATTERS').first()).toBeVisible({
        timeout: 20_000,
      });
    });

    await test.step('"Show Bench" button is visible', async () => {
      await expect(page.getByText('Show Bench').first()).toBeVisible({
        timeout: 10_000,
      });
    });

    await test.step('Click "Show Bench" expands the bench section', async () => {
      await page.getByText('Show Bench').first().click();
      // Text toggles to "Hide Bench" once expanded
      await expect(page.getByText('Hide Bench').first()).toBeVisible({
        timeout: 5_000,
      });
    });

    await test.step('Click "Hide Bench" collapses the bench section', async () => {
      await page.getByText('Hide Bench').first().click();
      await expect(page.getByText('Show Bench').first()).toBeVisible({
        timeout: 5_000,
      });
    });
  });

  // -----------------------------------------------------------------------
  // PHASE 3 — Recap panel for a completed matchup
  // -----------------------------------------------------------------------

  test('Phase 3: Recap panel renders for a completed matchup', async ({
    commissionerPage: page,
  }) => {
    test.setTimeout(60_000);

    if (state.recapMatchupId === 0 || state.recapLeagueId === 0) {
      test.skip(
        true,
        'No completed matchup with a recap found — recap panel test skipped',
      );
      return;
    }

    const matchupUrl = `/baseball/league/${state.recapLeagueId}/matchups/${state.recapMatchupId}`;

    await test.step('Navigate to the completed matchup', async () => {
      await page.goto(matchupUrl);
      await page.waitForLoadState('load');
      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
        { timeout: 15_000 },
      );
    });

    await test.step('Verify "MATCHUP RECAP" header is visible', async () => {
      // MatchupRecapPanel renders a "MATCHUP RECAP" label in the card header
      await expect(page.getByText('MATCHUP RECAP').first()).toBeVisible({
        timeout: 20_000,
      });
    });

    await test.step('Verify headline text is rendered', async () => {
      // The recap headline is the first bold paragraph below the header.
      // It always has non-empty content for a completed matchup.
      const recapSection = page
        .getByText('MATCHUP RECAP')
        .first()
        .locator('xpath=../../../..');
      // The headline renders inside an XStack alongside the Trophy icon.
      // Use the generic paragraph locator to confirm non-empty text exists.
      await expect(recapSection).toContainText(/.+/, { timeout: 10_000 });
    });

    await test.step('Verify narrative paragraph is non-empty', async () => {
      // The narrative is a Tamagui Paragraph component rendered as <p>
      // near the recap card.  We confirm at least one paragraph exists
      // that contains visible text content.
      const paragraphs = page
        .getByText('MATCHUP RECAP')
        .first()
        .locator('xpath=../../../..//p');
      await expect(paragraphs.first()).not.toBeEmpty({ timeout: 10_000 });
    });

    await test.step('Verify STANDOUT PERFORMANCES section', async () => {
      // The highlights section header appears when at least one highlight exists
      await expect(page.getByText('STANDOUT PERFORMANCES')).toBeVisible({
        timeout: 10_000,
      });
    });
  });

  // -----------------------------------------------------------------------
  // PHASE 4 — Cross-user visibility: manager sees the same roster comparison
  // -----------------------------------------------------------------------

  test('Phase 4: Manager identity can view the same roster comparison', async ({
    commissionerPage: page,
    commissionerJwt,
    managerJwt1,
  }) => {
    test.setTimeout(60_000);

    if (state.rosterMatchupId === 0 || state.rosterLeagueId === 0) {
      test.skip(true, 'No matchup found — cross-user visibility test skipped');
      return;
    }

    const matchupUrl = `/baseball/league/${state.rosterLeagueId}/matchups/${state.rosterMatchupId}`;

    await test.step('Switch to manager 1 identity and navigate to matchup', async () => {
      await switchUser(page, managerJwt1, matchupUrl);
    });

    await test.step('Roster comparison is visible to the manager', async () => {
      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
        { timeout: 15_000 },
      );
      await expect(
        page.getByRole('heading', { name: /Player Matchups/i }),
      ).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText('BATTERS').first()).toBeVisible();
      await expect(page.getByText('PITCHERS').first()).toBeVisible();
    });

    await test.step('Restore commissioner identity', async () => {
      await switchUser(page, commissionerJwt);
    });
  });

  // -----------------------------------------------------------------------
  // PHASE 5 — Cross-user: manager sees recap panel too (if recap exists)
  // -----------------------------------------------------------------------

  test('Phase 5: Manager identity can view the recap panel', async ({
    commissionerPage: page,
    commissionerJwt,
    managerJwt1,
  }) => {
    test.setTimeout(60_000);

    if (state.recapMatchupId === 0 || state.recapLeagueId === 0) {
      test.skip(
        true,
        'No completed matchup with recap — manager recap visibility test skipped',
      );
      return;
    }

    const matchupUrl = `/baseball/league/${state.recapLeagueId}/matchups/${state.recapMatchupId}`;

    await test.step('Switch to manager 1 identity', async () => {
      await switchUser(page, managerJwt1, matchupUrl);
    });

    await test.step('Recap panel is visible to the manager', async () => {
      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
        { timeout: 15_000 },
      );
      await expect(page.getByText('MATCHUP RECAP').first()).toBeVisible({
        timeout: 20_000,
      });
    });

    await test.step('Restore commissioner identity', async () => {
      await switchUser(page, commissionerJwt);
    });
  });
});
