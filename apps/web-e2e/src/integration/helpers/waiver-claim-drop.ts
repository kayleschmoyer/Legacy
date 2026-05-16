import { expect, type Page } from '@playwright/test';

/**
 * Inside an open WaiverClaim modal that may be in "select a player to drop"
 * mode (full roster) or "Roster has space" mode (empty slot), select a drop
 * candidate when required. Resolves quickly when no drop is needed.
 *
 * Try selectors in order: dedicated data-testid (cleanest), role="option"
 * (a11y-correct), then a coordinate-based fallback for older modal builds.
 * Returns whether a drop was selected (true) or skipped (false).
 */
export async function selectDropPlayerIfRosterFull(
  page: Page,
): Promise<boolean> {
  const dropPrompt = page.getByText(/select a player to drop/i);
  if (!(await dropPrompt.isVisible())) {
    return false;
  }

  const byTestId = page.locator('[data-testid^="drop-player-"]').first();
  if (await byTestId.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await byTestId.click();
  } else {
    const byRole = page.getByRole('option', { name: /^Drop /i }).first();
    if (await byRole.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await byRole.click();
    } else {
      // Last resort: find a cursor:pointer element inside the modal and
      // click its centroid. Older builds rendered the row without a stable
      // role or test id.
      const rect = await page.evaluate(() => {
        const modal = document.querySelector<HTMLElement>(
          '[aria-labelledby="claim-title"]',
        );
        if (!modal) return null;
        const divs = modal.querySelectorAll<HTMLElement>('div');
        for (const div of divs) {
          if (
            getComputedStyle(div).cursor === 'pointer' &&
            div.children.length >= 2
          ) {
            const box = div.getBoundingClientRect();
            return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
          }
        }
        return null;
      });
      if (rect) {
        await page.mouse.click(rect.x, rect.y);
      }
    }
  }

  // Confirm the selection landed.
  await expect(page.getByText('Dropping')).toBeVisible({ timeout: 5_000 });
  return true;
}
