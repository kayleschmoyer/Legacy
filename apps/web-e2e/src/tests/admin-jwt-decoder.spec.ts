/**
 * Admin JWT Decoder E2E Tests (LS-7781)
 *
 * Covers the JWT Decoder section on /admin:
 *  - Claim rendering: header and payload field content, algorithm badge (AC1)
 *  - Expiry calculation banner: valid, expired, no-exp states (AC2)
 *  - Error handling for malformed, non-3-part, and non-UTF8 tokens (AC3–AC5)
 *  - No-network-egress invariant: decode is fully client-side (AC6)
 *
 * All GraphQL queries are mocked with route.fulfill(). No route.continue() is used.
 */

import { adminTest, expect } from '../fixtures/auth-enhanced';
import {
  extractOperationName,
  unmockedGraphQLFallback,
  useTier,
} from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';
import { E2E_SIGNING_SECRET, signE2EJwt } from '../utils/jwt';

// ---------------------------------------------------------------------------
// GraphQL mock — covers the two queries AdminPage fires on load
// ---------------------------------------------------------------------------

async function mockAdminPage(
  page: import('@playwright/test').Page,
): Promise<void> {
  await page.route(isGraphQLEndpoint, async (route) => {
    const op = extractOperationName(route).toLowerCase();
    if (op === 'getuserscount') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { usersCount: 0 } }),
      });
    } else if (op === 'admingetusers' || op === 'getallusers') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { users: [] } }),
      });
    } else {
      await unmockedGraphQLFallback(route);
    }
  });
  // Flip current user to admin via the shared entitlement fixture (LS-8058).
  // Registered after the admin route so its GetUserById handler takes
  // precedence (Playwright LIFO); other operations cascade back above.
  await useTier(page, 'admin');
}

// ---------------------------------------------------------------------------
// Helper: expand the JWT Decoder accordion and fill the textarea
// ---------------------------------------------------------------------------

async function openJwtDecoder(
  page: import('@playwright/test').Page,
  token: string,
): Promise<void> {
  await page.getByText('JWT Decoder').click();
  await page.getByPlaceholder(/paste jwt here/i).fill(token);
}

// ---------------------------------------------------------------------------
// Test tokens (generated once per module load — stable within a run)
// ---------------------------------------------------------------------------

// header: {"alg":"HS256","typ":"JWT"}, payload has sub, email, future exp
const VALID_TOKEN_WITH_EXP = signE2EJwt(
  { sub: '1234567890', email: 'alice@example.com' },
  E2E_SIGNING_SECRET,
  '1h',
);

// Same claims but exp is 1 hour in the past
const EXPIRED_TOKEN = signE2EJwt(
  {
    sub: '1234567890',
    email: 'alice@example.com',
    exp: Math.floor(Date.now() / 1000) - 3600,
  },
  E2E_SIGNING_SECRET,
);

// No exp claim at all
const NO_EXP_TOKEN = signE2EJwt(
  { sub: '1234567890', email: 'alice@example.com' },
  E2E_SIGNING_SECRET,
  // intentionally no expiresIn
);

// Valid 3-part structure; payload "aGVsbG8" decodes to "hello" which is not
// valid JSON, so JSON.parse throws — exercises the malformed-token path (AC3).
const MALFORMED_JSON_TOKEN =
  'eyJhbGciOiJIUzI1NiJ9.aGVsbG8.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

// Valid 3-part structure; payload "_w" is base64url for the single byte 0xFF
// which is not valid UTF-8, so decodeURIComponent("%ff") throws URIError —
// exercises the non-UTF8 path (AC5).
const NON_UTF8_TOKEN = 'eyJhbGciOiJIUzI1NiJ9._w.dummy';

// ---------------------------------------------------------------------------
// AC1: Claim rendering — header / payload fields
// ---------------------------------------------------------------------------

adminTest.describe(
  'Admin JWT Decoder — claim rendering (AC1) @regression',
  () => {
    adminTest.beforeEach(async ({ page }) => {
      await mockAdminPage(page);
      await page.goto('/admin');
      await page.waitForLoadState('load');
      await openJwtDecoder(page, VALID_TOKEN_WITH_EXP);
      await page.getByRole('button', { name: /^decode$/i }).click();
    });

    adminTest('shows "Header" block label', async ({ page }) => {
      await expect(page.getByText('Header', { exact: true })).toBeVisible();
    });

    adminTest('shows "Payload" block label', async ({ page }) => {
      await expect(page.getByText('Payload', { exact: true })).toBeVisible();
    });

    adminTest(
      'shows "HS256" algorithm badge in the Header block',
      async ({ page }) => {
        await expect(page.getByText('HS256', { exact: true })).toBeVisible();
      },
    );

    adminTest('shows "email" field from payload', async ({ page }) => {
      await expect(page.getByText(/alice@example\.com/)).toBeVisible();
    });

    adminTest('shows "sub" field from payload', async ({ page }) => {
      await expect(page.getByText(/1234567890/)).toBeVisible();
    });

    adminTest(
      'clears the input textarea after successful decode',
      async ({ page }) => {
        await expect(page.getByPlaceholder(/paste jwt here/i)).toHaveValue('');
      },
    );
  },
);

// ---------------------------------------------------------------------------
// AC2: Expiry calculation banner
// ---------------------------------------------------------------------------

adminTest.describe(
  'Admin JWT Decoder — expiry banner (AC2) @regression',
  () => {
    adminTest.beforeEach(async ({ page }) => {
      await mockAdminPage(page);
      await page.goto('/admin');
      await page.waitForLoadState('load');
    });

    adminTest(
      'shows "Token valid" for a token with a future exp',
      async ({ page }) => {
        await openJwtDecoder(page, VALID_TOKEN_WITH_EXP);
        await page.getByRole('button', { name: /^decode$/i }).click();
        await expect(page.getByText('Token valid')).toBeVisible();
      },
    );

    adminTest(
      'shows "Token expired" for a token with a past exp',
      async ({ page }) => {
        await openJwtDecoder(page, EXPIRED_TOKEN);
        await page.getByRole('button', { name: /^decode$/i }).click();
        await expect(page.getByText('Token expired')).toBeVisible();
      },
    );

    adminTest(
      'shows "No expiry" for a token with no exp claim',
      async ({ page }) => {
        await openJwtDecoder(page, NO_EXP_TOKEN);
        await page.getByRole('button', { name: /^decode$/i }).click();
        await expect(page.getByText('No expiry')).toBeVisible();
      },
    );
  },
);

// ---------------------------------------------------------------------------
// AC3–AC5: Error handling — page must not crash; error is surfaced in the UI
// ---------------------------------------------------------------------------

adminTest.describe(
  'Admin JWT Decoder — error handling (AC3–AC5) @regression',
  () => {
    adminTest.beforeEach(async ({ page }) => {
      await mockAdminPage(page);
      await page.goto('/admin');
      await page.waitForLoadState('load');
    });

    // AC4: non-3-part tokens (too many or too few segments)
    adminTest(
      'shows error for a single-segment token (AC4)',
      async ({ page }) => {
        await openJwtDecoder(page, 'notajwttoken');
        await page.getByRole('button', { name: /^decode$/i }).click();

        await expect(page.getByText(/Invalid JWT/i)).toBeVisible();
        await expect(
          page.getByText('Header', { exact: true }),
        ).not.toBeVisible();
      },
    );

    adminTest(
      'shows error for a token with too many segments (AC4)',
      async ({ page }) => {
        await openJwtDecoder(page, 'a.b.c.d.e');
        await page.getByRole('button', { name: /^decode$/i }).click();

        await expect(page.getByText(/Invalid JWT/i)).toBeVisible();
        await expect(
          page.getByText('Payload', { exact: true }),
        ).not.toBeVisible();
      },
    );

    // AC3: malformed payload — valid 3-part token but payload is not valid JSON
    adminTest(
      'does not crash on a token whose payload is not valid JSON (AC3)',
      async ({ page }) => {
        await openJwtDecoder(page, MALFORMED_JSON_TOKEN);
        await page.getByRole('button', { name: /^decode$/i }).click();

        // Error is surfaced; header/payload blocks must not render
        await expect(
          page.getByText('Header', { exact: true }),
        ).not.toBeVisible();
        await expect(
          page.getByText('Payload', { exact: true }),
        ).not.toBeVisible();
        // Page still functional — no unhandled error boundary
        await expect(page.locator('body')).not.toContainText(
          'Unexpected Application Error',
        );
      },
    );

    // AC5: non-UTF8 payload bytes — decodeURIComponent throws URIError
    adminTest(
      'does not crash on a token with non-UTF8 payload bytes (AC5)',
      async ({ page }) => {
        await openJwtDecoder(page, NON_UTF8_TOKEN);
        await page.getByRole('button', { name: /^decode$/i }).click();

        // Error is surfaced; header/payload blocks must not render
        await expect(
          page.getByText('Header', { exact: true }),
        ).not.toBeVisible();
        await expect(
          page.getByText('Payload', { exact: true }),
        ).not.toBeVisible();
        // Page still functional — no unhandled error boundary
        await expect(page.locator('body')).not.toContainText(
          'Unexpected Application Error',
        );
      },
    );

    adminTest(
      'decode button remains functional after an error (AC3)',
      async ({ page }) => {
        // First decode: error
        await openJwtDecoder(page, 'bad.token');
        await page.getByRole('button', { name: /^decode$/i }).click();
        await expect(page.getByText(/Invalid JWT/i)).toBeVisible();

        // Second decode: valid — previous error is cleared; result is shown
        await page
          .getByPlaceholder(/paste jwt here/i)
          .fill(VALID_TOKEN_WITH_EXP);
        await page.getByRole('button', { name: /^decode$/i }).click();
        await expect(page.getByText('Header', { exact: true })).toBeVisible();
        await expect(page.getByText(/Invalid JWT/i)).not.toBeVisible();
      },
    );
  },
);

// ---------------------------------------------------------------------------
// AC6: No-network-egress invariant
// ---------------------------------------------------------------------------

adminTest.describe(
  'Admin JWT Decoder — no-network-egress invariant (AC6) @regression',
  () => {
    adminTest(
      'clicking Decode sends no requests outside the static server',
      async ({ page }) => {
        await mockAdminPage(page);
        await page.goto('/admin');
        // Wait for all page-load queries (GetUserById, GetAllUsers, etc.) to settle.
        await page.waitForLoadState('networkidle');

        // Open the accordion and fill the token BEFORE registering the request
        // listener — accordion expansion may trigger lazy fetches that are
        // unrelated to the decode action itself.
        await openJwtDecoder(page, VALID_TOKEN_WITH_EXP);
        await page.waitForLoadState('networkidle');

        const nonStaticUrls: string[] = [];
        const E2E_PORT = process.env.E2E_PORT ?? '4280';
        page.on('request', (req) => {
          const url = req.url();
          // Only record requests that leave the static E2E file server.
          const isStaticServer =
            url.includes(`localhost:${E2E_PORT}`) ||
            url.includes(`127.0.0.1:${E2E_PORT}`);
          if (!isStaticServer) {
            nonStaticUrls.push(url);
          }
        });

        await page.getByRole('button', { name: /^decode$/i }).click();
        // Wait a tick to allow any async fetch that may have been triggered.
        await page.waitForTimeout(300);

        expect(nonStaticUrls).toHaveLength(0);
      },
    );
  },
);
