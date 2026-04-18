/**
 * Authentication Flow E2E Tests
 *
 * Covers: login page display, protected route enforcement, session expiry,
 * and logout — both programmatic and via the profile dropdown UI.
 */

import { adminTest, expect, test, unauthTest } from '../fixtures/auth-enhanced';
import { E2E_SIGNING_SECRET, signE2EJwt } from '../utils/jwt';

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

    await expect(page.getByText(/build your dynasty/i)).toBeVisible({
      timeout: 15000,
    });
  });

  unauthTest(
    'does not render the app navigation when unauthenticated',
    async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('load');

      // The main nav links should not be present — the auth guard replaces
      // the entire app with the landing page.
      await expect(
        page.getByRole('navigation', { name: 'Primary' }),
      ).not.toBeVisible();
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

unauthTest.describe(
  '/baseball/mock-draft — auth-gated CTA clickable via getByRole @regression',
  () => {
    unauthTest(
      '"Continue with Google" button on /baseball/mock-draft is clickable via getByRole (LS-3487)',
      async ({ page }) => {
        await page.goto('/baseball/mock-draft');
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
    '/baseball/mock-draft',
    // /players is publicly accessible (LS-3493) — see Public Routes section below.
    '/management',
    '/profile/settings',
    '/preferences',
    // /help is publicly accessible (LS-3513) — see Public Routes section below.
    // /games/season-draft/create is authenticated-only (LS-3543). An automated
    // scanner attempted to click the landing-page CTA with the invalid
    // `(button:visible, [role="button"]:visible)` selector and logged a false
    // positive. Covered here via the correct getByRole locator.
    '/games/season-draft/create',
    // /baseball/league/join is authenticated-only (LS-3536, LS-3537). Same
    // scanner false positive — unauthenticated users see PublicLandingPage
    // with the "Continue with Google" / "Continue with Discord" CTAs, which
    // the scanner's invalid selector failed to match and mis-reported.
    '/baseball/league/join',
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
    async ({ page }) => {
      await page.goto('/players/stats');
      await page.waitForLoadState('load');

      await expect(
        page.getByText(/MLB Player Statistics/i).first(),
      ).toBeVisible({ timeout: 15000 });
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
    async ({ page }) => {
      await page.goto('/players/stats');
      await page.waitForLoadState('load');

      // The "Fantasy Baseball · Season 2026" badge lives on PublicLandingPage.
      // Since /players/stats is public, the landing page must NOT render here.
      await expect(page.locator('body')).not.toContainText(
        'Fantasy Baseball · Season 2026',
      );

      // Player stats content is visible — confirming the correct page loaded.
      await expect(
        page.getByText(/MLB Player Statistics/i).first(),
      ).toBeVisible({ timeout: 15000 });
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
// Expected: unauthenticated navigation to /baseball/league/join returns HTTP
// 200 and renders the auth gate (landing page with "Continue with Google").
// ---------------------------------------------------------------------------

unauthTest.describe(
  'Functional 404 Regression — /baseball/league/join (LS-3479) @critical',
  () => {
    // LS-3479: server must return HTTP 200 (not 404) so the client SPA can
    // mount and the EnhancedAuthGuard can render the auth gate.
    unauthTest(
      'returns HTTP 200 on /baseball/league/join when not authenticated (LS-3479)',
      async ({ page }) => {
        const response = await page.goto('/baseball/league/join');
        expect(response?.status()).toBe(200);
      },
    );

    // LS-3479: unauthenticated users must see the auth gate — the landing
    // page with "Continue with Google" — not a raw 404 error page.
    unauthTest(
      'shows auth gate on /baseball/league/join when not authenticated (LS-3479)',
      async ({ page }) => {
        await page.goto('/baseball/league/join');
        await page.waitForLoadState('load');

        await expect(
          page.getByRole('button', { name: /continue with google/i }),
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
      // /players is now public (LS-3493); use /management which remains protected.
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

      // The primary nav should not be present — auth guard shows landing page.
      await expect(
        page.getByRole('navigation', { name: 'Primary' }),
      ).not.toBeVisible();
    },
  );
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
  adminTest('profile dropdown contains a Sign Out option', async ({ page }) => {
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

    // The Sign Out menu item should now be visible inside the dropdown.
    await expect(page.getByRole('button', { name: /sign out/i })).toBeVisible({
      timeout: 10000,
    });
  });

  adminTest(
    'clicking Sign Out returns user to the login gate',
    async ({ page, browserName }) => {
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
      const signOutButton = page.getByRole('button', { name: /sign out/i });
      await expect(signOutButton).toBeVisible({ timeout: 10000 });
      await signOutButton.click();

      // After logout, the auth guard shows the landing page.
      await expect(
        page.getByRole('button', { name: /continue with google/i }),
      ).toBeVisible({ timeout: 15000 });
    },
  );
});
