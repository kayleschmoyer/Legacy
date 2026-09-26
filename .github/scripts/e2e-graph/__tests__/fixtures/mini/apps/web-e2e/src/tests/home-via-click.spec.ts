// LS-10239: this spec never calls page.goto('/') anywhere in its closure —
// it reaches the home route only through a UI click, confirmed via
// toHaveURL(). The cross-file HOME_PATH const (imported from ../support/routes,
// not declared in this file) must still resolve.
import { test } from '../fixtures';
import { HOME_PATH } from '../support/routes';
test('home via click', async ({ page }) => {
  await page.getByRole('link', { name: 'logo' }).click();
  await expect(page).toHaveURL(HOME_PATH);
  await page.waitForURL(HOME_PATH);
});
