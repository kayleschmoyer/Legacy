/**
 * Profile Settings Page — E2E Tests (LS-677)
 *
 * Covers the Profile Settings page at /profile/settings:
 *   - Page loads and displays heading
 *   - Profile section: username, email, access level, user id fields
 *   - Info banner includes text: "Email and profile photo are managed through your Google account"
 *   - App Avatar section present
 *   - Account & Security section: sign-in method, session status
 *   - Session/Danger zone: Sign Out button present
 *   - Accessibility: logo alt text, <main> landmark, <nav> landmark (LS-3507)
 *
 * All GraphQL queries are mocked (in-spec `page.route`) so these tests run
 * without a live backend; all element access goes through the injected
 * `settingsPage` object (ADR-0015).
 */

import { expect, test, unauthTest } from '../fixtures/pages';
import {
  isGraphQLEndpoint,
  unmockedGraphQLFallback,
} from '../mocks/graphql/router';

// ── Helpers ───────────────────────────────────────────────────────────────────

// ── Mock Data ─────────────────────────────────────────────────────────────────

const MOCK_USER_DATA = {
  __typename: 'Query',
  user: {
    __typename: 'User',
    id: 1,
    username: 'testuser',
    email: 'e2e-test@legacysports.dev',
    avatarUrl: null,
    accessLevel: 'none',
    subscriptionTier: null,
    themePreference: null,
  },
};

// ── GraphQL Mock Setup ────────────────────────────────────────────────────────

async function setupProfileGraphQL(page: import('@playwright/test').Page) {
  await page.route(
    (url) => isGraphQLEndpoint(url),
    async (route, request) => {
      const body = request.postDataJSON() as { operationName?: string };

      if (body.operationName === 'GetUserById') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: MOCK_USER_DATA }),
        });
        return;
      }

      if (body.operationName === 'UpdateUserAvatar') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              updateUserAvatar: {
                __typename: 'User',
                id: 1,
                avatarUrl: 'https://example.com/avatar.png',
              },
            },
          }),
        });
        return;
      }

      // Cascade unhandled operations (e.g. the ambient MyIdentities query the
      // ProfileSettingsPage fires on load) to the _apiIsolation baseline
      // fixture instead of swallowing them with empty data, which would crash
      // the page (LS-7960).
      await unmockedGraphQLFallback(route);
    },
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Profile Settings Page @smoke', () => {
  test('should load and display the Profile Settings heading', async ({
    page,
    settingsPage,
  }) => {
    await setupProfileGraphQL(page);
    await settingsPage.profile.goto();
    await settingsPage.profile.expectHeading();
  });

  test('should display the Profile section with user information', async ({
    page,
    settingsPage,
  }) => {
    await setupProfileGraphQL(page);
    await settingsPage.profile.goto();

    await settingsPage.profile.expectProfileSection();
  });

  test('should display username field', async ({ page, settingsPage }) => {
    await setupProfileGraphQL(page);
    await settingsPage.profile.goto();

    await settingsPage.profile.expectUsernameField();
  });

  test('should display email field', async ({ page, settingsPage }) => {
    await setupProfileGraphQL(page);
    await settingsPage.profile.goto();

    await settingsPage.profile.expectEmailField();
  });

  test('should display User ID field', async ({ page, settingsPage }) => {
    await setupProfileGraphQL(page);
    await settingsPage.profile.goto();

    await settingsPage.profile.expectUserIdField();
  });

  test('should display info banner about Google-managed profile', async ({
    page,
    settingsPage,
  }) => {
    await setupProfileGraphQL(page);
    await settingsPage.profile.goto();

    await settingsPage.profile.expectGoogleManagedBanner();
  });

  test('should display App Avatar section', async ({ page, settingsPage }) => {
    await setupProfileGraphQL(page);
    await settingsPage.profile.goto();

    await settingsPage.profile.expectAppAvatarSection();
  });

  test('should display Account & Security section', async ({
    page,
    settingsPage,
  }) => {
    await setupProfileGraphQL(page);
    await settingsPage.profile.goto();

    await settingsPage.profile.expectAccountSecuritySection();
  });

  test('should display active session indicator', async ({
    page,
    settingsPage,
  }) => {
    await setupProfileGraphQL(page);
    await settingsPage.profile.goto();

    await settingsPage.profile.expectActiveSession();
  });

  test('should display Sign Out button', async ({ page, settingsPage }) => {
    await setupProfileGraphQL(page);
    await settingsPage.profile.goto();

    await settingsPage.profile.expectSignOutButton();
  });

  test('should display sign out description text', async ({
    page,
    settingsPage,
  }) => {
    await setupProfileGraphQL(page);
    await settingsPage.profile.goto();

    await settingsPage.profile.expectSignOutDescription();
  });

  test('should display Access Level field', async ({ page, settingsPage }) => {
    await setupProfileGraphQL(page);
    await settingsPage.profile.goto();

    await settingsPage.profile.expectAccessLevelField();
  });

  test('should display page meta description', async ({
    page,
    settingsPage,
  }) => {
    await setupProfileGraphQL(page);
    await settingsPage.profile.goto();

    await settingsPage.profile.expectMetaDescription();
  });
});

// ---------------------------------------------------------------------------
// LS-9135: the Appearance / theme section that LS-4912 added to this page was
// removed — theme selection now lives solely on /preferences (the canonical
// location per docs/design/UUCswUjg_28Xzcqii7Rt2Q), eliminating the
// duplicate control the client reported. LS-4912's original concern — mobile
// users reaching this page via the bottom-bar "You" tab had no path to the
// theme control because the desktop nav dropdown (which carries its own
// theme picker) isn't rendered on mobile — is now addressed by a
// "Preferences" link in the mobile nav drawer's "You" section instead (see
// mobile-responsive-nav.spec.ts). Theme-control coverage for /preferences
// itself lives in dark-mode.spec.ts.
// ---------------------------------------------------------------------------
// LS-7825: Linked Identities section — canonical email management
// ---------------------------------------------------------------------------

const MOCK_IDENTITIES_GOOGLE_CANONICAL = [
  {
    __typename: 'UserIdentity',
    id: 1,
    provider: 'google',
    providerEmail: 'e2e-test@legacysports.dev',
    providerEmailVerified: true,
    providerUsername: null,
    providerAvatar: null,
    linkedAt: '2026-01-01T00:00:00Z',
  },
];

const MOCK_IDENTITIES_MULTI = [
  {
    __typename: 'UserIdentity',
    id: 1,
    provider: 'google',
    providerEmail: 'e2e-test@legacysports.dev',
    providerEmailVerified: true,
    providerUsername: null,
    providerAvatar: null,
    linkedAt: '2026-01-01T00:00:00Z',
  },
  {
    __typename: 'UserIdentity',
    id: 2,
    provider: 'discord',
    providerEmail: 'testuser@discord.example.com',
    providerEmailVerified: true,
    providerUsername: 'testuser#1234',
    providerAvatar: null,
    linkedAt: '2026-02-01T00:00:00Z',
  },
];

async function setupProfileGraphQLWithIdentities(
  page: import('@playwright/test').Page,
  identities = MOCK_IDENTITIES_GOOGLE_CANONICAL,
) {
  await page.route(
    (url) => isGraphQLEndpoint(url),
    async (route, request) => {
      const body = request.postDataJSON() as { operationName?: string };

      if (body.operationName === 'GetUserById') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: MOCK_USER_DATA }),
        });
        return;
      }

      if (body.operationName === 'MyIdentities') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { myIdentities: identities } }),
        });
        return;
      }

      if (body.operationName === 'SetCanonicalEmail') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              setCanonicalEmail: {
                __typename: 'SetCanonicalEmailResult',
                changed: true,
                user: {
                  __typename: 'User',
                  id: 1,
                  email: 'testuser@discord.example.com',
                  username: 'testuser',
                  avatarUrl: null,
                  accessLevel: 'none',
                  subscriptionTier: null,
                  themePreference: null,
                },
              },
            },
          }),
        });
        return;
      }

      await unmockedGraphQLFallback(route);
    },
  );
}

test.describe('Profile Settings Page — Linked Identities (LS-7825) @regression', () => {
  test('renders the Linked Identities section', async ({
    page,
    settingsPage,
  }) => {
    await setupProfileGraphQLWithIdentities(page);
    await settingsPage.profile.goto();
    await settingsPage.profile.expectLinkedIdentitiesSection();
  });

  test('shows the canonical identity with a "Primary email" badge', async ({
    page,
    settingsPage,
  }) => {
    await setupProfileGraphQLWithIdentities(page);
    await settingsPage.profile.goto();
    await settingsPage.profile.expectPrimaryEmailBadge();
    // Scope to the section — bare "Google" also matches the info banner and the
    // "Google OAuth" sign-in method row.
    await settingsPage.profile.expectIdentityProviderInSection('Google');
  });

  test('shows "Set as primary" button for a verified non-canonical identity', async ({
    page,
    settingsPage,
  }) => {
    await setupProfileGraphQLWithIdentities(page, MOCK_IDENTITIES_MULTI);
    await settingsPage.profile.goto();
    await settingsPage.profile.expectSetAsPrimaryVisible();
  });

  test('shows "Disconnect" button for non-local providers', async ({
    page,
    settingsPage,
  }) => {
    await setupProfileGraphQLWithIdentities(page, MOCK_IDENTITIES_MULTI);
    await settingsPage.profile.goto();
    await settingsPage.profile.expectDisconnectVisible();
  });

  test('clicking "Set as primary" calls SetCanonicalEmail mutation', async ({
    page,
    settingsPage,
  }) => {
    let mutationCalled = false;
    await page.route(
      (url) => isGraphQLEndpoint(url),
      async (route, request) => {
        const body = request.postDataJSON() as {
          operationName?: string;
          variables?: { identityId?: number };
        };

        if (body.operationName === 'GetUserById') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ data: MOCK_USER_DATA }),
          });
          return;
        }

        if (body.operationName === 'MyIdentities') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              data: { myIdentities: MOCK_IDENTITIES_MULTI },
            }),
          });
          return;
        }

        if (body.operationName === 'SetCanonicalEmail') {
          mutationCalled = true;
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              data: {
                setCanonicalEmail: {
                  __typename: 'SetCanonicalEmailResult',
                  changed: true,
                  user: {
                    ...MOCK_USER_DATA.user,
                    email: 'testuser@discord.example.com',
                  },
                },
              },
            }),
          });
          return;
        }

        await unmockedGraphQLFallback(route);
      },
    );

    await settingsPage.profile.goto();
    // EditButton is a Tamagui styled() component, which does not forward
    // data-testid in the web build — locate by accessible role + name. Only
    // the non-canonical verified identity (discord, id 2) renders the button.
    await settingsPage.profile.expectSetAsPrimaryButton();
    await settingsPage.profile.clickSetAsPrimary();
    await expect.poll(() => mutationCalled, { timeout: 5000 }).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// LS-3507: Accessibility regression — /profile/settings
//
// An automated scan flagged an empty alt attribute on the logo image and
// missing <main> / <nav> landmarks on /profile/settings. These tests lock in
// the correct accessible markup so a future regression is caught immediately.
// ---------------------------------------------------------------------------

test.describe('Profile Settings Page — accessibility @regression', () => {
  test('logo image has non-empty alt text', async ({ page, settingsPage }) => {
    await setupProfileGraphQL(page);
    await settingsPage.profile.goto();

    await settingsPage.profile.expectLogoAttached();
    const alt = await settingsPage.profile.logoAltText();
    expect(alt).toBeTruthy();
    expect((alt ?? '').trim().length).toBeGreaterThan(0);
  });

  test('page has a <main> landmark', async ({ page, settingsPage }) => {
    await setupProfileGraphQL(page);
    await settingsPage.profile.goto();

    await settingsPage.profile.expectMainLandmark();
  });

  test('page has a primary navigation landmark', async ({
    page,
    settingsPage,
  }) => {
    await setupProfileGraphQL(page);
    await settingsPage.profile.goto();

    await settingsPage.profile.expectPrimaryNavLandmark();
  });
});

// ---------------------------------------------------------------------------
// LS-7833: Two-Factor Authentication section — enable/disable 2FA flow
// ---------------------------------------------------------------------------

// Route MFA traffic through the static server port so the _apiIsolation
// catch-all (which blocks everything not on port 4280) doesn't swallow
// these requests before the per-test handlers can fulfill them.
const E2E_ORIGIN = `http://localhost:${process.env['E2E_PORT'] ?? 4280}`;
const MFA_STATUS_URL = `${E2E_ORIGIN}/mfa/status`;
const MFA_ENROLL_URL = `${E2E_ORIGIN}/mfa/enroll`;
const MFA_VERIFY_URL = `${E2E_ORIGIN}/mfa/verify-setup`;
const MFA_DISABLE_URL = `${E2E_ORIGIN}/mfa/disable`;

async function setupMfaRoutes(
  page: import('@playwright/test').Page,
  { mfaEnabled }: { mfaEnabled: boolean },
) {
  // Inject the override before any scripts run so getMfaStatus() uses the
  // same origin as the static server (port 4280), bypassing the catch-all.
  await page.addInitScript((origin: string) => {
    window.__e2eOauthProxyUrl = origin;
  }, E2E_ORIGIN);

  await page.route(MFA_STATUS_URL, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ mfaEnabled }),
    }),
  );
}

test.describe('Profile Settings — Two-Factor Authentication @regression', () => {
  test('shows the Two-Factor Authentication section', async ({
    page,
    settingsPage,
  }) => {
    await setupProfileGraphQL(page);
    await setupMfaRoutes(page, { mfaEnabled: false });
    await settingsPage.profile.goto();

    await settingsPage.profile.expectTwoFactorSection();
  });

  test('shows Enable 2FA button when MFA is disabled', async ({
    page,
    settingsPage,
  }) => {
    await setupProfileGraphQL(page);
    await setupMfaRoutes(page, { mfaEnabled: false });
    await settingsPage.profile.goto();

    await settingsPage.profile.expectEnable2faButton();
    await settingsPage.profile.expectDisable2faButtonHidden();
  });

  test('shows QR code and verification input after clicking Enable 2FA', async ({
    page,
    settingsPage,
  }) => {
    await setupProfileGraphQL(page);
    await setupMfaRoutes(page, { mfaEnabled: false });

    await page.route(MFA_ENROLL_URL, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          secret: 'JBSWY3DPEHPK3PXP',
          otpauthUri:
            'otpauth://totp/Legacy%20Sports:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Legacy%20Sports',
        }),
      }),
    );

    await settingsPage.profile.goto();

    await settingsPage.profile.clickEnable2fa();

    await settingsPage.profile.expect2faEnrollFlow();
    await settingsPage.profile.expect2faCodeInput();
    await settingsPage.profile.expectVerifyButton();
  });

  test('shows enrollment error when verify-setup returns invalid code', async ({
    page,
    settingsPage,
  }) => {
    await setupProfileGraphQL(page);
    await setupMfaRoutes(page, { mfaEnabled: false });

    await page.route(MFA_ENROLL_URL, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          secret: 'JBSWY3DPEHPK3PXP',
          otpauthUri: 'otpauth://totp/Legacy%20Sports:user@example.com',
        }),
      }),
    );
    await page.route(MFA_VERIFY_URL, (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Invalid code' }),
      }),
    );

    await settingsPage.profile.goto();

    await settingsPage.profile.clickEnable2fa();
    await settingsPage.profile.expect2faCodeInput(10_000);

    await settingsPage.profile.fill2faCode('000000');
    await settingsPage.profile.clickVerify();

    await settingsPage.profile.expect2faError('Invalid code');
  });

  test('shows Disable 2FA button when MFA is enabled', async ({
    page,
    settingsPage,
  }) => {
    await setupProfileGraphQL(page);
    await setupMfaRoutes(page, { mfaEnabled: true });
    await settingsPage.profile.goto();

    await settingsPage.profile.expectDisable2faButton();
  });

  test('returns to disabled state after disabling 2FA', async ({
    page,
    settingsPage,
  }) => {
    await setupProfileGraphQL(page);
    await setupMfaRoutes(page, { mfaEnabled: true });

    await page.route(MFA_DISABLE_URL, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      }),
    );

    await settingsPage.profile.goto();

    await settingsPage.profile.expectDisable2faButton();

    page.once('dialog', (dialog) => void dialog.accept());
    await settingsPage.profile.clickDisable2fa();

    // useMfa sets mfaEnabled: false directly on success, so the Enable button
    // should appear without a page reload.
    await settingsPage.profile.expectEnable2faButton();
  });

  test('flips to Enabled state after successful enrollment with valid code', async ({
    page,
    settingsPage,
  }) => {
    await setupProfileGraphQL(page);
    await setupMfaRoutes(page, { mfaEnabled: false });

    await page.route(MFA_ENROLL_URL, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          secret: 'JBSWY3DPEHPK3PXP',
          otpauthUri:
            'otpauth://totp/Legacy%20Sports:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Legacy%20Sports',
        }),
      }),
    );
    await page.route(MFA_VERIFY_URL, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{}',
      }),
    );

    await settingsPage.profile.goto();

    await settingsPage.profile.clickEnable2fa();
    await settingsPage.profile.expect2faCodeInput(10_000);

    await settingsPage.profile.fill2faCode('123456');
    await settingsPage.profile.clickVerify();

    // useMfa.verifySetup sets mfaEnabled: true on success — Disable button must appear.
    await settingsPage.profile.expectDisable2faButton();
    await settingsPage.profile.expectEnable2faButtonHidden();
  });

  test('full cycle: enables 2FA then disables it in the same session', async ({
    page,
    settingsPage,
  }) => {
    await setupProfileGraphQL(page);
    await setupMfaRoutes(page, { mfaEnabled: false });

    await page.route(MFA_ENROLL_URL, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          secret: 'JBSWY3DPEHPK3PXP',
          otpauthUri:
            'otpauth://totp/Legacy%20Sports:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Legacy%20Sports',
        }),
      }),
    );
    await page.route(MFA_VERIFY_URL, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{}',
      }),
    );
    await page.route(MFA_DISABLE_URL, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      }),
    );

    await settingsPage.profile.goto();

    // — Enable phase —
    await settingsPage.profile.clickEnable2fa();
    await settingsPage.profile.expect2faCodeInput(10_000);
    await settingsPage.profile.fill2faCode('123456');
    await settingsPage.profile.clickVerify();
    await settingsPage.profile.expectDisable2faButton();

    // — Disable phase —
    page.once('dialog', (dialog) => void dialog.accept());
    await settingsPage.profile.clickDisable2fa();
    await settingsPage.profile.expectEnable2faButton();
  });
});

// ---------------------------------------------------------------------------
// LS-3506: /profile/settings is a protected route. Unauthenticated users must
// NOT see the profile settings content. EnhancedAuthGuard renders the login
// page in-place at the requested URL (no redirect). An automated audit crawler
// visited https://legacy-fantasy.com/profile/settings unauthenticated and
// mis-reported it as broken — these tests lock in the unauthenticated behaviour
// so a regression cannot go undetected.
// ---------------------------------------------------------------------------

unauthTest.describe(
  'Profile Settings — unauthenticated visitor @regression',
  () => {
    unauthTest(
      'stays at /profile/settings and shows login page for unauthenticated user',
      async ({ page, settingsPage }) => {
        await settingsPage.profile.goto();

        // EnhancedAuthGuard renders the login page in-place — no redirect to /.
        await expect(page).toHaveURL('/profile/settings', { timeout: 15_000 });
      },
    );

    unauthTest(
      'shows sign-in CTA for unauthenticated user at /profile/settings',
      async ({ settingsPage }) => {
        await settingsPage.profile.goto();

        await settingsPage.profile.expectContinueWithGoogle();
      },
    );

    unauthTest(
      'does not show Profile Settings content for unauthenticated user',
      async ({ settingsPage }) => {
        await settingsPage.profile.goto();

        await settingsPage.profile.expectHeadingHidden();
      },
    );
  },
);
