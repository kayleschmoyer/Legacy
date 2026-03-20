/**
 * League Scoring Configuration Editor — UI Integration Test (LS-591)
 *
 * True end-to-end integration test hitting the live backend.
 * No GraphQL mocking — all interactions use real API calls and a real browser.
 *
 * Flow:
 *   1. Commissioner creates a new league (starts with the default scoring profile)
 *   2. Navigate to Commissioner tab → open Scoring accordion section,
 *      verify all three stat groups are shown (Batting, Pitching, Fielding)
 *   3. Edit the "Home Run" multiplier via the UI and save
 *   4. Verify the change persists in the backend (API query)
 *   5. Click "Reset All" and save — verify the default is restored via API
 *
 * Run:
 *   cd apps/web-e2e
 *   pnpm exec playwright test --config playwright.integration.config.ts \
 *     src/integration/tests/league-scoring-editor-ui.integration.spec.ts
 */

import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { createLeagueViaUI } from '../helpers/create-league';
import { switchUser, test } from '../fixtures/ui';

// ---------------------------------------------------------------------------
// Shared state accumulated across serial phases.
// ---------------------------------------------------------------------------

interface ScoringEditorState {
  leagueId: number;
  leagueName: string;
  originalMultiplier: number;
  updatedMultiplier: number;
}

let state: ScoringEditorState;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const GQL_URL =
  (
    process.env.INTEGRATION_BASE_URL ?? 'https://api.legacy-fantasy.com/'
  ).replace(/\/?$/, '/') + 'graphql';

/** Fire a raw GraphQL query against the live backend (Node fetch, no browser). */
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

const GET_SCORING_PROFILE = `
  query GetLeagueScoringProfile($leagueId: Int!) {
    leagueScoringProfile(leagueId: $leagueId) {
      profileId
      profileName
      stats {
        multiplier
        defaultMultiplier
        isOverride
        definition {
          id
          displayName
          statGroup
        }
      }
    }
  }
`;

/** Navigate to the commissioner tab and expand the Scoring accordion section. */
async function openScoringSection(page: Page, leagueId: number): Promise<void> {
  await page.goto(`/baseball/league/${leagueId}/commissioner`);
  await page.waitForLoadState('load');
  const scoringHeader = page.getByRole('button', {
    name: 'Scoring',
    exact: true,
  });
  await expect(scoringHeader).toBeVisible({ timeout: 15_000 });
  // The "Scoring" section starts collapsed — click to expand.
  await scoringHeader.click();
  await expect(page.getByText('Scoring Settings')).toBeVisible({
    timeout: 10_000,
  });
}

// ---------------------------------------------------------------------------
// Serial test suite — phases share `state` and must run in order.
// ---------------------------------------------------------------------------

test.describe
  .serial('League Scoring Editor UI (Live Backend) @integration @critical', () => {
  test.describe.configure({ retries: 0 });

  test.beforeAll(() => {
    state = {
      leagueId: 0,
      leagueName: '',
      originalMultiplier: 0,
      updatedMultiplier: 0,
    };
  });

  // -----------------------------------------------------------------------
  // PHASE 1 — CREATE LEAGUE
  // -----------------------------------------------------------------------

  test('Phase 1: Commissioner creates a league', async ({
    commissionerPage: page,
  }) => {
    state.leagueName = `Scoring E2E ${Date.now()}`;
    const result = await createLeagueViaUI(page, {
      leagueName: state.leagueName,
    });
    state.leagueId = result.leagueId;
  });

  // -----------------------------------------------------------------------
  // PHASE 2 — NAVIGATE TO SCORING SECTION AND VERIFY GROUPS
  // -----------------------------------------------------------------------

  test('Phase 2: Commissioner opens the Scoring section and sees all stat groups', async ({
    commissionerPage: page,
  }) => {
    await test.step('Open Scoring section in Commissioner tab', async () => {
      await openScoringSection(page, state.leagueId);
    });

    await test.step('All three stat groups are visible', async () => {
      await expect(page.getByText('Batting')).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText('Pitching')).toBeVisible({ timeout: 10_000 });
      await expect(
        page.getByText('Fielding', { exact: true }).first(),
      ).toBeVisible({ timeout: 10_000 });
    });
  });

  // -----------------------------------------------------------------------
  // PHASE 3 — EDIT A STAT MULTIPLIER AND SAVE
  // -----------------------------------------------------------------------

  test('Phase 3: Commissioner edits the Home Run multiplier and saves', async ({
    commissionerPage: page,
    commissionerJwt,
  }) => {
    await test.step('Open Scoring section', async () => {
      await openScoringSection(page, state.leagueId);
    });

    await test.step('Fetch the current Home Run multiplier from the API', async () => {
      const data = await gqlFetch<{
        leagueScoringProfile: {
          stats: Array<{
            multiplier: number;
            defaultMultiplier: number;
            definition: { id: number; displayName: string };
          }>;
        };
      }>(commissionerJwt, GET_SCORING_PROFILE, { leagueId: state.leagueId });

      const hrStat = data.leagueScoringProfile.stats.find(
        (s) => s.definition.displayName === 'Home Runs',
      );
      expect(hrStat).toBeDefined();
      if (!hrStat) throw new Error('hrStat should be defined');
      state.originalMultiplier = hrStat.multiplier;
      state.updatedMultiplier = hrStat.multiplier + 1;
    });

    await test.step('Edit the Home Runs multiplier input', async () => {
      const hrInput = page.getByRole('textbox', {
        name: 'Home Runs multiplier',
      });
      await expect(hrInput).toBeVisible({ timeout: 10_000 });
      await hrInput.fill(String(state.updatedMultiplier));
    });

    await test.step('"Unsaved" badge appears in the header', async () => {
      await expect(page.getByText(/\d+ unsaved/i)).toBeVisible({
        timeout: 5_000,
      });
    });

    await test.step('Save the change', async () => {
      const saveBtn = page.getByRole('button', { name: /save.*change/i });
      await expect(saveBtn).toBeVisible({ timeout: 5_000 });
      await saveBtn.scrollIntoViewIfNeeded();
      // Wait for the button to become interactive (canSave=true: !loading && !saving)
      // before clicking. A disabled Tamagui Button won't fire onPress even with force.
      await expect(saveBtn).toBeEnabled({ timeout: 10_000 });
      await saveBtn.click();
      // Wait for the unsaved badge to disappear (confirms save completed)
      await expect(page.getByText(/\d+ unsaved/i)).not.toBeVisible({
        timeout: 20_000,
      });
    });
  });

  // -----------------------------------------------------------------------
  // PHASE 4 — API VERIFICATION (backend persistence)
  // -----------------------------------------------------------------------

  test('Phase 4: Updated multiplier persists in the backend', async ({
    commissionerJwt,
  }) => {
    await expect
      .poll(
        async () => {
          const data = await gqlFetch<{
            leagueScoringProfile: {
              stats: Array<{
                multiplier: number;
                isOverride: boolean;
                definition: { displayName: string };
              }>;
            };
          }>(commissionerJwt, GET_SCORING_PROFILE, {
            leagueId: state.leagueId,
          });
          const hrStat = data.leagueScoringProfile.stats.find(
            (s) => s.definition.displayName === 'Home Runs',
          );
          return hrStat?.multiplier;
        },
        {
          timeout: 15_000,
          intervals: [1_000, 2_000, 3_000],
          message: `Home Runs multiplier not updated to ${state.updatedMultiplier} within 15s`,
        },
      )
      .toBe(state.updatedMultiplier);
  });

  // -----------------------------------------------------------------------
  // PHASE 5 — RESET ALL AND VERIFY DEFAULTS RESTORED
  // -----------------------------------------------------------------------

  test('Phase 5: Reset All restores the default multiplier', async ({
    commissionerPage: page,
    commissionerJwt,
  }) => {
    await test.step('Open Scoring section', async () => {
      await openScoringSection(page, state.leagueId);
    });

    await test.step('Click Reset All', async () => {
      await page.getByRole('button', { name: 'Reset All' }).click();
      // After Reset All, the Home Run stat is marked as pending (form = default ≠ server override).
      await expect(page.getByText(/\d+ unsaved/i)).toBeVisible({
        timeout: 5_000,
      });
    });

    await test.step('Save the reset', async () => {
      await page.getByRole('button', { name: /save.*change/i }).click();
      await expect(
        page.getByText('Changes saved — scoring table refreshed.'),
      ).toBeVisible({ timeout: 15_000 });
    });

    await test.step('API confirms override is cleared for Home Runs', async () => {
      await expect
        .poll(
          async () => {
            const data = await gqlFetch<{
              leagueScoringProfile: {
                stats: Array<{
                  multiplier: number;
                  isOverride: boolean;
                  definition: { displayName: string };
                }>;
              };
            }>(commissionerJwt, GET_SCORING_PROFILE, {
              leagueId: state.leagueId,
            });
            const hrStat = data.leagueScoringProfile.stats.find(
              (s) => s.definition.displayName === 'Home Runs',
            );
            return hrStat?.isOverride;
          },
          {
            timeout: 15_000,
            intervals: [1_000, 2_000, 3_000],
            message:
              'Home Runs multiplier did not return to default (isOverride remains true)',
          },
        )
        .toBe(false);
    });

    await test.step('Home Runs multiplier matches original default', async () => {
      const data = await gqlFetch<{
        leagueScoringProfile: {
          stats: Array<{
            multiplier: number;
            definition: { displayName: string };
          }>;
        };
      }>(commissionerJwt, GET_SCORING_PROFILE, { leagueId: state.leagueId });
      const hrStat = data.leagueScoringProfile.stats.find(
        (s) => s.definition.displayName === 'Home Runs',
      );
      expect(hrStat?.multiplier).toBe(state.originalMultiplier);
    });
  });

  // -----------------------------------------------------------------------
  // PHASE 6 — NON-COMMISSIONER CANNOT ACCESS SCORING EDITOR
  // -----------------------------------------------------------------------

  test('Phase 6: Non-commissioner does not see the Scoring accordion section', async ({
    commissionerPage: page,
    commissionerJwt,
    managerJwt1,
  }) => {
    await test.step('Switch to manager and navigate to the league commissioner tab', async () => {
      await switchUser(
        page,
        managerJwt1,
        `/baseball/league/${state.leagueId}/commissioner`,
      );
      await page.waitForLoadState('load');
    });

    await test.step('Scoring accordion section is not visible to a regular member', async () => {
      // A non-commissioner should not see the Commissioner tab content at all,
      // or at minimum should not see the Scoring accordion header.
      await expect(
        page.getByRole('button', { name: 'Scoring', exact: true }),
      ).not.toBeVisible({ timeout: 10_000 });
    });

    // Restore commissioner identity.
    await switchUser(page, commissionerJwt);
  });
});
