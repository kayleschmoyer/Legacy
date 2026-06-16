import { expect, type Locator } from '@playwright/test';

import { BaseComponent } from '../base/base.component';

/**
 * Reusable component for the premium-gate overlay (ADR-0015 §2).
 *
 * The web `PremiumGate` (apps/web/src/components/PremiumGate.tsx) renders a
 * blurred-content tease behind a gradient overlay card for free users. The
 * overlay card is marked `data-testid="premium-feature-gate"` and contains a
 * lock icon, a "Premium Feature" title, a feature description, and an
 * "Upgrade to Premium" CTA that opens the upgrade modal. Premium users get no
 * overlay at all.
 *
 * This object is scoped to the overlay root so any premium-gated page composes
 * it the same way — `/players/stats`, the V2 league surfaces, and `/roster`
 * (LS-7878) all wrap their content in the same `PremiumGate`. It is scoped to a
 * root `Locator` rather than a route (ADR-0015 §2) and keeps its locators
 * PRIVATE, exposing only the three semantic surfaces.
 *
 * Note: the player-comparison page is gated by the inline `PremiumBanner`
 * (LS-7012), NOT this overlay — assert that CTA via `PlayersPage`'s compare
 * surface, not this component.
 */
export class PremiumGate extends BaseComponent {
  readonly #upgradeButton: Locator;

  /**
   * @param root the overlay locator — `page.getByTestId('premium-feature-gate')`
   *   (or a region-scoped equivalent when a page hosts more than one gate).
   */
  constructor(root: Locator) {
    super(root);
    this.#upgradeButton = root.getByRole('button', {
      name: /upgrade to premium/i,
    });
  }

  // ── Actions ──────────────────────────────────────────────────────

  /** Click the "Upgrade to Premium" CTA, opening the upgrade modal. */
  async clickUpgrade(): Promise<void> {
    await this.#upgradeButton.click();
  }

  // ── Reads ────────────────────────────────────────────────────────

  /** Whether the gate overlay is currently rendered (free users only). */
  async isPresent(): Promise<boolean> {
    return (await this.root.count()) > 0;
  }

  // ── Assertions ───────────────────────────────────────────────────

  /** Assert the gate overlay is visible (the content is locked). */
  async expectVisible(): Promise<void> {
    await expect(this.root).toBeVisible({ timeout: 15000 });
  }

  /** Assert the gate overlay is not rendered (premium users see no gate). */
  async expectAbsent(): Promise<void> {
    await expect(this.root).toHaveCount(0);
  }

  /** Assert the "Upgrade to Premium" CTA is visible. */
  async expectUpgradeCtaVisible(): Promise<void> {
    await expect(this.#upgradeButton).toBeVisible({ timeout: 15000 });
  }

  /** Assert the gate shows the given feature description text. */
  async expectFeatureDescription(text: string | RegExp): Promise<void> {
    await expect(this.root.getByText(text)).toBeVisible({ timeout: 15000 });
  }
}
