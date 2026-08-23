import { test } from '../fixtures';
test('about', async ({ page }) => {
  await page.goto('/about');
});
