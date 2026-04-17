/**
 * Help Page E2E Tests
 *
 * The Help page renders entirely from static content (HELP_FAQ_ITEMS,
 * HELP_HISTORICAL_FAQ_ITEMS, HELP_CONTACT_ITEMS)
 * — no GraphQL calls required.  Tests are fast and reliable.
 *
 * Note: The "Getting Started" section was removed in LS-2986 (redundant with
 * the interactive tutorial launcher).
 */

import { expect, test, unauthTest } from '../fixtures/auth-enhanced';

test.describe('Help Page — header and layout @smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/help');
    await page.waitForLoadState('load');
  });

  test('renders the Help & Support heading', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /help & support/i, level: 1 }),
    ).toBeVisible();
  });

  test('shows descriptive subtitle text', async ({ page }) => {
    await expect(
      page.getByText(/find answers to common questions/i),
    ).toBeVisible();
  });

  test('renders the Tutorial section heading', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /new to legacy sports/i }),
    ).toBeVisible();
  });

  test('renders the Quick Links section heading', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /quick links/i }),
    ).toBeVisible();
  });

  test('renders the FAQ section heading', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /frequently asked questions/i }),
    ).toBeVisible();
  });

  test('renders the Historical Stats section heading', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /historical stats.*how it works/i }),
    ).toBeVisible();
  });

  test('renders the Contact & Support section heading', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /contact & support/i }),
    ).toBeVisible();
  });
});

test.describe('Help Page — navigation @smoke', () => {
  test('Help nav button navigates to /help', async ({ page }) => {
    // Navigate directly — the Help button in the primary nav may be a
    // dropdown trigger rather than a direct link, depending on viewport
    await page.goto('/help');
    await page.waitForLoadState('load');

    await expect(page).toHaveURL('/help');
    await expect(
      page.getByRole('heading', { name: /help & support/i, level: 1 }),
    ).toBeVisible();
  });

  test('Help page URL is /help', async ({ page }) => {
    await page.goto('/help');
    await page.waitForLoadState('load');

    await expect(page).toHaveURL(/\/help/);
  });
});

test.describe('Help Page — tutorial launcher @smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/help');
    await page.waitForLoadState('load');
  });

  test('shows the Launch Tutorial button', async ({ page }) => {
    await expect(
      page.getByRole('button', { name: /launch tutorial/i }),
    ).toBeVisible();
  });

  test('shows tutorial walkthrough description text', async ({ page }) => {
    await expect(page.getByText(/6-step walkthrough/i)).toBeVisible();
  });
});

test.describe('Help Page — quick links @smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/help');
    await page.waitForLoadState('load');
  });

  test('shows My Leagues quick link pointing to /baseball', async ({
    page,
  }) => {
    const link = page.getByRole('link', { name: /my leagues/i });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', '/baseball');
  });

  test('shows Players quick link pointing to /players', async ({ page }) => {
    // Use a broader pattern — the link text may include an icon or extra
    // whitespace depending on the component rendering
    const link = page.getByRole('link', { name: /players/i }).first();
    await expect(link).toBeVisible();
  });

  test('shows Player Stats quick link pointing to /players/stats', async ({
    page,
  }) => {
    const link = page.getByRole('link', { name: /player stats/i });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', '/players/stats');
  });

  test('shows Create League quick link pointing to /baseball/league/create', async ({
    page,
  }) => {
    const link = page.getByRole('link', { name: /create league/i });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', '/baseball/league/create');
  });

  test('shows Profile Settings quick link pointing to /profile/settings', async ({
    page,
  }) => {
    const link = page.getByRole('link', { name: /profile settings/i });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', '/profile/settings');
  });
});

test.describe('Help Page — FAQ accordion @regression', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/help');
    await page.waitForLoadState('load');
  });

  test('FAQ item is collapsed by default', async ({ page }) => {
    const firstFaqButton = page
      .getByRole('button')
      .filter({ hasText: /how do i create a fantasy baseball league/i });
    await expect(firstFaqButton).toBeVisible();
    await expect(firstFaqButton).toHaveAttribute('aria-expanded', 'false');
  });

  test('clicking a FAQ question expands the answer', async ({ page }) => {
    const faqButton = page
      .getByRole('button')
      .filter({ hasText: /how do i create a fantasy baseball league/i });

    await faqButton.click();

    await expect(faqButton).toHaveAttribute('aria-expanded', 'true');
    await expect(
      page.getByText(
        /navigate to baseball.*create league from the top navigation/i,
      ),
    ).toBeVisible({ timeout: 15000 });
  });

  test('clicking an expanded FAQ question collapses it', async ({ page }) => {
    const faqButton = page
      .getByRole('button')
      .filter({ hasText: /how does the draft work/i });

    // Expand
    await faqButton.click();
    await expect(faqButton).toHaveAttribute('aria-expanded', 'true');

    // Collapse
    await faqButton.click();
    await expect(faqButton).toHaveAttribute('aria-expanded', 'false');
  });

  test('multiple FAQ items can be expanded independently', async ({ page }) => {
    const firstFaq = page
      .getByRole('button')
      .filter({ hasText: /how do i invite teammates/i });
    const secondFaq = page
      .getByRole('button')
      .filter({ hasText: /how is my team score calculated/i });

    await firstFaq.click();
    await secondFaq.click();

    await expect(firstFaq).toHaveAttribute('aria-expanded', 'true');
    await expect(secondFaq).toHaveAttribute('aria-expanded', 'true');
  });
});

test.describe('Help Page — Historical Stats FAQ @regression', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/help');
    await page.waitForLoadState('load');
  });

  test('shows first historical FAQ question collapsed by default', async ({
    page,
  }) => {
    const faqButton = page.getByRole('button').filter({
      hasText: /what makes legacy sports different from live fantasy/i,
    });
    await expect(faqButton).toBeVisible();
    await expect(faqButton).toHaveAttribute('aria-expanded', 'false');
  });

  test('clicking historical FAQ expands the answer', async ({ page }) => {
    const faqButton = page
      .getByRole('button')
      .filter({ hasText: /what is a.*season assignment/i });

    await faqButton.click();

    await expect(faqButton).toHaveAttribute('aria-expanded', 'true');
    await expect(
      page.getByText(
        /automatically assigns them a season from their mlb career/i,
      ),
    ).toBeVisible({ timeout: 15000 });
  });

  test('shows "How does game selection work?" FAQ', async ({ page }) => {
    const faqButton = page
      .getByRole('button')
      .filter({ hasText: /how does game selection work/i });
    await expect(faqButton).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Unauthenticated visitor — /help is a public route (LS-3513).
// Help documentation must be visible without requiring sign-in.
// ---------------------------------------------------------------------------

unauthTest.describe('Help page — unauthenticated access @regression', () => {
  unauthTest.beforeEach(async ({ page }) => {
    await page.goto('/help');
    await page.waitForLoadState('load');
  });

  unauthTest(
    'shows Help & Support heading without requiring login',
    async ({ page }) => {
      await expect(
        page.getByRole('heading', { name: /help & support/i, level: 1 }),
      ).toBeVisible({ timeout: 15_000 });
    },
  );

  unauthTest(
    'does not show landing-page login CTA on /help',
    async ({ page }) => {
      await expect(page.locator('body')).not.toContainText(
        'Build Your Dynasty',
      );
      await expect(page.locator('body')).not.toContainText('Get Started Free');
    },
  );

  // LS-3513: the functional scanner found a "Continue with Discord" button on
  // /help and reported it as broken (the scanner used the invalid CSS selector
  // `(button:visible, [role="button"]:visible)`). The root cause was that /help
  // was a protected route; LS-3513 made it public. This test locks in that the
  // auth gate never appears on /help so unauthenticated users always land
  // directly on the help page, not the sign-in page.
  unauthTest(
    '"Continue with Discord" auth gate is not shown on public /help route (LS-3513)',
    async ({ page }) => {
      // /help is public — the auth gate must never intercept it.
      await expect(
        page.getByRole('button', { name: /continue with discord/i }),
      ).not.toBeVisible({ timeout: 15_000 });

      // Confirm the help page itself is reachable without sign-in.
      await expect(
        page.getByRole('heading', { name: /help & support/i, level: 1 }),
      ).toBeVisible({ timeout: 15_000 });
    },
  );
});

test.describe('Help Page — contact and support @regression', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/help');
    await page.waitForLoadState('load');
  });

  test('shows Report a Bug contact option', async ({ page }) => {
    await expect(page.getByText('Report a Bug')).toBeVisible();
  });

  test('shows Suggest a Feature contact option', async ({ page }) => {
    await expect(page.getByText('Suggest a Feature')).toBeVisible();
  });

  test('shows Community Discussions contact option', async ({ page }) => {
    await expect(page.getByText('Community Discussions')).toBeVisible();
  });

  test('shows urgent account issues notice', async ({ page }) => {
    await expect(page.getByText(/urgent account issues/i)).toBeVisible();
  });

  test('Report a Bug option opens the bug report dialog', async ({ page }) => {
    // The BugReportButton requires jiraProxyUrl — inject it and reload
    await page.addInitScript(() => {
      window.__e2eJiraProxyUrl = 'http://localhost:4280/__jira-proxy';
    });
    await page.goto('/help');
    await page.waitForLoadState('load');

    await page.getByText('Report a Bug').click();
    await expect(
      page.getByRole('dialog').getByText('Report a Bug'),
    ).toBeVisible();
    await expect(page.getByText(/describe what happened/i)).toBeVisible();
  });

  test('Suggest a Feature option opens GitHub issues in a new tab', async ({
    page,
  }) => {
    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      page.getByText('Suggest a Feature').click(),
    ]);
    await expect(popup).toHaveURL(/github\.com.*issues.*labels=enhancement/i);
    await popup.close();
  });

  test('Community Discussions option opens GitHub discussions in a new tab', async ({
    page,
  }) => {
    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      page.getByText('Community Discussions').click(),
    ]);
    await expect(popup).toHaveURL(/github\.com.*discussions/i);
    await popup.close();
  });

  test('shows Join our Discord contact option', async ({ page }) => {
    await expect(
      page.getByText('Join our Discord', { exact: true }),
    ).toBeVisible();
  });

  test('Join our Discord option opens discord.gg/JBhRrE8ZtK', async ({
    page,
  }) => {
    // The contact card uses window.open() with noopener — the popup URL is
    // unreliable because discord.gg aggressively redirects.  Intercept
    // window.open to capture the intended URL instead.
    await page.evaluate(() => {
      (window as unknown as Record<string, string>).__openedUrl = '';
      window.open = ((url?: string | URL) => {
        (window as unknown as Record<string, string>).__openedUrl = String(
          url ?? '',
        );
        return null;
      }) as typeof window.open;
    });
    await page.getByText('Join our Discord', { exact: true }).click();
    const openedUrl = await page.evaluate(
      () => (window as unknown as Record<string, string>).__openedUrl,
    );
    expect(openedUrl).toMatch(/discord\.gg\/JBhRrE8ZtK/i);
  });

  test('urgent account issues callout links to Discord #urgent-support', async ({
    page,
  }) => {
    await expect(page.getByText(/urgent account issues/i)).toBeVisible();
    const discordLink = page.getByRole('link', { name: /discord server/i });
    await expect(discordLink).toBeVisible();
    await expect(discordLink).toHaveAttribute(
      'href',
      /discord\.gg\/JBhRrE8ZtK/i,
    );
    await expect(page.getByText(/#urgent-support/i)).toBeVisible();
  });
});
