/**
 * Analytics consent banner + Privacy choices panel (LS-10764).
 *
 * The region comes from the browser time zone, so each describe pins one:
 * EU visitors get the banner with analytics off until they choose; non-EU
 * visitors get no banner but can still open Cookie settings.
 */

import { expect, test } from '../fixtures/auth-enhanced';

const CONSENT_KEY = 'ls_consent';

/** The shared Dialog names an inner element, not the role="dialog" node. */
function privacyChoices(page: import('@playwright/test').Page) {
  return page.getByRole('dialog').filter({ hasText: 'Privacy choices' });
}

async function storedConsent(
  page: import('@playwright/test').Page,
): Promise<{ analytics: boolean; version: number } | null> {
  return page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    return raw
      ? (JSON.parse(raw) as { analytics: boolean; version: number })
      : null;
  }, CONSENT_KEY);
}

test.describe('Consent banner — EU visitor @regression', () => {
  test.use({ timezoneId: 'Europe/Berlin' });

  test('shows the banner, loads no GA before consent, and remembers Reject', async ({
    page,
  }) => {
    const gaRequests: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('googletagmanager.com'))
        gaRequests.push(req.url());
    });

    await page.goto('/privacy');
    const banner = page.getByRole('region', { name: 'Cookie consent' });
    await expect(banner).toBeVisible();
    expect(gaRequests).toEqual([]);

    await banner.getByRole('button', { name: 'Reject all' }).click();
    await expect(banner).toBeHidden();
    expect(await storedConsent(page)).toMatchObject({ analytics: false });

    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Privacy Policy' }),
    ).toBeVisible();
    await expect(banner).toBeHidden();
    expect(gaRequests).toEqual([]);
  });

  test('Manage choices opens the panel and Save stores the switch state', async ({
    page,
  }) => {
    await page.goto('/privacy');
    const banner = page.getByRole('region', { name: 'Cookie consent' });
    await banner.getByRole('button', { name: 'Manage choices' }).click();

    const dialog = privacyChoices(page);
    await expect(dialog).toBeVisible();
    const analytics = dialog.getByRole('switch');
    await expect(analytics).toHaveAttribute('aria-checked', 'false');

    await analytics.click();
    await dialog.getByRole('button', { name: 'Save choices' }).click();

    await expect(dialog).toBeHidden();
    await expect(banner).toBeHidden();
    expect(await storedConsent(page)).toMatchObject({ analytics: true });
  });
});

test.describe('Consent banner — non-EU visitor @regression', () => {
  test('shows no banner; Cookie settings opens the panel pre-filled', async ({
    page,
  }) => {
    await page.goto('/privacy');
    await expect(
      page.getByRole('heading', { name: 'Privacy Policy' }),
    ).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Cookie consent' }),
    ).toHaveCount(0);

    await page
      .getByRole('button', { name: 'Change your cookie settings' })
      .click();
    const dialog = privacyChoices(page);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('switch')).toHaveAttribute(
      'aria-checked',
      'true',
    );

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    expect(await storedConsent(page)).toBeNull();
  });
});
