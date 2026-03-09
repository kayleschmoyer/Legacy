/**
 * Trade Flow UI Integration Test (LS-750)
 *
 * True end-to-end integration test hitting the live backend.
 * No GraphQL mocking — all interactions use real API calls and a real browser.
 *
 * Validates the full trade lifecycle:
 *   1. Commissioner creates a 2-team league, manager joins
 *   2. Automated draft populates both rosters with players
 *   3. Commissioner proposes a trade to the manager (via the Trading Center UI)
 *   4. Manager rejects the incoming offer
 *   5. Manager sends a counter-offer back to the commissioner
 *   6. Commissioner accepts the counter-offer
 *   7. API verifies the accepted trade is persisted in the database
 *   8. Both users can see the completed trade in Trade History
 *
 * Prerequisites:
 *   - A running dev/staging environment (or local Docker stack)
 *   - `./ls-cli.ps1 auth login` run so ~/.legacy-sports/auth.json is valid
 *   - At least 1 non-admin user in the database to impersonate as the manager
 *
 * Run:
 *   pnpm exec playwright test --config apps/web-e2e/playwright.integration.config.ts \
 *     src/integration/tests/trade-flow-ui.integration.spec.ts
 */

import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { test } from '../fixtures/ui';

// ---------------------------------------------------------------------------
// Shared state accumulated across serial phases.
// ---------------------------------------------------------------------------

interface TradeFlowState {
  leagueId: number;
  inviteCode: string;
  leagueName: string;
  /** Commissioner's team ID (resolved via API after draft) */
  commissionerTeamId: number;
  /** Manager's team ID (resolved via API after draft) */
  managerTeamId: number;
  /** ID of the trade the commissioner proposed (for history verification) */
  proposedTradeId: number;
  /** ID of the counter-offer the manager proposed */
  counterTradeId: number;
}

let state: TradeFlowState;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GQL_URL =
  (
    process.env.INTEGRATION_BASE_URL ??
    'https://bd1opa1yv7.execute-api.us-east-1.amazonaws.com/dev/'
  ).replace(/\/?$/, '/') + 'graphql';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Swap the logged-in user by writing a new JWT into localStorage. */
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

/**
 * Navigate to the Trades tab and wait for the Trading Center heading to appear.
 */
async function goToTrades(page: Page, leagueId: number): Promise<void> {
  await page.goto(`/baseball/league/${leagueId}/trades`);
  await page.waitForLoadState('load');
  await expect(page).toHaveURL(/\/trades/, { timeout: 15000 });
  await expect(
    page.getByText('Trading Center', { exact: false }).first(),
  ).toBeVisible({ timeout: 20000 });
}

/**
 * Use the 4-step "Propose Trade" UI dialog to send a trade offer.
 *
 * @param page          - Playwright Page authenticated as the proposing user
 * @param toTeamName    - Visible name of the receiving team to click
 *
 * The dialog flow: Select Team → Select offering players (first available) →
 * Select requesting players (first available) → Confirm and Send.
 */
async function proposeTradeViaUI(
  page: Page,
  toTeamName: string | RegExp,
): Promise<void> {
  // Open the dialog
  const proposeBtn = page
    .getByRole('button', { name: /propose trade/i })
    .first();
  await expect(proposeBtn).toBeVisible({ timeout: 10000 });
  await proposeBtn.click();

  // Step 1: Select the target team
  await expect(
    page.getByText(/select the team you want to trade with/i),
  ).toBeVisible({ timeout: 10000 });
  const teamBtn = page.getByText(toTeamName, { exact: false }).first();
  await expect(teamBtn).toBeVisible({ timeout: 10000 });
  await teamBtn.click();

  // Step 2: Select at least one player to offer (first available)
  await expect(page.getByText(/you will give/i).first()).toBeVisible({
    timeout: 10000,
  });

  // Wait for the player list to load (spinner disappears)
  await page.waitForTimeout(1500);
  const offerPlayerBtns = page.locator(
    '[role="button"]:not([disabled]):not(:has-text(/propose trade/i)):not(:has-text(/next/i))',
  );
  // Pick the first visible player offer button (exclude Nav/Step buttons)
  const offerSection = page.locator('text=/you will give/i').locator('..');
  // Use a more targeted approach — locate buttons in the offer step container
  // by clicking the first player button that appears after the "you will give" label
  const firstOfferPlayer = page
    .locator('[data-step="offer"] button, button')
    .filter({ hasNotText: /propose trade|next|back|send/i })
    .first();

  // Simpler: just grab all visible buttons in the dialog area that are player choices
  const dialogButtons = page.locator(
    '[role="dialog"] button, [aria-modal] button',
  );
  const dialogCount = await dialogButtons.count();

  if (dialogCount === 0) {
    // Fallback: look for any clickable list item inside the fixed overlay
    const overlay = page.locator(
      '[style*="position: fixed"], [style*="z-index: 1000"]',
    );
    const playerItems = overlay.locator('button');
    const itemCount = await playerItems.count();
    if (itemCount > 0) {
      await playerItems.first().click();
    }
  } else {
    // Click first player button (skip navigation/step buttons by checking text length)
    for (let i = 0; i < dialogCount; i++) {
      const btn = dialogButtons.nth(i);
      const text = (await btn.textContent()) ?? '';
      const trimmed = text.trim();
      // Player name buttons have substantial text and don't match navigation labels
      if (
        trimmed.length > 3 &&
        !/^(next|back|send|propose|review|cancel|confirm|\d|✓)$/i.test(trimmed)
      ) {
        await btn.click();
        break;
      }
    }
  }

  // Click "Next — Select Their Players"
  const nextBtn = page.getByRole('button', {
    name: /Next.*Select Their Players/i,
  });
  if (await nextBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await nextBtn.click();
  }

  // Step 3: Select at least one player to request (first available)
  await expect(page.getByText(/give you/i).first()).toBeVisible({
    timeout: 10000,
  });
  await page.waitForTimeout(1500);

  const dialogButtons2 = page.locator(
    '[role="dialog"] button, [aria-modal] button',
  );
  const dialogCount2 = await dialogButtons2.count();
  for (let i = 0; i < dialogCount2; i++) {
    const btn = dialogButtons2.nth(i);
    const text = (await btn.textContent()) ?? '';
    const trimmed = text.trim();
    if (
      trimmed.length > 3 &&
      !/^(next|back|send|propose|review|cancel|confirm|\d|✓)$/i.test(trimmed)
    ) {
      await btn.click();
      break;
    }
  }

  // Click "Review Trade"
  const reviewBtn = page.getByRole('button', { name: /Review Trade/i });
  if (await reviewBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await reviewBtn.click();
  }

  // Step 4: Confirm — click "Send Trade Offer"
  await expect(
    page.getByRole('button', { name: /Send Trade Offer/i }),
  ).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: /Send Trade Offer/i }).click();

  // The dialog should close after successful submission
  await expect(
    page.getByRole('button', { name: /Send Trade Offer/i }),
  ).not.toBeVisible({ timeout: 15000 });
}

// ---------------------------------------------------------------------------
// Serial test suite — phases share `state` and must run in order.
// ---------------------------------------------------------------------------

test.describe
  .serial('Trade Flow UI (Live Backend) @integration @critical', () => {
  test.describe.configure({ retries: 0 });

  test.beforeAll(() => {
    state = {
      leagueId: 0,
      inviteCode: '',
      leagueName: '',
      commissionerTeamId: 0,
      managerTeamId: 0,
      proposedTradeId: 0,
      counterTradeId: 0,
    };
  });

  // -----------------------------------------------------------------
  // PHASE 1 — CREATE LEAGUE (commissioner creates a 2-team league)
  // -----------------------------------------------------------------

  test('Phase 1: Commissioner creates a 2-team league', async ({
    commissionerPage: page,
  }) => {
    await test.step('Navigate to create league page', async () => {
      await page.goto('/baseball/league/create');
      await page.waitForLoadState('domcontentloaded');
      await expect(
        page.getByRole('heading', { name: /Create Baseball League/i }),
      ).toBeVisible({ timeout: 30000 });
    });

    await test.step('Fill in league settings and submit', async () => {
      state.leagueName = `Trade Flow E2E ${Date.now()}`;
      await page
        .getByPlaceholder('Enter your league name')
        .fill(state.leagueName);
      // 2 teams — smallest possible for a quick draft
      await page
        .getByRole('button', { name: '2', exact: true })
        .first()
        .click();
      await page.getByRole('button', { name: /create league/i }).click();
      await expect(page).toHaveURL(/\/baseball\/league\/\d+/, {
        timeout: 30000,
      });
    });

    await test.step('Extract league ID from the URL', () => {
      const url = page.url();
      const match = url.match(/\/baseball\/league\/(\d+)/);
      expect(match).toBeTruthy();
      state.leagueId = Number(match![1]);
      expect(state.leagueId).toBeGreaterThan(0);
    });

    await test.step('Read invite code from the overview page', async () => {
      await page.goto(`/baseball/league/${state.leagueId}/overview`);
      await page.waitForLoadState('load');
      await expect(page.getByText('Manual Code', { exact: false })).toBeVisible(
        { timeout: 15000 },
      );
      const codeLocator = page.locator('text=/^[A-Z0-9]{8}$/').first();
      await expect(codeLocator).toBeVisible({ timeout: 10000 });
      const code = await codeLocator.textContent();
      expect(code).toBeTruthy();
      state.inviteCode = code!;
    });
  });

  // -----------------------------------------------------------------
  // PHASE 2 — MANAGER JOINS THE LEAGUE
  // -----------------------------------------------------------------

  test('Phase 2: Manager joins the league', async ({
    commissionerPage: page,
    commissionerJwt,
    managerJwt1,
  }) => {
    await test.step('Manager 1 joins via the invite code UI', async () => {
      const joinUrl = `/baseball/league/join/${state.inviteCode}`;
      await switchUser(page, managerJwt1, joinUrl);
      await page.waitForLoadState('load');

      await expect(page.getByText(/spot(s)?\s+available/i).first()).toBeVisible(
        { timeout: 15000 },
      );

      await page.locator('#team-name').fill('Trade Busters');
      const joinBtn = page.getByRole('button', { name: /Join League/i });
      await expect(joinBtn).toBeEnabled({ timeout: 5000 });
      await joinBtn.click();
      await expect(page).toHaveURL(/\/baseball\/league\/\d+/, {
        timeout: 15000,
      });
    });

    await test.step('Restore commissioner identity', async () => {
      await switchUser(
        page,
        commissionerJwt,
        `/baseball/league/${state.leagueId}/overview`,
      );
      await page.waitForLoadState('load');
      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
      );
    });
  });

  // -----------------------------------------------------------------
  // PHASE 3 — AUTOMATED DRAFT (populates both rosters)
  // -----------------------------------------------------------------

  test('Phase 3: Automated draft populates both rosters', async ({
    commissionerPage: page,
  }) => {
    test.setTimeout(240_000);

    await test.step('Navigate to commissioner panel', async () => {
      await page.goto(`/baseball/league/${state.leagueId}/commissioner`);
      await page.waitForLoadState('load');
      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
        { timeout: 30000 },
      );
    });

    await test.step('Switch draft mode to Automated', async () => {
      const draftSettingsBtn = page.getByRole('button', {
        name: /Draft Settings/i,
      });
      await expect(draftSettingsBtn).toBeVisible({ timeout: 10000 });
      await draftSettingsBtn.click();

      const automatedBtn = page.getByRole('button', {
        name: /Automated Draft/i,
      });
      await expect(automatedBtn).toBeVisible({ timeout: 5000 });
      await automatedBtn.click();

      const saveBtn = page.getByRole('button', {
        name: /Save Draft Settings/i,
      });
      await expect(saveBtn).toBeEnabled({ timeout: 5000 });
      await saveBtn.click();
      await page.waitForTimeout(1000);
    });

    await test.step('Start the draft', async () => {
      const startBtn = page.getByRole('button', { name: /Start Draft/i });
      await expect(startBtn).toBeVisible({ timeout: 15000 });
      await startBtn.click();

      const confirmBtn = page.getByRole('button', {
        name: /Start Draft|Confirm/i,
      });
      await expect(confirmBtn.last()).toBeVisible({ timeout: 5000 });
      await confirmBtn.last().click();
    });

    await test.step('Wait for Season Active status', async () => {
      const seasonActive = page.getByText('Season Active');
      const deadline = Date.now() + 120_000;
      while (Date.now() < deadline) {
        if (await seasonActive.isVisible().catch(() => false)) break;
        await page.waitForTimeout(5_000);
        await page.reload();
        await page.waitForLoadState('load');
      }
      await expect(seasonActive).toBeVisible({ timeout: 15_000 });
    });

    await test.step('Verify commissioner roster was populated', async () => {
      await page.goto(`/baseball/league/${state.leagueId}/roster`);
      await page.waitForLoadState('load');
      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
      );
      const playerButtons = page.getByRole('button', {
        name: / at (SP|RP|C|1B|2B|3B|SS|OF|DH)$/i,
      });
      await expect(playerButtons.first()).toBeVisible({ timeout: 15000 });
    });
  });

  // -----------------------------------------------------------------
  // PHASE 4 — RESOLVE TEAM IDs via API
  // -----------------------------------------------------------------

  test('Phase 4: Resolve commissioner and manager team IDs', async ({
    commissionerJwt,
    managerJwt1,
  }) => {
    await test.step('Fetch league teams and assign IDs', async () => {
      const data = await gqlFetch<{
        leagueTeams: Array<{
          id: number;
          name: string;
          managerId: number | null;
        }>;
      }>(
        commissionerJwt,
        `query GetLeagueTeams($leagueId: Int!) {
            leagueTeams(leagueId: $leagueId) { id name managerId }
          }`,
        { leagueId: state.leagueId },
      );

      expect(data.leagueTeams.length).toBeGreaterThanOrEqual(2);

      // Identify commissioner's team by resolving the user ID from the JWT
      const commissionerData = await gqlFetch<{
        me: { id: number } | null;
      }>(commissionerJwt, `query { me { id } }`);
      const commissionerUserId = commissionerData.me?.id;
      expect(commissionerUserId).toBeTruthy();

      const managerData = await gqlFetch<{
        me: { id: number } | null;
      }>(managerJwt1, `query { me { id } }`);
      const managerUserId = managerData.me?.id;
      expect(managerUserId).toBeTruthy();

      const commTeam = data.leagueTeams.find(
        (t) => t.managerId === commissionerUserId,
      );
      const mgrTeam = data.leagueTeams.find(
        (t) => t.managerId === managerUserId,
      );

      expect(commTeam).toBeTruthy();
      expect(mgrTeam).toBeTruthy();

      state.commissionerTeamId = commTeam!.id;
      state.managerTeamId = mgrTeam!.id;
      expect(state.commissionerTeamId).toBeGreaterThan(0);
      expect(state.managerTeamId).toBeGreaterThan(0);
    });
  });

  // -----------------------------------------------------------------
  // PHASE 5 — COMMISSIONER PROPOSES TRADE TO MANAGER (via UI)
  // -----------------------------------------------------------------

  test('Phase 5: Commissioner proposes a trade offer', async ({
    commissionerPage: page,
    commissionerJwt,
  }) => {
    await test.step('Navigate to Trades tab', async () => {
      await goToTrades(page, state.leagueId);
    });

    await test.step("Propose a trade to the manager's team", async () => {
      await proposeTradeViaUI(page, /trade busters/i);
    });

    await test.step('Verify the outgoing trade offer appears in the UI', async () => {
      await expect(
        page.getByText('Outgoing Offers', { exact: false }),
      ).toBeVisible({ timeout: 10000 });
      await expect(
        page.getByText('To: Trade Busters', { exact: false }).first(),
      ).toBeVisible({ timeout: 10000 });
    });

    await test.step('Verify the trade was persisted via API', async () => {
      const data = await gqlFetch<{
        teamTradeOffers: Array<{
          id: number;
          status: string;
          proposingTeamId: number;
          receivingTeamId: number;
        }>;
      }>(
        commissionerJwt,
        `query GetTeamTradeOffers($teamId: Int!, $status: String) {
            teamTradeOffers(teamId: $teamId, status: $status) {
              id status proposingTeamId receivingTeamId
            }
          }`,
        { teamId: state.commissionerTeamId, status: 'pending' },
      );

      const pending = data.teamTradeOffers.filter(
        (t) =>
          t.proposingTeamId === state.commissionerTeamId &&
          t.receivingTeamId === state.managerTeamId,
      );
      expect(pending.length).toBeGreaterThan(0);
      state.proposedTradeId = pending[0].id;
      expect(state.proposedTradeId).toBeGreaterThan(0);
    });
  });

  // -----------------------------------------------------------------
  // PHASE 6 — MANAGER REJECTS THE OFFER (via UI)
  // -----------------------------------------------------------------

  test('Phase 6: Manager rejects the incoming trade offer', async ({
    commissionerPage: page,
    commissionerJwt,
    managerJwt1,
  }) => {
    await test.step('Switch to manager identity and go to Trades tab', async () => {
      await switchUser(
        page,
        managerJwt1,
        `/baseball/league/${state.leagueId}/trades`,
      );
      await page.waitForLoadState('load');
      await expect(
        page.getByText('Trading Center', { exact: false }).first(),
      ).toBeVisible({ timeout: 20000 });
    });

    await test.step('Verify incoming offer is visible', async () => {
      await expect(
        page.getByText('Incoming Offers', { exact: false }),
      ).toBeVisible({ timeout: 10000 });
      // The trade card should show the proposing team's name
      await expect(page.getByText(/from:/i).first()).toBeVisible({
        timeout: 15000,
      });
    });

    await test.step('Click Reject on the incoming offer', async () => {
      const rejectBtn = page.getByRole('button', { name: /Reject/i }).first();
      await expect(rejectBtn).toBeVisible({ timeout: 10000 });
      await rejectBtn.click();
      // The offer should disappear from Incoming after rejection
      await page.waitForTimeout(2000);
    });

    await test.step('Verify trade is marked rejected via API', async () => {
      await expect
        .poll(
          async () => {
            const data = await gqlFetch<{
              teamTradeOffers: Array<{ id: number; status: string }>;
            }>(
              commissionerJwt,
              `query GetTeamTradeOffers($teamId: Int!) {
                  teamTradeOffers(teamId: $teamId) { id status }
                }`,
              { teamId: state.commissionerTeamId },
            );
            const trade = data.teamTradeOffers.find(
              (t) => t.id === state.proposedTradeId,
            );
            return trade?.status;
          },
          {
            timeout: 15_000,
            intervals: [1_000, 2_000, 3_000],
            message: `Trade ${state.proposedTradeId} did not reach 'rejected' status`,
          },
        )
        .toBe('rejected');
    });

    await test.step('Restore commissioner identity', async () => {
      await switchUser(page, commissionerJwt);
    });
  });

  // -----------------------------------------------------------------
  // PHASE 7 — MANAGER SENDS A COUNTER-OFFER (via UI)
  // A counter is: reject the original → propose a new trade in reverse.
  // Phase 6 handled the rejection; here the manager now proposes back.
  // -----------------------------------------------------------------

  test('Phase 7: Manager sends a counter-offer to the commissioner', async ({
    commissionerPage: page,
    commissionerJwt,
    managerJwt1,
  }) => {
    await test.step('Switch to manager and navigate to Trades tab', async () => {
      await switchUser(
        page,
        managerJwt1,
        `/baseball/league/${state.leagueId}/trades`,
      );
      await page.waitForLoadState('load');
      await expect(
        page.getByText('Trading Center', { exact: false }).first(),
      ).toBeVisible({ timeout: 20000 });
    });

    await test.step("Propose a counter-offer to the commissioner's team", async () => {
      // The commissioner's team name is whatever was auto-named at league creation.
      // We target it by excluding "Trade Busters" (the manager's own team name).
      // Use a general approach: click Propose Trade and select the first other team.
      const proposeBtn = page
        .getByRole('button', { name: /propose trade/i })
        .first();
      await expect(proposeBtn).toBeVisible({ timeout: 10000 });
      await proposeBtn.click();

      // Step 1: Select the first team shown (commissioner's team)
      await expect(
        page.getByText(/select the team you want to trade with/i),
      ).toBeVisible({ timeout: 10000 });

      // Pick the first team button in the dialog
      const teamButtons = page.locator(
        '[role="dialog"] button, [aria-modal] button',
      );
      await page.waitForTimeout(1000);
      const teamCount = await teamButtons.count();
      let teamClicked = false;
      for (let i = 0; i < teamCount; i++) {
        const btn = teamButtons.nth(i);
        const text = (await btn.textContent()) ?? '';
        const trimmed = text.trim();
        if (
          trimmed.length > 2 &&
          !/^(propose|next|back|send|review|cancel|confirm|✓|\d)$/i.test(
            trimmed,
          )
        ) {
          await btn.click();
          teamClicked = true;
          break;
        }
      }
      expect(teamClicked).toBe(true);

      // Step 2: Select offering player (first available)
      await expect(page.getByText(/you will give/i).first()).toBeVisible({
        timeout: 10000,
      });
      await page.waitForTimeout(1500);

      const offerBtns = page.locator(
        '[role="dialog"] button, [aria-modal] button',
      );
      const offerCount = await offerBtns.count();
      for (let i = 0; i < offerCount; i++) {
        const btn = offerBtns.nth(i);
        const text = (await btn.textContent()) ?? '';
        const trimmed = text.trim();
        if (
          trimmed.length > 3 &&
          !/^(next|back|send|propose|review|cancel|confirm|\d|✓)$/i.test(
            trimmed,
          )
        ) {
          await btn.click();
          break;
        }
      }

      // Click "Next — Select Their Players"
      const nextBtn2 = page.getByRole('button', {
        name: /Next.*Select Their Players/i,
      });
      if (await nextBtn2.isVisible({ timeout: 5000 }).catch(() => false)) {
        await nextBtn2.click();
      }

      // Step 3: Select requesting player (first available)
      await expect(page.getByText(/give you/i).first()).toBeVisible({
        timeout: 10000,
      });
      await page.waitForTimeout(1500);

      const requestBtns = page.locator(
        '[role="dialog"] button, [aria-modal] button',
      );
      const requestCount = await requestBtns.count();
      for (let i = 0; i < requestCount; i++) {
        const btn = requestBtns.nth(i);
        const text = (await btn.textContent()) ?? '';
        const trimmed = text.trim();
        if (
          trimmed.length > 3 &&
          !/^(next|back|send|propose|review|cancel|confirm|\d|✓)$/i.test(
            trimmed,
          )
        ) {
          await btn.click();
          break;
        }
      }

      // Click "Review Trade"
      const reviewBtn2 = page.getByRole('button', { name: /Review Trade/i });
      if (await reviewBtn2.isVisible({ timeout: 5000 }).catch(() => false)) {
        await reviewBtn2.click();
      }

      // Step 4: Send
      await expect(
        page.getByRole('button', { name: /Send Trade Offer/i }),
      ).toBeVisible({ timeout: 10000 });
      await page.getByRole('button', { name: /Send Trade Offer/i }).click();
      await expect(
        page.getByRole('button', { name: /Send Trade Offer/i }),
      ).not.toBeVisible({ timeout: 15000 });
    });

    await test.step('Verify counter-offer is visible as outgoing', async () => {
      await expect(
        page.getByText('Outgoing Offers', { exact: false }),
      ).toBeVisible({ timeout: 10000 });
    });

    await test.step('Verify counter-offer persisted via API', async () => {
      const data = await gqlFetch<{
        teamTradeOffers: Array<{
          id: number;
          status: string;
          proposingTeamId: number;
          receivingTeamId: number;
        }>;
      }>(
        managerJwt1,
        `query GetTeamTradeOffers($teamId: Int!, $status: String) {
            teamTradeOffers(teamId: $teamId, status: $status) {
              id status proposingTeamId receivingTeamId
            }
          }`,
        { teamId: state.managerTeamId, status: 'pending' },
      );

      const counter = data.teamTradeOffers.find(
        (t) =>
          t.proposingTeamId === state.managerTeamId &&
          t.receivingTeamId === state.commissionerTeamId,
      );
      expect(counter).toBeTruthy();
      state.counterTradeId = counter!.id;
      expect(state.counterTradeId).toBeGreaterThan(0);
    });

    await test.step('Restore commissioner identity', async () => {
      await switchUser(page, commissionerJwt);
    });
  });

  // -----------------------------------------------------------------
  // PHASE 8 — COMMISSIONER ACCEPTS THE COUNTER-OFFER (via UI)
  // -----------------------------------------------------------------

  test('Phase 8: Commissioner accepts the counter-offer', async ({
    commissionerPage: page,
    commissionerJwt,
  }) => {
    await test.step('Navigate to Trades tab as commissioner', async () => {
      await goToTrades(page, state.leagueId);
    });

    await test.step('Verify the counter-offer appears in Incoming Offers', async () => {
      await expect(
        page.getByText('Incoming Offers', { exact: false }),
      ).toBeVisible({ timeout: 10000 });
      await expect(page.getByText(/from:/i).first()).toBeVisible({
        timeout: 15000,
      });
    });

    await test.step('Click Accept on the counter-offer', async () => {
      const acceptBtn = page.getByRole('button', { name: /Accept/i }).first();
      await expect(acceptBtn).toBeVisible({ timeout: 10000 });
      await acceptBtn.click();
      await page.waitForTimeout(2000);
    });

    await test.step('Verify the accepted trade is persisted via API', async () => {
      await expect
        .poll(
          async () => {
            const data = await gqlFetch<{
              teamTradeOffers: Array<{ id: number; status: string }>;
            }>(
              commissionerJwt,
              `query GetTeamTradeOffers($teamId: Int!) {
                  teamTradeOffers(teamId: $teamId) { id status }
                }`,
              { teamId: state.commissionerTeamId },
            );
            const trade = data.teamTradeOffers.find(
              (t) => t.id === state.counterTradeId,
            );
            return trade?.status;
          },
          {
            timeout: 20_000,
            intervals: [1_000, 2_000, 3_000],
            message: `Counter-offer ${state.counterTradeId} did not reach 'accepted' status`,
          },
        )
        .toBe('accepted');
    });

    await test.step('Verify rejected offer is gone from Incoming Offers', async () => {
      // The Incoming Offers section should now be empty (no pending offers remain)
      await expect(page.getByText(/No incoming trade offers/i)).toBeVisible({
        timeout: 10000,
      });
    });
  });

  // -----------------------------------------------------------------
  // PHASE 9 — TRADE HISTORY (both users verify completed trades)
  // -----------------------------------------------------------------

  test('Phase 9: Trade history shows completed trades for both users', async ({
    commissionerPage: page,
    commissionerJwt,
    managerJwt1,
  }) => {
    await test.step('Commissioner sees accepted trade in Trade History', async () => {
      await goToTrades(page, state.leagueId);

      // Expand Trade History
      const historyBtn = page.getByRole('button', {
        name: /Trade History/i,
      });
      await expect(historyBtn).toBeVisible({ timeout: 10000 });
      await historyBtn.click();

      // Should see at least one completed trade card
      await expect(page.getByText(/ACCEPTED|REJECTED/i).first()).toBeVisible({
        timeout: 15000,
      });
    });

    await test.step('Manager sees the accepted trade in Trade History', async () => {
      await switchUser(
        page,
        managerJwt1,
        `/baseball/league/${state.leagueId}/trades`,
      );
      await page.waitForLoadState('load');
      await expect(
        page.getByText('Trading Center', { exact: false }).first(),
      ).toBeVisible({ timeout: 20000 });

      // Expand Trade History
      const historyBtn2 = page.getByRole('button', {
        name: /Trade History/i,
      });
      await expect(historyBtn2).toBeVisible({ timeout: 10000 });
      await historyBtn2.click();

      // Both the original rejected offer and the accepted counter should appear
      await expect(page.getByText(/ACCEPTED|REJECTED/i).first()).toBeVisible({
        timeout: 15000,
      });

      const completedBadges = page.getByText(/ACCEPTED|REJECTED/i);
      const count = await completedBadges.count();
      expect(count).toBeGreaterThanOrEqual(2);
    });

    await test.step('Restore commissioner identity', async () => {
      await switchUser(page, commissionerJwt);
    });
  });
});
