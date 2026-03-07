import { test } from '@playwright/test';
import { SnapshotUtils } from '../support/snapshot-utils';

test.describe('Draft Board - Responsive @regression', () => {
  test('captures responsive snapshots for /baseball/draft', async ({
    page,
  }) => {
    await page.goto('/baseball/draft');
    await SnapshotUtils.waitForImages(page);

    // Full page responsive set using default sizes
    await SnapshotUtils.captureResponsiveSnapshots(
      page,
      'draft-board-responsive',
    );
  });
});
