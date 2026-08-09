/**
 * Discord OAuth callback page — E2E Tests (LS-8462)
 *
 * Covers the callback screen at /auth/discord/callback, which finishes linking
 * a Discord account for an already-authenticated user. `profile-settings.spec.ts`
 * (LS-7825) covers the Linked Identities *section*, but the callback handling
 * itself had no spec.
 *
 * Hermetic (AC3): every Discord/API call is served with `route.fulfill()` — the
 * suite never falls through to a live backend. The Discord link endpoint the
 * page POSTs to is `${oauthProxyUrl}/discord/link`; the hermetic build's
 * oauthProxyUrl is
 * `http://localhost:5001` (set by the API-isolation init script), so the tests
 * fulfil that URL directly — the same pattern login-completion.spec.ts uses for
 * `http://localhost:5001/google`. The app-shell + profile-settings GraphQL is
 * served by the baseline mocks (shared-mocks.ts); the happy path only overrides
 * `MyIdentities` to include the freshly-linked Discord identity.
 *
 * Page interactions/assertions go through the ADR-0016 driver-typed page objects
 * (discordCallbackScreen, profileSettingsScreen); the spec body owns only the
 * network mocking and navigation triggers.
 */

import type { Page } from '@playwright/test';

import { test } from '../fixtures/pages';
import { createGraphQLRouter, fulfillJson } from '../mocks/graphql/router';

// The hermetic oauth-proxy origin baked in by the API-isolation init script.
const DISCORD_LINK_URL = 'http://localhost:5001/discord/link';

const GOOGLE_IDENTITY = {
  __typename: 'UserIdentity',
  id: 1,
  provider: 'google',
  providerEmail: 'e2e-test@legacysports.dev',
  providerEmailVerified: true,
  providerUsername: null,
  providerAvatar: null,
  linkedAt: '2026-01-01T00:00:00Z',
};

const DISCORD_IDENTITY = {
  __typename: 'UserIdentity',
  id: 2,
  provider: 'discord',
  providerEmail: 'testuser@discord.example.com',
  providerEmailVerified: true,
  providerUsername: 'testuser#1234',
  providerAvatar: null,
  linkedAt: '2026-02-01T00:00:00Z',
};

/**
 * Mock the Discord link POST with the given HTTP status and JSON body. A 200
 * (empty body) is the success case the AuthService treats as a completed link;
 * a 4xx/5xx with `{ message }` surfaces that message as the page's error state.
 */
async function mockDiscordLink(
  page: Page,
  { status, body = {} }: { status: number; body?: object },
): Promise<void> {
  await page.route(DISCORD_LINK_URL, (route) =>
    route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    }),
  );
}

/**
 * Override the ambient `MyIdentities` query so the profile-settings redirect
 * target shows the freshly-linked Discord account. Every other operation
 * (GetUserById, scoreboard, etc.) cascades to the shared baseline mocks.
 */
async function mockIdentities(page: Page, identities: object[]): Promise<void> {
  await createGraphQLRouter(page, {
    myidentities: (route) =>
      fulfillJson(route, { data: { myIdentities: identities } }),
  });
}

test.describe('Discord OAuth callback — success @critical', () => {
  test('valid code links Discord and redirects to profile settings with the identity shown', async ({
    page,
    discordCallbackScreen,
    profileSettingsScreen,
  }) => {
    await mockIdentities(page, [GOOGLE_IDENTITY, DISCORD_IDENTITY]);
    await mockDiscordLink(page, { status: 200 });

    await discordCallbackScreen.goto('?code=valid-code&state=nonce-123');

    // On success the page navigates to /profile/settings?discord_linked=1;
    // the destination heading + Discord row prove the redirect + link (AC1).
    await profileSettingsScreen.expectLoaded();
    await profileSettingsScreen.expectLinkedIdentityVisible('Discord');
  });
});

test.describe('Discord OAuth callback — error states @regression', () => {
  test('missing code shows the security-check error, not a blank page', async ({
    discordCallbackScreen,
  }) => {
    // No link POST expected — the page never calls the backend without a code.
    await discordCallbackScreen.goto('?state=nonce-only');

    await discordCallbackScreen.expectErrorMessage(
      /the security check did not pass/i,
    );
    await discordCallbackScreen.expectErrorStateVisible();
  });

  test('missing state (invalid callback) shows the security-check error', async ({
    discordCallbackScreen,
  }) => {
    await discordCallbackScreen.goto('?code=only-code');

    await discordCallbackScreen.expectErrorMessage(
      /the security check did not pass/i,
    );
    await discordCallbackScreen.expectErrorStateVisible();
  });

  test('backend link-failure (already linked) shows an actionable error state', async ({
    page,
    discordCallbackScreen,
  }) => {
    // The oauth-proxy returns this intentionally-vague 409 when the Discord
    // account is linked to a different Legacy Sports user (LS-2549/LS-6659).
    // Message casing matches lambdas/oauth-proxy/src/handlers/IdentityLink.ts
    // exactly (lowercase "discord") — see LS-9132/LS-9133.
    await mockDiscordLink(page, {
      status: 409,
      body: { message: 'Could not link discord account' },
    });

    await discordCallbackScreen.goto('?code=taken-code&state=nonce-123');

    await discordCallbackScreen.expectErrorMessage(
      /can.t be linked to your profile/i,
    );
    await discordCallbackScreen.expectErrorStateVisible();
  });

  test('generic backend link-failure surfaces the server message', async ({
    page,
    discordCallbackScreen,
  }) => {
    await mockDiscordLink(page, {
      status: 500,
      body: { message: 'Discord service is temporarily unavailable' },
    });

    await discordCallbackScreen.goto('?code=bad-code&state=nonce-123');

    await discordCallbackScreen.expectErrorMessage(
      /discord service is temporarily unavailable/i,
    );
    await discordCallbackScreen.expectErrorStateVisible();
  });

  test('user-denied (error=access_denied) shows the cancelled/denied error state', async ({
    discordCallbackScreen,
  }) => {
    // Discord redirects here with ?error=access_denied when the user declines;
    // the page short-circuits before any backend call.
    await discordCallbackScreen.goto('?error=access_denied');

    await discordCallbackScreen.expectErrorMessage(/cancelled or denied/i);
    await discordCallbackScreen.expectErrorStateVisible();
  });
});
