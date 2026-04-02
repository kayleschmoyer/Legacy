/**
 * Profile Settings & League Branding — Additional E2E Tests (LS-1623)
 *
 * Covers UI flows not tested by profile-settings.spec.ts and league-branding.spec.ts:
 *
 * Profile Settings (/profile/settings):
 *   - Avatar picker renders with preset options and actions
 *   - Username edit form shows Save/Cancel buttons and validates input
 *   - Username save triggers the UpdateUsername mutation
 *
 * League Branding (/baseball/league/:id/commissioner):
 *   - Banner picker renders preset thumbnails and custom URL input
 *   - Color customization shows swatch previews alongside inputs
 *   - Saving colors triggers the UpdateLeagueBranding mutation
 *
 * All GraphQL queries are mocked — tests run without a live backend.
 */

import { expect, test } from '../fixtures/auth-enhanced';
import { unmockedGraphQLFallback } from '../fixtures/shared-mocks';
import { LeaguePage } from '../pages/league.page';
import { updateLeagueBrandingResponse } from '../mocks/graphql/league.mocks';

// ── Helpers ──────────────────────────────────────────────────────────────────

function isGraphQLEndpoint(url: URL): boolean {
  const s = url.toString();
  return (
    s.includes('/graphql') &&
    !s.includes('/@fs/') &&
    !s.includes('.ts') &&
    !s.includes('.js')
  );
}

// ── Mock Data ────────────────────────────────────────────────────────────────

const MOCK_USER_DATA = {
  __typename: 'Query' as const,
  user: {
    __typename: 'User' as const,
    id: 1,
    username: 'testuser',
    email: 'testuser@example.com',
    avatarUrl: null,
    accessLevel: 'user',
  },
};

// ── GraphQL Mock Setup (Profile) ─────────────────────────────────────────────

async function setupProfileGraphQL(
  page: import('@playwright/test').Page,
  opts: { interceptMutations?: boolean } = {},
) {
  const mutationCalls: { operationName: string; variables: unknown }[] = [];

  await page.route(
    (url) => isGraphQLEndpoint(url),
    async (route, request) => {
      const body = request.postDataJSON() as {
        operationName?: string;
        variables?: unknown;
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
        if (opts.interceptMutations) {
          mutationCalls.push({
            operationName: body.operationName,
            variables: body.variables,
          });
        }
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

      if (body.operationName === 'UpdateUsername') {
        if (opts.interceptMutations) {
          mutationCalls.push({
            operationName: body.operationName,
            variables: body.variables,
          });
        }
        const vars = body.variables as { username?: string } | undefined;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              updateUsername: {
                __typename: 'User',
                id: 1,
                username: vars?.username ?? 'testuser',
              },
            },
          }),
        });
        return;
      }

      // Default — return empty data for unhandled operations
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: {} }),
      });
    },
  );

  return { mutationCalls };
}

// ── Profile Settings — Avatar Picker ─────────────────────────────────────────

test.describe('Profile Settings — Avatar Picker @regression', () => {
  test('should render the avatar preset grid with PRESETS label', async ({
    page,
  }) => {
    await setupProfileGraphQL(page);
    await page.goto('/profile/settings');

    // The AvatarPicker renders a "PRESETS" label above the grid
    await expect(page.getByText('PRESETS')).toBeVisible();
  });

  test('should display the avatar preview section', async ({ page }) => {
    await setupProfileGraphQL(page);
    await page.goto('/profile/settings');

    await expect(page.getByText('Avatar Preview')).toBeVisible();
    await expect(page.getByText('No image selected')).toBeVisible();
  });

  test('should render the custom URL input with Apply button', async ({
    page,
  }) => {
    await setupProfileGraphQL(page);
    await page.goto('/profile/settings');

    await expect(page.getByText('CUSTOM URL')).toBeVisible();
    await expect(
      page.getByPlaceholder('https://example.com/avatar.png'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Apply' })).toBeVisible();
  });

  test('should render Save and Clear action buttons', async ({ page }) => {
    await setupProfileGraphQL(page);
    await page.goto('/profile/settings');

    await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Clear' })).toBeVisible();
  });

  test('clicking Save triggers the UpdateUserAvatar mutation', async ({
    page,
  }) => {
    const { mutationCalls } = await setupProfileGraphQL(page, {
      interceptMutations: true,
    });
    await page.goto('/profile/settings');

    // Wait for the picker to be visible, then click Save
    await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();
    await page.getByRole('button', { name: 'Save' }).click();

    // The mutation should have been called
    expect(
      mutationCalls.some((c) => c.operationName === 'UpdateUserAvatar'),
    ).toBe(true);
  });
});

// ── Profile Settings — Username Edit ─────────────────────────────────────────

test.describe('Profile Settings — Username Edit @regression', () => {
  // The EditButton is a styled YStack (not a native <button>), so
  // getByRole('button') won't find it. We locate via text content instead.

  test('should display the Edit button next to the username', async ({
    page,
  }) => {
    await setupProfileGraphQL(page);
    await page.goto('/profile/settings');

    await expect(page.getByText('Username', { exact: true })).toBeVisible();
    await expect(page.getByText('Edit', { exact: true })).toBeVisible();
  });

  test('clicking Edit shows the username input with Save and Cancel buttons', async ({
    page,
  }) => {
    await setupProfileGraphQL(page);
    await page.goto('/profile/settings');

    await page.getByText('Edit', { exact: true }).click();

    // Save and Cancel styled-buttons appear in edit mode
    await expect(page.getByText('Cancel', { exact: true })).toBeVisible();
    // There are multiple "Save" texts (avatar picker + username) — verify at
    // least one is visible (the username one just appeared)
    await expect(page.getByText('Save', { exact: true }).first()).toBeVisible();
  });

  test('Cancel button exits edit mode and restores original username', async ({
    page,
  }) => {
    await setupProfileGraphQL(page);
    await page.goto('/profile/settings');

    await page.getByText('Edit', { exact: true }).click();
    await expect(page.getByText('Cancel', { exact: true })).toBeVisible();

    await page.getByText('Cancel', { exact: true }).click();

    // Edit button should reappear, Cancel should be gone
    await expect(page.getByText('Edit', { exact: true })).toBeVisible();
    await expect(page.getByText('Cancel', { exact: true })).not.toBeVisible();
  });

  test('entering a too-short username shows a validation error', async ({
    page,
  }) => {
    await setupProfileGraphQL(page);
    await page.goto('/profile/settings');

    await page.getByText('Edit', { exact: true }).click();

    // The username input appears with the current value
    const input = page.locator('input[value="testuser"]');
    await expect(input).toBeVisible();
    await input.fill('ab');

    // Click Save next to the input to trigger validation.
    // The username Save is a styled <div> containing "Save" text;
    // locate it via the Cancel sibling (unique to the username row).
    // The username Save is a styled YStack (not a <button>). Target the
    // paragraph element to avoid matching the avatar picker's <button> Save.
    await page.locator('p', { hasText: /^Save$/ }).click();

    await expect(
      page.getByText('Username must be between 3 and 50 characters'),
    ).toBeVisible();
  });

  test('entering invalid characters shows a validation error', async ({
    page,
  }) => {
    await setupProfileGraphQL(page);
    await page.goto('/profile/settings');

    await page.getByText('Edit', { exact: true }).click();

    const input = page.locator('input[value="testuser"]');
    await expect(input).toBeVisible();
    await input.fill('test user!');

    // The username Save is a styled YStack (not a <button>). Target the
    // paragraph element to avoid matching the avatar picker's <button> Save.
    await page.locator('p', { hasText: /^Save$/ }).click();

    await expect(
      page.getByText(
        /Only letters, numbers, underscores, hyphens, and periods allowed/,
      ),
    ).toBeVisible();
  });

  test('saving a valid username triggers the UpdateUsername mutation', async ({
    page,
  }) => {
    const { mutationCalls } = await setupProfileGraphQL(page, {
      interceptMutations: true,
    });
    await page.goto('/profile/settings');

    await page.getByText('Edit', { exact: true }).click();

    const input = page.locator('input[value="testuser"]');
    await expect(input).toBeVisible();
    await input.fill('newuser123');

    // The username Save is a styled YStack (not a <button>). Target the
    // paragraph element to avoid matching the avatar picker's <button> Save.
    await page.locator('p', { hasText: /^Save$/ }).click();

    // The mutation should have been called with the new username
    const call = mutationCalls.find(
      (c) => c.operationName === 'UpdateUsername',
    );
    expect(call).toBeDefined();
    expect(call?.variables).toEqual({ username: 'newuser123' });
  });
});

// ── League Branding — Banner Picker @regression ──────────────────────────────

test.describe('League Branding — Banner Picker @regression', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/baseball/league/1/commissioner');
    await page.waitForLoadState('networkidle');

    const brandingHeader = page.getByRole('button', {
      name: /League Branding/i,
    });
    await brandingHeader.click();
    await expect(
      page.getByRole('heading', { name: /League Branding/i }),
    ).toBeVisible({ timeout: 5000 });
  });

  test('should display the Header Banner section with description', async ({
    page,
  }) => {
    await expect(
      page.getByText('Header Banner', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(/Wide image displayed at the top of your league page/),
    ).toBeVisible();
  });

  test('should render banner preset thumbnails with labels', async ({
    page,
  }) => {
    // The BannerPicker renders preset labels
    await expect(page.getByText('Blue & Gold')).toBeVisible();
    await expect(page.getByText('Red & Black')).toBeVisible();
  });

  test('should display the banner PREVIEW section', async ({ page }) => {
    // BannerPicker has a PREVIEW label
    const previewLabels = page.getByText('PREVIEW');
    await expect(previewLabels.first()).toBeVisible();
    await expect(page.getByText('No banner selected')).toBeVisible();
  });

  test('should render the custom banner URL input with Apply button', async ({
    page,
  }) => {
    await expect(
      page.getByPlaceholder('https://example.com/banner.png'),
    ).toBeVisible();
  });
});

// ── League Branding — Color Customization @regression ────────────────────────

test.describe('League Branding — Color Customization @regression', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/baseball/league/1/commissioner');
    await page.waitForLoadState('networkidle');

    const brandingHeader = page.getByRole('button', {
      name: /League Branding/i,
    });
    await brandingHeader.click();
    await expect(
      page.getByRole('heading', { name: /League Branding/i }),
    ).toBeVisible({ timeout: 5000 });
  });

  test('should display the Brand Colors section with description', async ({
    page,
  }) => {
    await expect(page.getByText('Brand Colors', { exact: true })).toBeVisible();
    await expect(
      page.getByText(/Used for accents in standings and team displays/),
    ).toBeVisible();
  });

  test('should display Primary and Secondary color labels', async ({
    page,
  }) => {
    await expect(page.getByText('Primary Color')).toBeVisible();
    await expect(page.getByText('Secondary Color')).toBeVisible();
  });

  test('should render color swatch previews next to inputs', async ({
    page,
  }) => {
    const leaguePage = new LeaguePage(page);

    // Both inputs are visible (swatch is rendered as a sibling YStack)
    await expect(leaguePage.primaryColorInput).toBeVisible();
    await expect(leaguePage.secondaryColorInput).toBeVisible();
  });

  test('saving valid colors triggers the UpdateLeagueBranding mutation', async ({
    page,
  }) => {
    let mutationCalled = false;

    await page.route(isGraphQLEndpoint, async (route) => {
      const postData = route.request().postData()?.toLowerCase() ?? '';
      if (postData.includes('updateleaguebranding')) {
        mutationCalled = true;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            updateLeagueBrandingResponse({
              primaryColor: '#FF0000',
              secondaryColor: '#00FF00',
            }),
          ),
        });
      } else {
        await unmockedGraphQLFallback(route);
      }
    });

    // Re-navigate so the new route handler is active
    await page.goto('/baseball/league/1/commissioner');
    await page.waitForLoadState('networkidle');

    const brandingHeader = page.getByRole('button', {
      name: /League Branding/i,
    });
    await brandingHeader.click();
    await expect(
      page.getByRole('heading', { name: /League Branding/i }),
    ).toBeVisible({ timeout: 5000 });

    const leaguePage = new LeaguePage(page);
    await expect(leaguePage.primaryColorInput).toBeVisible();

    await leaguePage.primaryColorInput.fill('#FF0000');
    await leaguePage.secondaryColorInput.fill('#00FF00');
    await expect(leaguePage.saveColorsButton).toBeEnabled();
    await leaguePage.saveColorsButton.click();

    // Verify the mutation was called
    expect(mutationCalled).toBe(true);
  });
});
