import { test } from '../fixtures';
const ROUTES = ['/about', '/league/1/draft'];
test('loop', async ({ page }) => {
  for (const route of ROUTES) {
    await page.goto(route);
  }
});
