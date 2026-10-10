/**
 * Two-Factor Authentication (2FA) — E2E Tests (LS-8463)
 *
 * Hermetic coverage of:
 *   • 2FA enrollment (QR/secret shown, confirm with a code, success + wrong-code
 *     error) and disable, on the profile settings page.
 *   • The post-authentication step-up TOTP challenge (StepUpModal) a 2FA-enrolled
 *     user hits before a sensitive action — wrong code rejected, correct code
 *     lands the gated action.
 *
 * Driven through the ADR-0015/0016 semantic driver objects (TwoFactorSection,
 * StepUpChallenge, ProfileSettingsScreen, SubscriptionScreen) so the verbs are
 * reusable when native auth surfaces get covered.
 *
 * 2FA and step-up are served by REST endpoints on the oauth-proxy (`/mfa/*`,
 * `/step-up/verify`), not GraphQL. The api-isolation catch-all blocks anything
 * not on the static-server port, so each test re-points the OAuth proxy origin
 * to that port (`window.__e2eOauthProxyUrl`) before routing the REST endpoints
 * (mirrors the LS-7833 pattern, now migrated to driver objects).
 *
 * Supersedes the raw-Playwright "Profile Settings — Two-Factor Authentication"
 * block that previously lived in profile-settings.spec.ts.
 */

import { buildAuthStorageState } from '../fixtures/auth-enhanced';
import { signTestJwt } from '../fixtures/api-isolation';
import { expect, test } from '../fixtures/pages';
import {
  isGraphQLEndpoint,
  unmockedGraphQLFallback,
} from '../mocks/graphql/router';
import { myPremiumSubscriptionResponse } from '../mocks/graphql/subscription.mocks';

type PWPage = import('@playwright/test').Page;

// ── REST endpoints (served by the oauth-proxy, mocked on the static port) ────
const E2E_ORIGIN = `http://localhost:${process.env['E2E_PORT'] ?? 4280}`;
const MFA_STATUS_URL = `${E2E_ORIGIN}/mfa/status`;
const MFA_ENROLL_URL = `${E2E_ORIGIN}/mfa/enroll`;
const MFA_VERIFY_URL = `${E2E_ORIGIN}/mfa/verify-setup`;
const MFA_DISABLE_URL = `${E2E_ORIGIN}/mfa/disable`;
const STEP_UP_VERIFY_URL = `${E2E_ORIGIN}/step-up/verify`;

const MOCK_SECRET = 'JBSWY3DPEHPK3PXP';
const MOCK_OTPAUTH_URI =
  'otpauth://totp/Legacy%20Sports:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Legacy%20Sports';

// ── Helpers ──────────────────────────────────────────────────────────────────

function jsonResponse(status: number, body: unknown) {
  return {
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  };
}

/**
 * Point the OAuth proxy origin at the static-server port so `/mfa/*` and
 * `/step-up/verify` requests reach the per-test handlers instead of the
 * api-isolation catch-all (which blocks everything off the static port). Must
 * run before any app script — `getMfaStatus()` and the step-up fetch read this
 * global (gated on `navigator.webdriver`) before the app code runs.
 */
async function useStaticServerOauthProxy(page: PWPage): Promise<void> {
  await page.addInitScript((origin: string) => {
    window.__e2eOauthProxyUrl = origin;
  }, E2E_ORIGIN);
}

/** Mock the GraphQL the profile settings page needs; cascade the rest. */
async function setupProfileGraphQL(page: PWPage): Promise<void> {
  await page.route(isGraphQLEndpoint, async (route, request) => {
    const op = (request.postDataJSON() as { operationName?: string })
      .operationName;
    if (op === 'GetUserById') {
      await route.fulfill(
        jsonResponse(200, {
          data: {
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
          },
        }),
      );
      return;
    }
    // Cascade unhandled ops (e.g. the ambient MyIdentities query) to the
    // baseline fixture instead of swallowing them (LS-7960).
    await unmockedGraphQLFallback(route);
  });
}

/**
 * Mock the subscription GraphQL so the premium "Manage Subscription" CTA
 * renders, and flag when the gated billing action fires. The billing-portal
 * mutation returns a null URL so the app does NOT `window.location` redirect —
 * we only assert the gated action ran once the challenge passes.
 */
async function setupSubscriptionGraphQL(
  page: PWPage,
  onBillingAction: () => void,
): Promise<void> {
  await page.route(isGraphQLEndpoint, async (route, request) => {
    const op =
      (request.postDataJSON() as { operationName?: string }).operationName ??
      '';
    const lower = op.toLowerCase();
    if (lower.includes('mysubscription')) {
      await route.fulfill(jsonResponse(200, myPremiumSubscriptionResponse()));
      return;
    }
    if (lower.includes('createbillingportalsession')) {
      onBillingAction();
      await route.fulfill(
        jsonResponse(200, {
          data: { createBillingPortalSession: { url: null } },
        }),
      );
      return;
    }
    await unmockedGraphQLFallback(route);
  });
}

// ---------------------------------------------------------------------------
// 2FA enrollment / disable — profile settings (AC1, AC2, AC5)
// ---------------------------------------------------------------------------

test.describe('Two-Factor Authentication — enrollment @regression', () => {
  test('shows the QR/secret and confirms enrollment with a valid code', async ({
    page,
    profileSettingsScreen,
  }) => {
    await useStaticServerOauthProxy(page);
    await setupProfileGraphQL(page);
    await page.route(MFA_STATUS_URL, (route) =>
      route.fulfill(jsonResponse(200, { mfaEnabled: false })),
    );
    await page.route(MFA_ENROLL_URL, (route) =>
      route.fulfill(
        jsonResponse(200, {
          secret: MOCK_SECRET,
          otpauthUri: MOCK_OTPAUTH_URI,
        }),
      ),
    );
    await page.route(MFA_VERIFY_URL, (route) =>
      route.fulfill(jsonResponse(200, {})),
    );

    await profileSettingsScreen.goto();
    const { twoFactor } = profileSettingsScreen;

    await twoFactor.expectDisabledState();
    await twoFactor.startEnrollment();
    await twoFactor.expectEnrollFlow();
    // The secret renders in grouped 4-char form (JBSW Y3DP …).
    await twoFactor.expectSecretShown('JBSW');

    await twoFactor.enterCode('123456');
    await twoFactor.verify();

    // useMfa flips mfaEnabled → true on success; the Disable button appears.
    await twoFactor.expectEnabledState();
  });

  test('surfaces an error when the confirmation code is wrong', async ({
    page,
    profileSettingsScreen,
  }) => {
    await useStaticServerOauthProxy(page);
    await setupProfileGraphQL(page);
    await page.route(MFA_STATUS_URL, (route) =>
      route.fulfill(jsonResponse(200, { mfaEnabled: false })),
    );
    await page.route(MFA_ENROLL_URL, (route) =>
      route.fulfill(
        jsonResponse(200, {
          secret: MOCK_SECRET,
          otpauthUri: MOCK_OTPAUTH_URI,
        }),
      ),
    );
    await page.route(MFA_VERIFY_URL, (route) =>
      route.fulfill(jsonResponse(401, { error: 'Invalid code' })),
    );

    await profileSettingsScreen.goto();
    const { twoFactor } = profileSettingsScreen;

    await twoFactor.startEnrollment();
    await twoFactor.enterCode('000000');
    await twoFactor.verify();

    await twoFactor.expectError('Invalid code');
  });
});

test.describe('Two-Factor Authentication — disable @regression', () => {
  test('disables 2FA from the enabled state', async ({
    page,
    profileSettingsScreen,
  }) => {
    await useStaticServerOauthProxy(page);
    await setupProfileGraphQL(page);
    await page.route(MFA_STATUS_URL, (route) =>
      route.fulfill(jsonResponse(200, { mfaEnabled: true })),
    );
    await page.route(MFA_DISABLE_URL, (route) =>
      route.fulfill(jsonResponse(200, { success: true })),
    );

    await profileSettingsScreen.goto();
    const { twoFactor } = profileSettingsScreen;

    await twoFactor.expectEnabledState();

    // The Disable action raises a window.confirm — accept it (web-only surface).
    page.once('dialog', (dialog) => void dialog.accept());
    await twoFactor.disable();

    // useMfa sets mfaEnabled → false on success; the Enable button reappears.
    await twoFactor.expectDisabledState();
  });
});

// ---------------------------------------------------------------------------
// Step-up TOTP challenge — post-authentication (AC3, AC4, AC6)
//
// A 2FA-enrolled identity (mfaEnabled in the JWT + cached profile) so the
// StepUpModal opens in TOTP (6-digit) mode. The challenge is the shared-
// components auth surface exercised through the web app's billing action.
// ---------------------------------------------------------------------------

const mfaTest = test.extend({
  storageState: async ({}, use) => {
    await use(
      buildAuthStorageState(signTestJwt({ mfaEnabled: true }), {
        mfaEnabled: true,
      }),
    );
  },
});

mfaTest.describe(
  'Two-Factor Authentication — step-up challenge @regression',
  () => {
    mfaTest(
      'correct code passes the challenge and the gated action proceeds',
      async ({ page, subscriptionScreen }) => {
        let billingActionFired = false;
        await useStaticServerOauthProxy(page);
        await setupSubscriptionGraphQL(page, () => {
          billingActionFired = true;
        });
        await page.route(STEP_UP_VERIFY_URL, (route) =>
          route.fulfill(
            jsonResponse(200, {
              success: true,
              validUntil: Math.floor(Date.now() / 1000) + 900,
            }),
          ),
        );

        await subscriptionScreen.goto();
        await subscriptionScreen.openBillingPortal();

        const { stepUp } = subscriptionScreen;
        await stepUp.expectPrompt();
        await stepUp.enterCode('123456');
        await stepUp.submit();

        // On success the modal dismisses and the deferred billing action fires.
        await stepUp.expectDismissed();
        await expect
          .poll(() => billingActionFired, { timeout: 10000 })
          .toBe(true);
      },
    );

    mfaTest(
      'wrong code is rejected and the gated action does not fire',
      async ({ page, subscriptionScreen }) => {
        let billingActionFired = false;
        await useStaticServerOauthProxy(page);
        await setupSubscriptionGraphQL(page, () => {
          billingActionFired = true;
        });
        await page.route(STEP_UP_VERIFY_URL, (route) =>
          route.fulfill(jsonResponse(401, { error: 'invalid_credential' })),
        );

        await subscriptionScreen.goto();
        await subscriptionScreen.openBillingPortal();

        const { stepUp } = subscriptionScreen;
        await stepUp.expectPrompt();
        await stepUp.enterCode('000000');
        await stepUp.submit();

        await stepUp.expectError('Incorrect credential. Please try again.');
        expect(billingActionFired).toBe(false);
      },
    );
  },
);
