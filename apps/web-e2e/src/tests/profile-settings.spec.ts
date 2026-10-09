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

  // Username boundary rule (LS-7671): shared with native via validateUsername.
  // The input has maxLength=50, so the 51-char boundary is covered by the
  // validator unit spec; here we cover the too-short and bad-character paths.
  test('should reject a 2-character username without calling the API', async ({
    page,
    settingsPage,
  }) => {
    await setupProfileGraphQL(page);
    // Registered after the shared mock: Playwright runs the most recently
    // registered matching route first, so this spy sees UpdateUsername and
    // falls back to the shared mock for everything else.
    let updateUsernameCalls = 0;
    await page.route(
      (url) => isGraphQLEndpoint(url),
      async (route, request) => {
        const body = request.postDataJSON() as { operationName?: string };
        if (body.operationName === 'UpdateUsername') {
          updateUsernameCalls += 1;
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              data: {
                updateUsername: {
                  __typename: 'User',
                  id: 1,
                  username: 'ab',
                },
              },
            }),
          });
          return;
        }
        await route.fallback();
      },
    );
    await settingsPage.profile.goto();

    await settingsPage.profile.editUsername('ab');
    await settingsPage.profile.saveUsername();

    await settingsPage.profile.expectUsernameError(
      'Username must be between 3 and 50 characters',
    );
    expect(updateUsernameCalls).toBe(0);
  });

  test('should reject a username with emoji and show the character-set error', async ({
    page,
    settingsPage,
  }) => {
    await setupProfileGraphQL(page);
    await settingsPage.profile.goto();

    await settingsPage.profile.editUsername('user😀name');
    await settingsPage.profile.saveUsername();

    await settingsPage.profile.expectUsernameError(
      'Only letters, numbers, underscores, hyphens, and periods allowed',
    );
  });

  test('should display email field', async ({ page, settingsPage }) => {
    await setupProfileGraphQL(page);
    await settingsPage.profile.goto();

    await settingsPage.profile.expectEmailField();
  });

  test('should not expose the internal User ID', async ({
    page,
    settingsPage,
  }) => {
    await setupProfileGraphQL(page);
    await settingsPage.profile.goto();

    await settingsPage.profile.expectNoUserIdField();
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
// LS-7212: App Avatar picker — preset selection.
//
// User avatars are presets-only (LS-10443 removed the custom-URL input; its
// absence is pinned in profile-league-branding.spec.ts), and there is no
// file-upload path, so there is no client-side size / MIME / EXIF validation
// to exercise. These tests pin which value each control sends to the
// `UpdateUserAvatar` mutation.
// ---------------------------------------------------------------------------

/** Mock the profile page and record every UpdateUserAvatar `avatarUrl`. */
async function setupAvatarGraphQL(
  page: import('@playwright/test').Page,
): Promise<Array<string | null>> {
  const sent: Array<string | null> = [];
  await page.route(
    (url) => isGraphQLEndpoint(url),
    async (route, request) => {
      const body = request.postDataJSON() as {
        operationName?: string;
        variables?: { avatarUrl?: string | null };
      };

      if (body.operationName === 'GetUserById') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: MOCK_USER_DATA }),
        });
        return;
      }

      if (body.operationName === 'UpdateUserAvatar') {
        sent.push(body.variables?.avatarUrl ?? null);
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              updateUserAvatar: {
                __typename: 'User',
                id: 1,
                avatarUrl: body.variables?.avatarUrl ?? null,
              },
            },
          }),
        });
        return;
      }

      await unmockedGraphQLFallback(route);
    },
  );
  return sent;
}

test.describe('Profile Settings Page — App Avatar picker (LS-7212) @regression', () => {
  test('saving a preset sends its page-origin-resolved URL', async ({
    page,
    settingsPage,
  }) => {
    const sent = await setupAvatarGraphQL(page);
    await settingsPage.profile.goto();
    // New users start on a pre-selected preset rather than an empty preview.
    await settingsPage.profile.expectAvatarPreviewCaption('Image selected');

    await settingsPage.profile.selectAvatarPreset('Astronaut');
    await settingsPage.profile.expectAvatarPreviewCaption('Image selected');
    await settingsPage.profile.clickSaveAvatar();

    // Presets are stored relative (/presets/x.png) in the picker but must be
    // resolved against the page origin so the DB value passes URL validation.
    const origin = new URL(page.url()).origin;
    await expect
      .poll(() => sent)
      .toEqual([`${origin}/presets/avatar-astronaut.png`]);
  });

  test('Clear resets the preview and sends a null avatar', async ({
    page,
    settingsPage,
  }) => {
    const sent = await setupAvatarGraphQL(page);
    await settingsPage.profile.goto();

    await settingsPage.profile.selectAvatarPreset('Astronaut');
    await settingsPage.profile.clickClearAvatar();

    await settingsPage.profile.expectAvatarPreviewCaption('No image selected');
    await expect.poll(() => sent).toEqual([null]);
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
  test('renders the Connected Accounts section', async ({
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
// LS-7669: Provider disconnect is gated by the shared design-system Dialog
// (not window.confirm). Hermetic: GraphQL and the oauth-proxy unlink endpoint
// are both fulfilled in-spec.
// ---------------------------------------------------------------------------

const DISCORD_UNLINK_URL = 'http://localhost:5001/discord/unlink';

async function setupDisconnectFlow(
  page: import('@playwright/test').Page,
  unlink: { status: number; body: Record<string, unknown> },
) {
  const state = { unlinkCalls: 0, nativeDialogs: 0 };
  page.on('dialog', async (dialog) => {
    state.nativeDialogs += 1;
    await dialog.dismiss();
  });

  await page.route(DISCORD_UNLINK_URL, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fallback();
      return;
    }
    state.unlinkCalls += 1;
    await route.fulfill({
      status: unlink.status,
      contentType: 'application/json',
      body: JSON.stringify(unlink.body),
    });
  });

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
        // After a successful unlink the refetch no longer returns discord.
        const identities =
          state.unlinkCalls > 0 && unlink.status < 400
            ? MOCK_IDENTITIES_MULTI.filter((i) => i.provider !== 'discord')
            : MOCK_IDENTITIES_MULTI;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { myIdentities: identities } }),
        });
        return;
      }

      await unmockedGraphQLFallback(route);
    },
  );

  return state;
}

test.describe('Profile Settings Page — Disconnect confirm dialog (LS-7669) @regression', () => {
  test('clicking "Disconnect" opens the shared dialog naming the provider, not a native confirm', async ({
    page,
    settingsPage,
  }) => {
    const state = await setupDisconnectFlow(page, { status: 200, body: {} });
    await settingsPage.profile.goto();

    await settingsPage.profile.clickLastDisconnect();

    await settingsPage.profile.expectDisconnectDialog('Discord');
    expect(state.nativeDialogs).toBe(0);
    expect(state.unlinkCalls).toBe(0);
  });

  test('canceling the dialog makes no unlink call and keeps both identities linked', async ({
    page,
    settingsPage,
  }) => {
    const state = await setupDisconnectFlow(page, { status: 200, body: {} });
    await settingsPage.profile.goto();

    await settingsPage.profile.clickLastDisconnect();
    await settingsPage.profile.expectDisconnectDialog('Discord');
    await settingsPage.profile.cancelDisconnectDialog();

    await settingsPage.profile.expectDisconnectDialogClosed();
    await settingsPage.profile.expectDisconnectButtonCount(2);
    expect(state.unlinkCalls).toBe(0);
    expect(state.nativeDialogs).toBe(0);
  });

  test('confirming unlinks the provider and removes the identity', async ({
    page,
    settingsPage,
  }) => {
    const state = await setupDisconnectFlow(page, { status: 200, body: {} });
    await settingsPage.profile.goto();

    await settingsPage.profile.clickLastDisconnect();
    await settingsPage.profile.expectDisconnectDialog('Discord');
    await settingsPage.profile.confirmDisconnectDialog();

    await expect.poll(() => state.unlinkCalls, { timeout: 5000 }).toBe(1);
    await settingsPage.profile.expectDisconnectDialogClosed();
    await settingsPage.profile.expectDisconnectButtonCount(1);
    expect(state.nativeDialogs).toBe(0);
  });

  test('a failed unlink shows the inline error and keeps both identities linked', async ({
    page,
    settingsPage,
  }) => {
    const state = await setupDisconnectFlow(page, {
      status: 500,
      body: { message: 'Discord unlink exploded' },
    });
    await settingsPage.profile.goto();

    await settingsPage.profile.clickLastDisconnect();
    await settingsPage.profile.confirmDisconnectDialog();

    await expect.poll(() => state.unlinkCalls, { timeout: 5000 }).toBe(1);
    await settingsPage.profile.expectUnlinkError('Discord unlink exploded');
    await settingsPage.profile.expectDisconnectButtonCount(2);
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
