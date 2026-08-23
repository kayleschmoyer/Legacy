import { test } from '../fixtures';
import { DraftPom } from '../pages/draft.pom';
test('draft', async ({ page }) => {
  const pom = new DraftPom(page);
  await pom.goto(7);
});
