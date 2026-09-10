import { test } from '../fixtures';
test('redirect', async ({ page }) => {
  await page.goto('/home');
});
