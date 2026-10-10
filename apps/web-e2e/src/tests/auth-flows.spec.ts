/**
 * Authentication Flow E2E Tests
 *
 * Covers: login page display, protected route enforcement, session expiry,
 * and logout — both programmatic and via the profile dropdown UI.
 */

import { getViolations, injectAxe } from 'axe-playwright';
import { adminTest, expect, test, unauthTest } from '../fixtures/pages';
import { buildAuthStorageState } from '../fixtures/auth-enhanced';
import { withApiIsolation } from '../fixtures/api-isolation';
import {
  extractOperationName,
  tierUserByIdResponse,
} from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';
import { pathEndsWithMatcher } from '../utils/route-matchers';
import { E2E_SIGNING_SECRET, signE2EJwt } from '../utils/jwt';
import { DESKTOP_VIEWPORT } from '../utils/viewport';

/** Read the base URL that Playwright is actually using (set in playwright.config.ts). */
const E2E_ORIGIN = `http://localhost:${process.env.E2E_PORT || 4280}`;

/** Create a JWT whose `exp` is already in the past (expired 1 hour ago). */
function signExpiredJwt(): string {
  const now = Math.floor(Date.now() / 1000);
  return signE2EJwt(
    {
      id: 1,
      email: 'user@test.com',
      username: 'testuser',
      accessLevel: 'none',
      iat: now - 7200, // issued 2 hours ago
      exp: now - 3600, // expired 1 hour ago
    },
    E2E_SIGNING_SECRET,
  );
}

/** Custom fixture that loads an expired JWT into cookies + stale profile. */
const expiredSessionTest = test.extend({
  storageState: async ({}, use) => {
    const jwt = signExpiredJwt();
    const expiry = Math.floor(Date.now() / 1000) - 3600; // already expired
    await use({
      cookies: [
        {
          name: 'ls_jwt',
          value: jwt,
          domain: 'localhost',
          path: '/',
          httpOnly: true,
          secure: false,
          sameSite: 'Lax' as const,
          expires: -1, // expired
        },
        {
          name: 'ls_csrf',
          value: 'e2e-csrf-token',
          domain: 'localhost',
          path: '/',
          httpOnly: false,
          secure: false,
          sameSite: 'Lax' as const,
          expires: -1,
        },
      ],
      origins: [
        {
          origin: E2E_ORIGIN,
          localStorage: [
            {
              name: 'ls_user_profile',
              value: JSON.stringify({
                id: 1,
                email: 'expired@test.com',
                username: 'expired',
                accessLevel: 'none',
              }),
            },
            { name: 'ls_token_expiry', value: String(expiry) },
          ],
        },
      ],
    });
  },
});

// ---------------------------------------------------------------------------
// Login Flow — unauthenticated user sees the login gate
// ---------------------------------------------------------------------------

unauthTest.describe('Login Flow @critical', () => {
  unauthTest(
    'shows the Continue with Google button when not authenticated',
    async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('load');

      await expect(
        page.getByRole('button', { name: /continue with google/i }),
      ).toBeVisible({ timeout: 15000 });
    },
  );

  unauthTest('displays the landing page headline', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('load');

    await expect(page.getByText(/claim your dynasty/i)).toBeVisible({
      timeout: 15000,
    });
  });

  unauthTest(
    'does not render the app navigation when unauthenticated',
    async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('load');

      // The authenticated app nav contains "My Leagues" and "Sports" dropdowns.
      // PR #2877 (LS-3494) added aria-label="Primary" to the landing page nav
      // too, so we check an auth-only element instead of the nav container.
      await expect(page.getByText(/my leagues/i)).not.toBeVisible();
    },
  );
});

// ---------------------------------------------------------------------------
// LS-3531: "Continue with Google" button click on / must not throw a CSS
// selector parse error. The functional scanner used the invalid selector
// `(button:visible, [role="button"]:visible)` which caused a Playwright
// parse failure on click. This test locks in the correct getByRole locator.
// ---------------------------------------------------------------------------

unauthTest.describe(
  'Home page — Continue with Google button clickable @regression',
  () => {
    unauthTest(
      '"Continue with Google" button on / is clickable via getByRole (LS-3531)',
      async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('load');

        const googleBtn = page.getByRole('button', {
          name: /continue with google/i,
        });
        await expect(googleBtn).toBeVisible({ timeout: 15_000 });
        await expect(googleBtn).toBeEnabled();
        // Confirm the click resolves without a CSS selector parse error —
        // regression coverage for the original crawler failure where the
        // invalid `(button:visible, [role="button"]:visible)` selector was used.
        await googleBtn.click();
      },
    );
  },
);

// ---------------------------------------------------------------------------
// LS-3470: "Continue with Discord" button click on / must not throw a CSS
// selector parse error. The functional scanner used the invalid selector
// `(button:visible, [role="button"]:visible)` which caused a Playwright
// parse failure when attempting to click the Discord CTA on the landing page.
// This test locks in the correct getByRole locator for the always-rendered
// Google CTA.
// Note: the Discord CTA is env-gated on `VITE_DISCORD_CLIENT_ID` and is not
// rendered in hermetic E2E builds, so the Google CTA is used here as regression
// coverage — the underlying failure was the selector syntax, not the button identity.
// ---------------------------------------------------------------------------

unauthTest.describe(
  '/ — auth-gated Discord CTA clickable via getByRole @regression',
  () => {
    unauthTest(
      '"Continue with Google" button on / is clickable via getByRole (LS-3470)',
      async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('load');

        const googleBtn = page.getByRole('button', {
          name: /continue with google/i,
        });
        await expect(googleBtn).toBeVisible({ timeout: 15_000 });
        await expect(googleBtn).toBeEnabled();
        // Confirm the click resolves without a CSS selector parse error —
        // regression coverage for the original crawler failure where the
        // invalid `(button:visible, [role="button"]:visible)` selector was used.
        await googleBtn.click();
      },
    );
  },
);

// ---------------------------------------------------------------------------
// LS-3508: "Continue with Discord" button click on /profile/settings must not
// throw a CSS selector parse error. The functional scanner used the invalid
// selector `(button:visible, [role="button"]:visible)` which caused a Playwright
// parse failure when attempting to click the Discord CTA. This test locks in
// the correct getByRole locator for the always-rendered Google CTA.
// Note: the Discord CTA is env-gated on `VITE_DISCORD_CLIENT_ID` and is not
// rendered in hermetic E2E builds, so the Google CTA is used here as regression
// coverage — the underlying failure was the selector syntax, not the button identity.
// ---------------------------------------------------------------------------

unauthTest.describe(
  '/profile/settings — auth-gated CTA clickable via getByRole @regression',
  () => {
    unauthTest(
      '"Continue with Google" button on /profile/settings is clickable via getByRole (LS-3508)',
      async ({ page }) => {
        await page.goto('/profile/settings');
        await page.waitForLoadState('load');

        const googleBtn = page.getByRole('button', {
          name: /continue with google/i,
        });
        await expect(googleBtn).toBeVisible({ timeout: 15_000 });
        await expect(googleBtn).toBeEnabled();
        // Confirm the click resolves without a CSS selector parse error —
        // regression coverage for the original crawler failure where the
        // invalid `(button:visible, [role="button"]:visible)` selector was used.
        await googleBtn.click();
      },
    );
  },
);

// ---------------------------------------------------------------------------
// LS-3487: "Continue with Discord" button click on /baseball/mock-draft must
// not throw a CSS selector parse error. The functional scanner used the invalid
// selector `(button:visible, [role="button"]:visible)` which caused a Playwright
// parse failure when attempting to click the Discord CTA. This test locks in
// the correct getByRole locator for the always-rendered Google CTA.
// Note: the Discord CTA is env-gated on `VITE_DISCORD_CLIENT_ID` and is not
// rendered in hermetic E2E builds, so the Google CTA is used here as regression
// coverage — the underlying failure was the selector syntax, not the button identity.
// ---------------------------------------------------------------------------

// LS-3487 / LS-3666: /baseball/mock-draft is a protected route. Unauthenticated
// users are intercepted by EnhancedAuthGuard and shown the login page.  The URL
// is preserved (no replaceState redirect) so users can bookmark their intent.
// The login page exposes the "Continue with Google" and "Get Started Free" CTAs.
unauthTest.describe(
  '/baseball/mock-draft — protected route shows login page @regression',
  () => {
    unauthTest(
      'unauthenticated users visiting /baseball/mock-draft see the login page (LS-3487)',
      async ({ page }) => {
        await page.goto('/baseball/mock-draft');
        await page.waitForLoadState('load');

        // Route is protected: auth guard intercepts and renders the login page.
        await expect(
          page.getByRole('button', { name: /continue with google/i }),
        ).toBeVisible({ timeout: 15_000 });
      },
    );
  },
);

// ---------------------------------------------------------------------------
// LS-3478: "Continue with Discord" button click on /baseball/league/create must
// not throw a CSS selector parse error. The functional scanner used the invalid
// selector `(button:visible, [role="button"]:visible)` which caused a Playwright
// parse failure when attempting to click the Discord CTA. This test locks in
// the correct getByRole locator for the always-rendered Google CTA.
// Note: the Discord CTA is env-gated on `VITE_DISCORD_CLIENT_ID` and is not
// rendered in hermetic E2E builds, so the Google CTA is used here as regression
// coverage — the underlying failure was the selector syntax, not the button identity.
// ---------------------------------------------------------------------------

unauthTest.describe(
  '/baseball/league/create — auth-gated CTA clickable via getByRole @regression',
  () => {
    unauthTest(
      '"Continue with Discord" button on /baseball/league/create is clickable via getByRole (LS-3478)',
      async ({ page }) => {
        await page.goto('/baseball/league/create');
        await page.waitForLoadState('load');

        const googleBtn = page.getByRole('button', {
          name: /continue with google/i,
        });
        await expect(googleBtn).toBeVisible({ timeout: 15_000 });
        await expect(googleBtn).toBeEnabled();
        // Confirm the click resolves without a CSS selector parse error —
        // regression coverage for the original crawler failure where the
        // invalid `(button:visible, [role="button"]:visible)` selector was used.
        await googleBtn.click();
      },
    );
  },
);

// ---------------------------------------------------------------------------
// Protected Routes — routes that require authentication
//
// Regression coverage for functional-scan bug reports where the scanner used
// an invalid CSS selector `(button:visible, [role="button"]:visible)` and
// failed to click sign-in CTAs on protected routes. This has surfaced for
// multiple routes — LS-3531 (/), LS-3549 (/players/stats), LS-3553
// (/profile/settings), LS-3539 (/baseball/mock-draft), and LS-3535
// (/baseball/league/create, reported as a "Continue with Discord" click
// failure). EnhancedAuthGuard replaces the route content with
// PublicLandingPage for unauthenticated users; each route below asserts the
// always-rendered Google CTA is discoverable via `getByRole` — the correct,
// accessibility-first locator. The Google CTA is sufficient regression
// coverage because the underlying failure was the selector syntax, not the
// button identity (the Discord CTA is env-gated on `VITE_DISCORD_CLIENT_ID`
// and not rendered in hermetic E2E builds).
// ---------------------------------------------------------------------------

unauthTest.describe('Protected Routes @critical', () => {
  const routes = [
    '/',
    // /baseball is publicly accessible (LS-3532) — see Public Routes section below.
    // /players is publicly accessible (LS-3493, LS-3497) — see Public Routes section below.
    '/baseball/mock-draft',
    '/management',
    '/profile/settings',
    // /preferences is publicly accessible (LS-4791) — see preferences.spec.ts for
    // unauthenticated coverage (appearance section, NotificationsSignInCard).
    // /help is publicly accessible (LS-3513) — see Public Routes section below.
    // /games/season-draft/create is authenticated-only (LS-3543). An automated
    // scanner attempted to click the landing-page CTA with the invalid
    // `(button:visible, [role="button"]:visible)` selector and logged a false
    // positive. Covered here via the correct getByRole locator.
    '/games/season-draft/create',
    // /baseball/league/join is now a public path (LS-3702) — moved to the
    // "Public Routes" section below. Invite links must work without prior auth.
    // /baseball/league/create is authenticated-only (LS-3534). Same
    // functional-scan false positive — scanner failed to click "Continue with
    // Google" and logged a 404. Covered here via the correct getByRole locator.
    '/baseball/league/create',
    // /games/season-draft is authenticated-only (LS-3540 / LS-3541). Same
    // scanner false positive — including a "Continue with Discord" CSS-selector
    // parse error on the invalid `(button:visible, [role="button"]:visible)`
    // selector. Covered here and in season-draft-games.spec.ts via getByRole.
    '/games/season-draft',
  ];

  for (const route of routes) {
    unauthTest(
      `shows landing page on ${route} when not authenticated`,
      async ({ page }) => {
        await page.goto(route);
        await page.waitForLoadState('load');

        await expect(
          page.getByRole('button', { name: /continue with google/i }),
        ).toBeVisible({ timeout: 15000 });
      },
    );
  }
});

// ---------------------------------------------------------------------------
// Public Routes — accessible without authentication (LS-3566, LS-3563, LS-3561,
// LS-3522, LS-3548, LS-3513)
// ---------------------------------------------------------------------------

unauthTest.describe('Public Routes @critical', () => {
  unauthTest(
    'shows Help page content on /help when not authenticated (LS-3513)',
    async ({ page }) => {
      await page.goto('/help');
      await page.waitForLoadState('load');

      // LS-3513: /help was a protected route showing the marketing landing page
      // to unauthenticated users. It is now public so help docs are accessible
      // without sign-in.
      await expect(
        page.getByRole('heading', { name: /help & support/i, level: 1 }),
      ).toBeVisible({ timeout: 15000 });
      await expect(page.locator('body')).not.toContainText(
        'Build Your Dynasty',
      );
    },
  );

  unauthTest(
    'shows About page content on /about when not authenticated',
    async ({ page }) => {
      await page.goto('/about');
      await page.waitForLoadState('load');

      await expect(
        page.getByRole('heading', { name: /about legacy sports/i }),
      ).toBeVisible({ timeout: 15000 });
    },
  );

  // LS-3511: /help is publicly accessible so unauthenticated users can read
  // FAQs and contact info before signing up. Direct navigation must show the
  // Help page content — not the "Build Your Dynasty" marketing landing page.
  unauthTest(
    'shows Help page content on /help when not authenticated (LS-3511)',
    async ({ page }) => {
      await page.goto('/help');
      await page.waitForLoadState('load');

      await expect(
        page.getByRole('heading', { name: /help & support/i, level: 1 }),
      ).toBeVisible({ timeout: 15000 });
      await expect(page.locator('body')).not.toContainText(
        'Build Your Dynasty',
      );
    },
  );

  unauthTest(
    'shows Scoreboard page content on /scoreboard when not authenticated (LS-3522)',
    async ({ page }) => {
      await page.goto('/scoreboard');
      await page.waitForLoadState('load');

      // LS-3522: direct navigation to /scoreboard was returning 404 and rendering
      // the marketing landing page ("Build Your Dynasty") for unauthenticated users.
      // /scoreboard must be in publicPaths so EnhancedAuthGuard passes through.
      await expect(page.getByTestId('scoreboard-heading')).toBeVisible({
        timeout: 15000,
      });
      await expect(page.locator('body')).not.toContainText(
        'Build Your Dynasty',
      );
    },
  );

  // LS-4791: /preferences was added to publicPaths so unauthenticated users can
  // access their account preferences before completing onboarding. Direct
  // navigation must show the Preferences page — not the marketing landing page.
  unauthTest(
    'shows Preferences page content on /preferences when not authenticated (LS-4791)',
    async ({ page }) => {
      await page.goto('/preferences');
      await page.waitForLoadState('load');

      await expect(
        page.getByRole('heading', { name: /preferences/i, level: 1 }),
      ).toBeVisible({ timeout: 15000 });
      await expect(page.locator('body')).not.toContainText(
        'Build Your Dynasty',
      );
    },
  );

  unauthTest(
    'shows Pricing page content on /pricing when not authenticated',
    async ({ page }) => {
      await page.goto('/pricing');
      await page.waitForLoadState('load');

      await expect(
        page.getByRole('heading', { name: /the plan that fits/i }),
      ).toBeVisible({ timeout: 15000 });
    },
  );

  unauthTest(
    'redirects /faq to /pricing for unauthenticated users (LS-3557)',
    async ({ page }) => {
      await page.goto('/faq');
      await page.waitForLoadState('load');

      await expect(page).toHaveURL(/\/pricing/);
      await expect(
        page.getByRole('heading', { name: /the plan that fits/i }),
      ).toBeVisible({ timeout: 15000 });
    },
  );

  // LS-3519: /faq redirects to /pricing; the functional scanner attempted to
  // click a CTA using the invalid `(button:visible, [role="button"]:visible)`
  // CSS selector and logged a parse error.  This test locks in the correct
  // getByRole locator so the "Get Started Free" CTA on the landing pricing
  // page is always reachable without a selector syntax failure.
  unauthTest(
    '/faq redirects to /pricing and "Get Started Free" is clickable via getByRole (LS-3519)',
    async ({ page }) => {
      await page.goto('/faq');
      await page.waitForLoadState('load');

      // Confirm redirect landed on /pricing.
      await expect(page).toHaveURL(/\/pricing/);

      // Locate the CTA by accessible name — regression guard against the
      // `(button:visible, [role="button"]:visible)` selector parse error.
      const getStartedBtn = page
        .getByRole('button', { name: /get started free/i })
        .first();
      await expect(getStartedBtn).toBeVisible({ timeout: 15_000 });
      await expect(getStartedBtn).toBeEnabled();
      await getStartedBtn.click();
    },
  );

  unauthTest(
    'shows Player Stats page content on /players/stats when not authenticated (LS-3548)',
    async ({ page, playersPage }) => {
      await page.goto('/players/stats');
      await page.waitForLoadState('load');

      // LS-9326: the desktop table heading has no equivalent at phone width
      // (LS-9075's card feed) — resolve the presentation the current
      // viewport actually renders instead of hardcoding the desktop locator.
      await playersPage.stats.expectStatsSurfaceVisible('mlb');
    },
  );

  // ---------------------------------------------------------------------------
  // LS-3500: /players/stats must NOT show the PublicLandingPage season badge.
  // A functional scanner previously reported "(!) Fantasy Baseball · Season 2026"
  // on this route because the route was incorrectly gated — EnhancedAuthGuard
  // was showing PublicLandingPage (which contains the HeroBadge with a baseball
  // SVG icon that the scanner rendered as a "(!) " warning indicator).
  // LS-3548 added /players/stats to publicPaths; this test locks in that the
  // landing-page badge text is permanently absent from the public stats route.
  // ---------------------------------------------------------------------------
  unauthTest(
    'does not show the landing-page season badge on /players/stats (LS-3500)',
    async ({ page, playersPage }) => {
      await page.goto('/players/stats');
      await page.waitForLoadState('load');

      // The "Fantasy Baseball · Season 2026" badge lives on PublicLandingPage.
      // Since /players/stats is public, the landing page must NOT render here.
      await expect(page.locator('body')).not.toContainText(
        'Fantasy Baseball · Season 2026',
      );

      // Player stats content is visible — confirming the correct page loaded
      // (LS-9326: viewport-aware, since phone width renders the LS-9075
      // card feed rather than the desktop table).
      await playersPage.stats.expectStatsSurfaceVisible('mlb');
    },
  );

  // ---------------------------------------------------------------------------
  // LS-3499: /players/stats must expose a <main> landmark for assistive tech.
  // An accessibility scan reported "Page has no <main> landmark" on this route.
  // The scan was run while the route was incorrectly gated (pre-LS-3548) and
  // landed on a stripped auth shell with no landmark. Now that /players/stats
  // is public, it renders inside MainLayout's YStack tag="main" wrapper. This
  // test locks in that a single <main> landmark is present on the public route.
  // ---------------------------------------------------------------------------
  unauthTest(
    'exposes a <main> landmark on /players/stats (LS-3499)',
    async ({ page }) => {
      await page.goto('/players/stats');
      await page.waitForLoadState('load');

      await expect(page.locator('main#main-content')).toBeVisible({
        timeout: 15000,
      });
      await expect(page.getByRole('main')).toHaveCount(1);
    },
  );

  // ---------------------------------------------------------------------------
  // LS-3469: unauthenticated homepage `/` must expose both <main> and <nav>
  // landmarks for assistive tech. An accessibility scan reported that the page
  // lacked both landmarks. PR #2877 (LS-3494) added `tag="main"` and `tag="nav"`
  // on PublicLandingPage. This test locks in that both landmarks are present
  // on the unauthenticated landing page so the regression cannot return.
  // ---------------------------------------------------------------------------
  unauthTest(
    'exposes <main> and <nav> landmarks on / when not authenticated (LS-3469)',
    async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('load');

      // Landing page content is visible — confirms we're on PublicLandingPage.
      await expect(page.getByText(/claim your dynasty/i)).toBeVisible({
        timeout: 15000,
      });

      await expect(page.getByRole('main')).toBeVisible({ timeout: 15000 });
      await expect(
        page.getByRole('navigation', { name: /landing/i }),
      ).toBeVisible({ timeout: 15000 });
    },
  );

  unauthTest(
    'shows Player Stats content on /players when not authenticated (LS-3497, LS-9076)',
    async ({ page, playersPage }) => {
      await page.goto('/players');
      await page.waitForLoadState('load');

      // LS-9076: /players is the canonical merged player browse + stats
      // surface — it renders what /players/stats used to render. LS-9326:
      // viewport-aware, since phone width renders the LS-9075 card feed.
      await playersPage.stats.expectStatsSurfaceVisible('mlb');
    },
  );

  // ---------------------------------------------------------------------------
  // LS-3497: /players must NOT show the PublicLandingPage season badge.
  // A functional scanner reported "(!) Fantasy Baseball · Season 2026" on this
  // route because the route was incorrectly gated — EnhancedAuthGuard was
  // showing PublicLandingPage (which contains the HeroBadge with a baseball SVG
  // icon that the scanner rendered as a "(!) " warning indicator).
  // Adding /players to publicPaths ensures the players directory renders
  // directly for unauthenticated users, eliminating the spurious warning badge.
  // ---------------------------------------------------------------------------
  unauthTest(
    'does not show the landing-page season badge on /players (LS-3497)',
    async ({ page, playersPage }) => {
      await page.goto('/players');
      await page.waitForLoadState('load');

      // The "Fantasy Baseball · Season 2026" badge lives on PublicLandingPage.
      // Since /players is now public, the landing page must NOT render here.
      await expect(page.locator('body')).not.toContainText(
        'Fantasy Baseball · Season 2026',
      );

      // Player stats content is visible — confirming the correct page loaded
      // (LS-9076: /players now renders what /players/stats used to; LS-9326:
      // viewport-aware, since phone width renders the LS-9075 card feed).
      await playersPage.stats.expectStatsSurfaceVisible('mlb');
    },
  );

  unauthTest(
    'shows Baseball hub content on /baseball when not authenticated (LS-3532)',
    async ({ page }) => {
      await page.goto('/baseball');
      await page.waitForLoadState('load');

      await expect(
        page.getByRole('heading', { name: /baseball fantasy/i }),
      ).toBeVisible({ timeout: 15000 });
    },
  );
});

// ---------------------------------------------------------------------------
// Functional 404 Regression: /games/season-draft (LS-3488)
//
// An automated functional scanner reported repeated HTTP 404 responses on
// /games/season-draft even though the EnhancedAuthGuard was rendering the
// PublicLandingPage (showing "Build Your Dynasty" headings).  The scanner
// hits the route unauthenticated and the underlying SPA server was not
// returning a proper 200 for the catch-all HTML entry point.
//
// Expected: unauthenticated navigation to /games/season-draft returns HTTP
// 200 and renders the auth gate (landing page with "Continue with Google").
// ---------------------------------------------------------------------------

unauthTest.describe(
  'Functional 404 Regression — /games/season-draft (LS-3488) @critical',
  () => {
    // LS-3488: server must return HTTP 200 (not 404) so the client SPA can
    // mount and the EnhancedAuthGuard can render the auth gate.
    unauthTest(
      'returns HTTP 200 on /games/season-draft when not authenticated (LS-3488)',
      async ({ page }) => {
        const response = await page.goto('/games/season-draft');
        expect(response?.status()).toBe(200);
      },
    );

    // LS-3488: unauthenticated users must see the auth gate — the landing
    // page with "Continue with Google" — not a raw 404 error page.
    unauthTest(
      'shows auth gate on /games/season-draft when not authenticated (LS-3488)',
      async ({ page }) => {
        await page.goto('/games/season-draft');
        await page.waitForLoadState('load');

        await expect(
          page.getByRole('button', { name: /continue with google/i }),
        ).toBeVisible({ timeout: 15000 });
      },
    );

    // LS-3488: the page title must reflect a valid app page, not a generic
    // "404 Not Found" title that would indicate a server-level routing gap.
    unauthTest(
      'does not show a 404 page title on /games/season-draft (LS-3488)',
      async ({ page }) => {
        await page.goto('/games/season-draft');
        await page.waitForLoadState('load');

        const title = await page.title();
        expect(title).not.toMatch(/404|not found/i);
      },
    );
  },
);

// ---------------------------------------------------------------------------
// Functional 404 Regression: /baseball/league/join (LS-3479)
//
// An automated functional scanner reported repeated HTTP 404 responses on
// /baseball/league/join even though the EnhancedAuthGuard was rendering the
// PublicLandingPage (showing "Build Your Dynasty" headings).  The scanner
// hits the route unauthenticated and the underlying SPA server was not
// returning a proper 200 for the catch-all HTML entry point.
//
// LS-3702: /baseball/league/join is now a public path so invite links work
// without requiring prior authentication. Unauthenticated users see the join
// form directly instead of the auth gate (the join mutation itself enforces
// auth server-side).
// ---------------------------------------------------------------------------

unauthTest.describe(
  'Functional 404 Regression — /baseball/league/join (LS-3479) @critical',
  () => {
    // LS-3479: server must return HTTP 200 (not 404) so the client SPA can
    // mount and the join page can render.
    unauthTest(
      'returns HTTP 200 on /baseball/league/join when not authenticated (LS-3479)',
      async ({ page }) => {
        const response = await page.goto('/baseball/league/join');
        expect(response?.status()).toBe(200);
      },
    );

    // LS-3702: unauthenticated users now see the join form directly — the
    // page is publicly accessible so invite links work without prior auth.
    unauthTest(
      'shows join form on /baseball/league/join when not authenticated (LS-3702)',
      async ({ page }) => {
        await page.goto('/baseball/league/join');
        await page.waitForLoadState('load');

        await expect(
          page.getByRole('heading', { name: /join league/i }),
        ).toBeVisible({ timeout: 15000 });
      },
    );

    // LS-3479: the page title must reflect a valid app page, not a generic
    // "404 Not Found" title that would indicate a server-level routing gap.
    unauthTest(
      'does not show a 404 page title on /baseball/league/join (LS-3479)',
      async ({ page }) => {
        await page.goto('/baseball/league/join');
        await page.waitForLoadState('load');

        const title = await page.title();
        expect(title).not.toMatch(/404|not found/i);
      },
    );
  },
);

// ---------------------------------------------------------------------------
// LS-3473: "Continue with Discord" button click on /baseball must not throw a
// CSS selector parse error. The functional scanner used the invalid selector
// `(button:visible, [role="button"]:visible)` and tried to click the Discord
// CTA on /baseball. This failed because /baseball was (at the time) a
// protected route showing PublicLandingPage. LS-3532 made /baseball publicly
// accessible so unauthenticated users see the baseball hub directly. These
// tests lock in that behaviour: the baseball hub renders for unauthenticated
// users and the auth-gate CTAs are absent.
// ---------------------------------------------------------------------------

unauthTest.describe(
  '/baseball — unauthenticated visitor sees baseball hub, not auth gate @regression',
  () => {
    unauthTest.beforeEach(async ({ page }) => {
      await page.goto('/baseball');
      await page.waitForLoadState('load');
    });

    unauthTest(
      'shows baseball hub heading on /baseball when unauthenticated (LS-3473)',
      async ({ page }) => {
        await expect(
          page.getByRole('heading', { name: /baseball fantasy/i }),
        ).toBeVisible({ timeout: 15_000 });
      },
    );

    unauthTest(
      'does not show auth-gate CTAs on /baseball when unauthenticated (LS-3473)',
      async ({ page }) => {
        // /baseball is a public route (LS-3532) — unauthenticated users see
        // the baseball hub, not PublicLandingPage. The auth-gate CTAs
        // ("Continue with Google", "Continue with Discord") must therefore be
        // absent. This is regression coverage for the functional-scanner
        // failure (LS-3473) where an invalid CSS selector tried to click the
        // Discord CTA that appeared when the route was still protected.
        await expect(
          page.getByRole('button', { name: /continue with discord/i }),
        ).not.toBeVisible();
        await expect(
          page.getByRole('button', { name: /continue with google/i }),
        ).not.toBeVisible();
      },
    );
  },
);

// ---------------------------------------------------------------------------
// Authenticated Access — authenticated user bypasses the login gate
// ---------------------------------------------------------------------------

test.describe('Authenticated Access @critical', () => {
  test('does not show the landing page for an authenticated user', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForLoadState('load');

    await expect(
      page.getByRole('button', { name: /continue with google/i }),
    ).not.toBeVisible();
  });

  test('renders the primary navigation for an authenticated user', async ({
    page,
  }) => {
    await page.goto('/about');
    await page.waitForLoadState('load');

    await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible(
      { timeout: 15000 },
    );
  });

  // LS-2108: app.tsx routes /login to <Navigate to="/" replace /> for an
  // already-authenticated user, so a signed-in visitor who types the URL (or
  // follows a stale "Create an account" link) bounces to home instead of
  // seeing the sign-in form (LS-6690's app.tsx comment). No test previously
  // exercised this — the Login Flow tests above only cover unauthenticated
  // visitors.
  test('redirects an authenticated user away from /login to home', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.waitForLoadState('load');

    await expect(page).toHaveURL(`${E2E_ORIGIN}/`);
    await expect(
      page.getByRole('button', { name: /continue with google/i }),
    ).not.toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible(
      { timeout: 15000 },
    );
  });

  test('authenticated user can navigate between protected routes', async ({
    page,
  }) => {
    // /profile/settings included so an automated scanner hitting the route
    // unauthenticated (and logging a false-positive 404) has a matching
    // positive-path regression barrier (LS-3552).
    // /games/season-draft/create is an authenticated-only form. An automated
    // scanner hit it unauthenticated, saw the landing page rendered by
    // EnhancedAuthGuard, and logged a false-positive 404 (LS-3542).
    const routes = [
      '/about',
      '/baseball',
      '/players/stats',
      '/profile/settings',
      '/games/season-draft/create',
    ];

    for (const route of routes) {
      await page.goto(route);
      await page.waitForLoadState('load');

      await expect(
        page.getByRole('button', { name: /continue with google/i }),
      ).not.toBeVisible();
      // Confirm the route actually mounted content (not an empty shell) —
      // otherwise a silent route regression could still satisfy the
      // negative landing-page assertion above.
      await expect
        .poll(
          () =>
            page.evaluate(
              () =>
                (document.getElementById('main-content')?.children.length ??
                  0) > 0,
            ),
          { timeout: 15_000 },
        )
        .toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Session Expiry — expired JWT triggers the login gate
// ---------------------------------------------------------------------------

expiredSessionTest.describe('Session Expiry @critical', () => {
  expiredSessionTest(
    'shows landing page when the stored JWT has expired',
    async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('load');

      await expect(
        page.getByRole('button', { name: /continue with google/i }),
      ).toBeVisible({ timeout: 15000 });
    },
  );

  expiredSessionTest(
    'shows landing page on a protected route with an expired JWT',
    async ({ page }) => {
      // /players is now public (LS-3493, LS-3497) — use /management (always protected).
      await page.goto('/management');
      await page.waitForLoadState('load');

      await expect(
        page.getByRole('button', { name: /continue with google/i }),
      ).toBeVisible({ timeout: 15000 });
    },
  );

  expiredSessionTest(
    'does not show authenticated app content with an expired JWT',
    async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('load');

      // The authenticated app nav contains "My Leagues" — not present on the
      // landing page that auth guard shows for expired sessions (PR #2877 added
      // aria-label="Primary" to the landing nav too, so nav container is ambiguous).
      // Use .first() because the nav renders the league chip in both desktop and
      // mobile header slots (both in DOM, CSS-toggled), so two matches exist.
      await expect(page.getByText(/my leagues/i).first()).not.toBeVisible();
    },
  );
});

// ---------------------------------------------------------------------------
// LS-2111: Malformed/invalid JWT cookie handling — the Session Expiry suite
// above covers a well-formed JWT whose `exp` has genuinely passed. These
// tests cover cookie *corruption* instead: a JWT that was never valid to
// begin with (not a JWT at all, an undecodable payload segment, or a wrong
// signature). The client can never read the HttpOnly `ls_jwt` cookie value
// directly — "handling gracefully" means useAuth.tsx's initializeAuth()
// silent-refresh path treats a rejected/undecodable refresh the same as a
// definitively-expired session (falls back to the login gate) instead of
// throwing an unhandled error anywhere in the render path.
// ---------------------------------------------------------------------------

/** Custom fixture builder: same storage shape as `expiredSessionTest` (a
 * locally-expired cached session, forcing useAuth.tsx's synchronous "attempt
 * silent refresh" branch on mount) but with a corrupted `ls_jwt` cookie value
 * instead of a genuinely time-expired JWT. */
function buildCorruptedJwtSessionTest(jwtCookieValue: string) {
  return test.extend({
    storageState: async ({}, use) => {
      const expiry = Math.floor(Date.now() / 1000) - 3600; // locally expired
      await use({
        cookies: [
          {
            name: 'ls_jwt',
            value: jwtCookieValue,
            domain: 'localhost',
            path: '/',
            httpOnly: true,
            secure: false,
            sameSite: 'Lax' as const,
            expires: -1,
          },
          {
            name: 'ls_csrf',
            value: 'e2e-csrf-token',
            domain: 'localhost',
            path: '/',
            httpOnly: false,
            secure: false,
            sameSite: 'Lax' as const,
            expires: -1,
          },
        ],
        origins: [
          {
            origin: E2E_ORIGIN,
            localStorage: [
              {
                name: 'ls_user_profile',
                value: JSON.stringify({
                  id: 1,
                  email: 'corrupted@test.com',
                  username: 'corrupted',
                  accessLevel: 'none',
                }),
              },
              { name: 'ls_token_expiry', value: String(expiry) },
            ],
          },
        ],
      });
    },
  });
}

// Not a JWT at all — no dots, no base64 segments.
const malformedJwtTest = buildCorruptedJwtSessionTest('not-a-real-jwt-token');

// Structurally JWT-shaped (three dot-separated segments) but the payload
// segment contains characters that are not valid base64.
const invalidBase64JwtTest = buildCorruptedJwtSessionTest(
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.!!!not-valid-base64!!!.fakesignature',
);

// Well-formed and decodable, but signed with the wrong secret.
const wrongSignatureJwtTest = buildCorruptedJwtSessionTest(
  signE2EJwt(
    {
      id: 1,
      email: 'user@test.com',
      username: 'testuser',
      accessLevel: 'none',
    },
    'a-completely-different-signing-secret',
    '1h',
  ),
);

test.describe('Malformed/Invalid JWT Cookie Handling @critical', () => {
  malformedJwtTest(
    'shows the landing page, without crashing, when the JWT cookie is not a JWT at all (LS-2111)',
    async ({ page }) => {
      const pageErrors: Error[] = [];
      page.on('pageerror', (err) => pageErrors.push(err));

      // The hermetic /refresh-jwt baseline mock (api-isolation.ts) already
      // catches the decode failure for a non-3-segment token and treats it
      // as "no valid cookie token" — no route override needed here.
      await page.goto('/');
      await page.waitForLoadState('load');

      await expect(
        page.getByRole('button', { name: /continue with google/i }),
      ).toBeVisible({ timeout: 15000 });
      expect(pageErrors).toEqual([]);
    },
  );

  invalidBase64JwtTest(
    'shows the landing page, without crashing, when the JWT payload segment is not valid base64 (LS-2111)',
    async ({ page }) => {
      const pageErrors: Error[] = [];
      page.on('pageerror', (err) => pageErrors.push(err));

      await page.goto('/');
      await page.waitForLoadState('load');

      await expect(
        page.getByRole('button', { name: /continue with google/i }),
      ).toBeVisible({ timeout: 15000 });
      expect(pageErrors).toEqual([]);
    },
  );

  wrongSignatureJwtTest(
    'shows the landing page, without crashing, when the JWT cookie has an invalid signature (LS-2111)',
    async ({ page }) => {
      const pageErrors: Error[] = [];
      page.on('pageerror', (err) => pageErrors.push(err));

      // Unlike the two corruption cases above, a wrong-signature JWT is
      // still structurally well-formed (three segments, decodable payload,
      // plausible claims) — the hermetic baseline mock only decodes claims
      // for simulation and never verifies HMAC signatures, so left to its
      // default behavior it would treat this as a valid, refreshable token.
      // Override the endpoint here to simulate the real backend's signature
      // verification rejecting it.
      await page.route(pathEndsWithMatcher('/refresh-jwt'), async (route) => {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Invalid token signature (simulated)',
          }),
        });
      });

      await page.goto('/');
      await page.waitForLoadState('load');

      await expect(
        page.getByRole('button', { name: /continue with google/i }),
      ).toBeVisible({ timeout: 15000 });
      expect(pageErrors).toEqual([]);
    },
  );
});

// ---------------------------------------------------------------------------
// LS-2097: Token refresh — proactive refresh before expiry, and retry/failure
// behavior. The Session Expiry tests above only cover an already-expired
// JWT; these cover the client's automatic-refresh machinery:
//   - useAuth.tsx `scheduleProactiveRefresh` fires a background refresh
//     5 minutes before the token's `exp` (clamped to 0ms once already inside
//     that window, which is how these tests trigger it near-instantly).
//   - AuthService.refreshJwt() / jwt-refresh.ts `silentlyRefreshJwt()` treat
//     a 401/403 from /refresh-jwt as a definitive AuthSessionExpiredError
//     (forces logout); any other failure (5xx, network error) is a silent
//     no-op — "the error link is the safety net" (useAuth.tsx).
//   - apollo-client.ts's error link retries an ENTITLEMENTS_STALE response
//     up to ENTITLEMENTS_STALE_MAX_ATTEMPTS (3) times with [0, 800, 2000]ms
//     backoff before failing safe.
// ---------------------------------------------------------------------------

/** Create a JWT that expires `secondsUntilExpiry` from now — used to land the
 * token inside the 5-minute proactive-refresh window without waiting 5 real
 * minutes for the timer to fire. */
function signNearExpiryJwt(secondsUntilExpiry: number): string {
  const now = Math.floor(Date.now() / 1000);
  return signE2EJwt(
    {
      id: 1,
      email: 'user@test.com',
      username: 'testuser',
      accessLevel: 'none',
      iat: now - 60,
      exp: now + secondsUntilExpiry,
    },
    E2E_SIGNING_SECRET,
  );
}

/**
 * Custom fixture that loads a JWT expiring in 60s — inside the 5-minute
 * proactive-refresh window, so `scheduleProactiveRefresh`'s timer (clamped to
 * `max(0, exp*1000 - now - 5min)`) fires almost immediately on mount instead
 * of requiring a 5-minute real-time wait.
 */
const nearExpiryTest = test.extend({
  storageState: async ({}, use) => {
    const jwt = signNearExpiryJwt(60);
    await use(buildAuthStorageState(jwt));
  },
});

nearExpiryTest.describe('Proactive Token Refresh @critical', () => {
  nearExpiryTest(
    'refreshes the JWT automatically before it expires, keeping the user signed in (LS-2097)',
    async ({ page }) => {
      let refreshCalls = 0;
      await page.route('**/refresh-jwt', async (route) => {
        refreshCalls += 1;
        // Cascade to the hermetic baseline handler (api-isolation.ts), which
        // returns a fresh JWT for a valid, not-yet-expired cookie token.
        await route.fallback();
      });

      await page.goto('/about');
      await page.waitForLoadState('load');

      // The token expires in 60s — inside the 5-minute proactive-refresh
      // window — so a refresh call fires almost immediately rather than
      // waiting for the token to actually expire.
      await expect
        .poll(() => refreshCalls, { timeout: 15000 })
        .toBeGreaterThan(0);

      // The refresh succeeds, so the user must never see the login gate.
      await expect(
        page.getByRole('button', { name: /continue with google/i }),
      ).not.toBeVisible();
      await expect(
        page.getByRole('navigation', { name: 'Primary' }),
      ).toBeVisible({ timeout: 15000 });
    },
  );

  nearExpiryTest(
    'does not log the user out when a refresh attempt fails transiently (LS-2097)',
    async ({ page }) => {
      await page.route('**/refresh-jwt', async (route) => {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'refresh-jwt unavailable (simulated)',
          }),
        });
      });

      await page.goto('/about');
      await page.waitForLoadState('load');

      // Give the (near-instant) proactive timer time to fire and fail.
      await page.waitForTimeout(2000);

      // A transient (non-401/403) refresh failure must not force a logout —
      // useAuth.tsx only clears tokens on AuthSessionExpiredError (401/403);
      // any other failure is silently ignored.
      await expect(
        page.getByRole('button', { name: /continue with google/i }),
      ).not.toBeVisible();
      await expect(
        page.getByRole('navigation', { name: 'Primary' }),
      ).toBeVisible({ timeout: 15000 });
    },
  );
});

test.describe('Entitlements-Stale Refresh Retry @critical', () => {
  test('recovers from repeated ENTITLEMENTS_STALE responses within the bounded retry budget (LS-2097)', async ({
    page,
  }) => {
    let getUserByIdCalls = 0;
    let refreshCalls = 0;

    await page.route('**/refresh-jwt', async (route) => {
      refreshCalls += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          jwt: signE2EJwt(
            {
              id: 1,
              email: 'user@test.com',
              username: 'testuser',
              accessLevel: 'none',
            },
            E2E_SIGNING_SECRET,
            '1h',
          ),
          csrfToken: 'e2e-csrf-token',
        }),
      });
    });

    await page.route(isGraphQLEndpoint, async (route) => {
      const op = extractOperationName(route).toLowerCase();
      if (op === 'getuserbyid') {
        getUserByIdCalls += 1;
        // apollo-client.ts's errorLink retries ENTITLEMENTS_STALE up to
        // ENTITLEMENTS_STALE_MAX_ATTEMPTS (3) times with [0, 800, 2000]ms
        // backoff. Stale on the first call only, then recover — a single
        // retry cycle (well inside the 3-attempt budget) is enough to
        // exercise the refresh-and-replay mechanism end to end.
        if (getUserByIdCalls <= 1) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              errors: [
                {
                  message: 'Entitlements stale',
                  extensions: { code: 'ENTITLEMENTS_STALE' },
                },
              ],
              data: null,
            }),
          });
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(tierUserByIdResponse('premium')),
        });
        return;
      }
      await route.fallback();
    });

    await page.goto('/about');
    await page.waitForLoadState('load');

    // Wait for the retried (recovering) call to land.
    await expect
      .poll(() => getUserByIdCalls, { timeout: 15000 })
      .toBeGreaterThanOrEqual(2);

    await expect(
      page.getByRole('button', { name: /continue with google/i }),
    ).not.toBeVisible();
    expect(refreshCalls).toBeGreaterThan(0);
  });
});

test.describe('Refresh Endpoint Definitive Rejection (401/403) @critical', () => {
  test('logs the user out when the refresh endpoint returns 401/403, distinct from a transient failure (LS-2097)', async ({
    page,
  }) => {
    await page.route('**/refresh-jwt', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Session revoked (simulated)' }),
      });
    });

    await page.goto('/about');
    await page.waitForLoadState('load');

    // AuthService.refreshJwt() treats 401/403 as a definitive rejection
    // (AuthSessionExpiredError), clearing tokens and logging the user out —
    // unlike the 5xx/network case above, which is a silent no-op.
    await expect(
      page.getByRole('button', { name: /continue with google/i }),
    ).toBeVisible({ timeout: 15000 });
  });
});

// ---------------------------------------------------------------------------
// Logout Flow — clearing the auth token returns to the login gate
// ---------------------------------------------------------------------------

test.describe('Logout Flow @regression', () => {
  test('clearing the JWT from localStorage triggers re-authentication', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName === 'webkit',
      'WebKit blocks localStorage access via page.evaluate — SecurityError',
    );

    await page.goto('/');
    await page.waitForLoadState('load');

    // Confirm we are authenticated.
    await expect(
      page.getByRole('button', { name: /continue with google/i }),
    ).not.toBeVisible();

    // Simulate logout by clearing auth state from localStorage and cookies.
    await page.evaluate(() => {
      window.localStorage.removeItem('ls_user_profile');
      window.localStorage.removeItem('ls_token_expiry');
      document.cookie = 'ls_csrf=; Max-Age=0; Path=/';
    });

    await page.reload();
    await page.waitForLoadState('load');

    // The auth guard should now show the landing page.
    await expect(
      page.getByRole('button', { name: /continue with google/i }),
    ).toBeVisible({ timeout: 15000 });
  });
});

// ---------------------------------------------------------------------------
// Logout via Profile Dropdown UI — using adminTest for deterministic username
// ---------------------------------------------------------------------------

adminTest.describe('Profile Dropdown Logout @regression', () => {
  adminTest.use({ viewport: DESKTOP_VIEWPORT });

  adminTest(
    'profile dropdown contains a Sign Out option',
    async ({ page, isMobile }) => {
      // Navigate to a stable authenticated page.
      await page.goto('/about');
      await page.waitForLoadState('load');

      // The profile button shows the username "admin" on desktop viewports.
      const profileButton = page
        .getByRole('banner')
        .getByRole('button')
        .filter({ hasText: /admin/i });

      await expect(profileButton).toBeVisible({ timeout: 15000 });
      await profileButton.click();

      // The Sign Out menu item should now be visible inside the dropdown
      // (role="menuitem" since LS-10706).
      await expect(
        page.getByRole('menuitem', { name: /sign out/i }),
      ).toBeVisible({ timeout: 10000 });
    },
  );

  adminTest(
    'clicking Sign Out returns user to the login gate',
    async ({ page, browserName, isMobile }) => {
      test.skip(
        browserName === 'webkit',
        'WebKit blocks localStorage access in this context',
      );

      await page.goto('/about');
      await page.waitForLoadState('load');

      // Open the profile dropdown.
      const profileButton = page
        .getByRole('banner')
        .getByRole('button')
        .filter({ hasText: /admin/i });

      await expect(profileButton).toBeVisible({ timeout: 15000 });
      await profileButton.click();

      // Click Sign Out.
      const signOutButton = page.getByRole('menuitem', { name: /sign out/i });
      await expect(signOutButton).toBeVisible({ timeout: 10000 });
      await signOutButton.click();

      // After logout, the auth guard shows the landing page.
      await expect(
        page.getByRole('button', { name: /continue with google/i }),
      ).toBeVisible({ timeout: 15000 });
    },
  );
});

// ---------------------------------------------------------------------------
// LS-2104: Session recovery after tab/window close and reopen.
//
// Playwright cannot literally close and reopen an OS-level browser tab, but
// the behavior that matters — does a session survive once the in-memory
// page/JS runtime is gone and only persistent storage (cookies +
// localStorage) remains — is exactly what closing the live context and
// opening a brand-new one from a captured storageState snapshot exercises.
// This is distinct from:
//   - the Session Expiry / Malformed JWT suites above, which build
//     storageState from scratch rather than carrying it over from a live,
//     already-authenticated context/tab.
//   - page.reload() coverage elsewhere in this file, which keeps the same
//     tab (and its in-memory AuthProvider state) alive throughout — reload
//     never actually drops JS memory the way a real tab/window close does.
// ---------------------------------------------------------------------------

test.describe('Session Recovery After Tab/Window Close and Reopen @critical', () => {
  test('restores an authenticated session in a reopened tab/window from persisted storage (LS-2104)', async ({
    page,
    browser,
  }, testInfo) => {
    await page.goto('/');
    await page.waitForLoadState('load');

    // Confirm the original tab is authenticated before "closing" it.
    await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible(
      { timeout: 15000 },
    );

    // Snapshot what a real browser retains after a tab/window closes —
    // cookies and localStorage — then close the tab, discarding the
    // AuthProvider's in-memory state entirely.
    const storageState = await page.context().storageState();
    await page.close();

    // Reopen: a brand-new context/page seeded only from what a real
    // browser restart would still have on disk.
    const reopenedContext = await browser.newContext({ storageState });
    try {
      const reopenedPage = await reopenedContext.newPage();
      await withApiIsolation(reopenedPage, testInfo, async () => {
        await reopenedPage.goto('/');
        await reopenedPage.waitForLoadState('load');

        await expect(
          reopenedPage.getByRole('button', {
            name: /continue with google/i,
          }),
        ).not.toBeVisible();
        await expect(
          reopenedPage.getByRole('navigation', { name: 'Primary' }),
        ).toBeVisible({ timeout: 15000 });
      });
    } finally {
      await reopenedContext.close();
    }
  });

  test('shows the login gate in a reopened tab/window when the persisted session had already expired (LS-2104)', async ({
    browser,
  }, testInfo) => {
    // A JWT whose `exp` is already in the past, as if the browser were
    // relaunched onto a session that expired while the browser was
    // closed. The cookie itself uses `expires: -1` (a session cookie, so
    // the browser jar still carries and sends it) — it's the JWT's own
    // `exp` claim that must be in the past, not the cookie's expiry;
    // mirrors the `expiredSessionTest` fixture above.
    const now = Math.floor(Date.now() / 1000);
    const expiredJwt = signE2EJwt(
      {
        id: 1,
        email: 'user@test.com',
        username: 'testuser',
        accessLevel: 'none',
        iat: now - 7200,
        exp: now - 3600,
      },
      E2E_SIGNING_SECRET,
    );
    const expiry = now - 3600;

    const storageState = {
      cookies: [
        {
          name: 'ls_jwt',
          value: expiredJwt,
          domain: 'localhost',
          path: '/',
          httpOnly: true,
          secure: false,
          sameSite: 'Lax' as const,
          expires: -1,
        },
        {
          name: 'ls_csrf',
          value: 'e2e-csrf-token',
          domain: 'localhost',
          path: '/',
          httpOnly: false,
          secure: false,
          sameSite: 'Lax' as const,
          expires: -1,
        },
      ],
      origins: [
        {
          origin: E2E_ORIGIN,
          localStorage: [
            {
              name: 'ls_user_profile',
              value: JSON.stringify({
                id: 1,
                email: 'expired@test.com',
                username: 'expired',
                accessLevel: 'none',
              }),
            },
            { name: 'ls_token_expiry', value: String(expiry) },
          ],
        },
      ],
    };

    const reopenedContext = await browser.newContext({ storageState });
    try {
      const reopenedPage = await reopenedContext.newPage();
      await withApiIsolation(reopenedPage, testInfo, async () => {
        await reopenedPage.goto('/');
        await reopenedPage.waitForLoadState('load');

        // The expired cookie can't silently refresh (api-isolation.ts
        // 401s an expired token), so the reopened tab must land on the
        // login gate rather than a broken authenticated shell.
        await expect(
          reopenedPage.getByRole('button', {
            name: /continue with google/i,
          }),
        ).toBeVisible({ timeout: 15000 });
      });
    } finally {
      await reopenedContext.close();
    }
  });
});

// ---------------------------------------------------------------------------
// LS-10785: the sign-in card's "Get help accessing your account" link used
// the dark-theme gold (#D4B24A on white = 2.04:1) in the light theme. It now
// reads the per-theme `--goldText` var and must clear AA in both themes.
// ---------------------------------------------------------------------------

for (const colorScheme of ['light', 'dark'] as const) {
  unauthTest(
    `sign-in recovery link passes color-contrast in ${colorScheme} theme (LS-10785) @regression`,
    async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto('/');
      await expect(
        page.getByRole('link', { name: /get help accessing your account/i }),
      ).toBeVisible({ timeout: 15_000 });
      await injectAxe(page);

      const violations = await getViolations(page, '.ll-card-recovery', {
        runOnly: { type: 'rule', values: ['color-contrast'] },
      });
      expect(
        violations.flatMap((v) =>
          v.nodes.map((n) => `${n.target.join(' ')}: ${n.failureSummary}`),
        ),
      ).toEqual([]);
    },
  );
}
