import { test } from '../fixtures/auth-enhanced';
import { SnapshotUtils } from '../support/snapshot-utils';

test.describe('Baseball Landing Page - Responsive @visual', () => {
  test('captures responsive snapshots for /baseball', async ({ page }) => {
    await page.goto('/baseball');
    await page.waitForLoadState('networkidle');
    await SnapshotUtils.waitForImages(page);

    // Full page responsive set
    await SnapshotUtils.captureResponsiveSnapshots(
      page,
      'baseball-landing-responsive',
    );

    // Capture league grid component if present
    const gridSelector = '[data-testid="leagues-grid"]';
    if (await page.locator(gridSelector).first().isVisible()) {
      await SnapshotUtils.captureComponentStates(
        page,
        gridSelector,
        'baseball-leagues-grid',
      );
    }
  });
});
