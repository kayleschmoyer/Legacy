import type { AppDriver, UIElement } from '../driver';
import { BaseScreen } from '../base/base.screen';
import { StepUpChallenge } from '../components/step-up-challenge.component';

/**
 * Partial page object for the subscription / billing page
 * (`/profile/subscription`), migrated to the platform-neutral driver (ADR-0016)
 * for the step-up challenge flow (LS-8463). Exposes only the billing action that
 * gates behind a step-up re-auth and the challenge component it raises — other
 * subscription surfaces stay in the raw-Playwright `subscription.spec.ts` until
 * their specs are touched (ADR-0016 opportunistic-migration rule).
 */
export class SubscriptionScreen extends BaseScreen {
  readonly #manageButton: UIElement;
  readonly #stepUp: StepUpChallenge;

  constructor(driver: AppDriver) {
    super(driver);
    // The premium CTA reads "Manage Subscription"; match the historical billing
    // labels too so a copy change doesn't silently break the locator.
    this.#manageButton = driver
      .byRole('button', {
        name: /manage subscription|manage billing|billing portal/i,
      })
      .first();
    // The modal is a fixed overlay with no container test id — scope the
    // challenge to the page (the driver is itself an ElementScope).
    this.#stepUp = new StepUpChallenge(driver);
  }

  /** The step-up re-authentication challenge raised by the billing action. */
  get stepUp(): StepUpChallenge {
    return this.#stepUp;
  }

  /** Navigate to `/profile/subscription`. */
  async goto(): Promise<void> {
    await this.open('/profile/subscription');
  }

  /**
   * Trigger the billing-management action. It gates behind a step-up challenge,
   * so the {@link stepUp} component prompts after this resolves (unless a fresh
   * step-up already exists).
   */
  async openBillingPortal(): Promise<void> {
    await this.#manageButton.expectVisible({ timeout: 15000 });
    await this.#manageButton.tap();
  }
}
