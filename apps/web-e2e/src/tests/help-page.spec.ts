/**
 * Help Page E2E Tests
 *
 * The Help page renders entirely from static content (HELP_FAQ_ITEMS,
 * HELP_HISTORICAL_FAQ_ITEMS, HELP_GETTING_STARTED_STEPS, HELP_CONTACT_ITEMS)
 * — no GraphQL calls required.  Tests are fast and reliable.
 */

import { expect, test } from '@playwright/test';

test.describe('Help Page — header and layout @smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/help');
    await page.waitForLoadState('load');
  });

  test('renders the Help & Support heading', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /help & support/i, level: 1 }),
    ).toBeVisible({ timeout: 30000 });
  });

  test('shows descriptive subtitle text', async ({ page }) => {
    await expect(
      page.getByText(/find answers to common questions/i),
    ).toBeVisible({ timeout: 30000 });
  });

  test('renders the Tutorial section heading', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /new to legacy sports/i }),
    ).toBeVisible({ timeout: 30000 });
  });

  test('renders the Quick Links section heading', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /quick links/i }),
    ).toBeVisible({ timeout: 30000 });
  });

  test('renders the FAQ section heading', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /frequently asked questions/i }),
    ).toBeVisible({ timeout: 30000 });
  });

  test('renders the Historical Stats section heading', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /historical stats.*how it works/i }),
    ).toBeVisible({ timeout: 30000 });
  });

  test('renders the Getting Started section heading', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /getting started/i }),
    ).toBeVisible({ timeout: 30000 });
  });

  test('renders the Contact & Support section heading', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /contact & support/i }),
    ).toBeVisible({ timeout: 30000 });
  });
});

test.describe('Help Page — navigation @smoke', () => {
  test('Help nav link navigates to /help', async ({ page }) => {
    await page.goto('/about');
    await page.waitForLoadState('load');

    const primaryNav = page.getByRole('navigation', { name: 'Primary' });
    const helpLink = primaryNav.getByRole('link', { name: /help/i });
    await helpLink.click();
    await page.waitForLoadState('load');

    await expect(page).toHaveURL('/help');
    await expect(
      page.getByRole('heading', { name: /help & support/i, level: 1 }),
    ).toBeVisible({ timeout: 30000 });
  });

  test('Help nav link is marked as current page when on /help', async ({
    page,
  }) => {
    await page.goto('/help');
    await page.waitForLoadState('load');

    const helpLink = page.locator(
      '[role="navigation"][aria-label="Primary"] a[href="/help"][aria-current="page"]',
    );
    await expect(helpLink).toBeVisible({ timeout: 30000 });
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
    ).toBeVisible({ timeout: 30000 });
  });

  test('shows tutorial walkthrough description text', async ({ page }) => {
    await expect(page.getByText(/6-step walkthrough/i)).toBeVisible({
      timeout: 30000,
    });
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
    await expect(link).toBeVisible({ timeout: 30000 });
    await expect(link).toHaveAttribute('href', '/baseball');
  });

  test('shows Players quick link pointing to /players', async ({ page }) => {
    const link = page.getByRole('link', { name: /^players$/i });
    await expect(link).toBeVisible({ timeout: 30000 });
    await expect(link).toHaveAttribute('href', '/players');
  });

  test('shows Player Stats quick link pointing to /players/stats', async ({
    page,
  }) => {
    const link = page.getByRole('link', { name: /player stats/i });
    await expect(link).toBeVisible({ timeout: 30000 });
    await expect(link).toHaveAttribute('href', '/players/stats');
  });

  test('shows Create League quick link pointing to /baseball/league/create', async ({
    page,
  }) => {
    const link = page.getByRole('link', { name: /create league/i });
    await expect(link).toBeVisible({ timeout: 30000 });
    await expect(link).toHaveAttribute('href', '/baseball/league/create');
  });

  test('shows Profile Settings quick link pointing to /profile/settings', async ({
    page,
  }) => {
    const link = page.getByRole('link', { name: /profile settings/i });
    await expect(link).toBeVisible({ timeout: 30000 });
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
    await expect(firstFaqButton).toBeVisible({ timeout: 30000 });
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
    await expect(faqButton).toBeVisible({ timeout: 30000 });
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
    await expect(faqButton).toBeVisible({ timeout: 30000 });
  });
});

test.describe('Help Page — getting started steps @smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/help');
    await page.waitForLoadState('load');
  });

  test('shows step 1: Create or join a league', async ({ page }) => {
    await expect(page.getByText(/create or join a league/i)).toBeVisible({
      timeout: 30000,
    });
  });

  test('shows step 2: Set your roster', async ({ page }) => {
    await expect(page.getByText(/set your roster/i)).toBeVisible({
      timeout: 30000,
    });
  });

  test('shows step 3: Follow the season', async ({ page }) => {
    await expect(page.getByText(/follow the season/i)).toBeVisible({
      timeout: 30000,
    });
  });

  test('shows step 4: Win the championship', async ({ page }) => {
    await expect(page.getByText(/win the championship/i)).toBeVisible({
      timeout: 30000,
    });
  });
});

test.describe('Help Page — contact and support @regression', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/help');
    await page.waitForLoadState('load');
  });

  test('shows Report a Bug contact option', async ({ page }) => {
    await expect(page.getByText('Report a Bug')).toBeVisible({
      timeout: 30000,
    });
  });

  test('shows Suggest a Feature contact option', async ({ page }) => {
    await expect(page.getByText('Suggest a Feature')).toBeVisible({
      timeout: 30000,
    });
  });

  test('shows Community Discussions contact option', async ({ page }) => {
    await expect(page.getByText('Community Discussions')).toBeVisible({
      timeout: 30000,
    });
  });

  test('shows urgent account issues notice', async ({ page }) => {
    await expect(page.getByText(/urgent account issues/i)).toBeVisible({
      timeout: 30000,
    });
  });

  test('Report a Bug option opens GitHub issues in a new tab', async ({
    page,
  }) => {
    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      page.getByText('Report a Bug').click(),
    ]);
    await expect(popup).toHaveURL(/github\.com.*issues.*labels=bug/i);
    await popup.close();
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
});
