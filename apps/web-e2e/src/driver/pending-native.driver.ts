import type { AppDriver, DriverCapabilities, UIElement } from './types';

/**
 * Native platform seam (ADR-0016 native rollout blueprint, step 3 — LS-8449).
 *
 * The `platform: 'native'` projects (see `playwright.native.config.ts`) select
 * a native {@link AppDriver} the same way `backend` selects a data seam. The
 * real driver — `AppiumNativeDriver`, wdio-backed — is delivered by LS-8447.
 * Until it lands this placeholder occupies the seam so the platform fixture,
 * the native project layout, and the capability-gating convention can ship and
 * be exercised independently.
 *
 * What is real here (and stays real once LS-8447 lands): the native capability
 * profile. Every capability is `false`, matching the blueprint — native has no
 * in-process network interception, no clock injection, no Playwright trace, no
 * pointer hover, and no multi-context sessions. Specs that need one of these
 * gate on it explicitly (`test.skip(!driver.capabilities.clock, …)`) so a
 * missing capability is a scoping decision, never a runtime failure (ADR-0016
 * §capability model). Because the fixture resolves this object before the test
 * body runs, those `test.skip` guards evaluate and skip cleanly rather than
 * erroring.
 *
 * What is a placeholder: element access and navigation throw. A native project
 * therefore runs a shared spec only as far as its capability guards allow —
 * gated specs skip; an ungated spec that actually drives the UI fails loudly
 * with the pointer below rather than silently mis-behaving. Native execution in
 * CI is not wired until the Appium driver (LS-8447), the per-worker mock server
 * (LS-8448), and emulator provisioning (LS-8450) land, so nothing exercises
 * these throwing paths in PR CI today.
 */

const NATIVE_CAPABILITIES: DriverCapabilities = {
  networkMock: false,
  clock: false,
  trace: false,
  hover: false,
  multiWindow: false,
};

function notImplemented(): never {
  throw new Error(
    'Native AppDriver interaction is not implemented yet (LS-8447). The ' +
      'native platform seam — capability profile, platform fixture, and ' +
      'native project layout — is in place (LS-8449); element access and ' +
      'navigation land with the Appium driver implementation.',
  );
}

/**
 * A {@link UIElement} whose queries chain (so page objects construct without
 * error) but whose actions, reads, and assertions throw. Scope/navigation
 * methods return `this`: an element is a lazy query, so building one is inert
 * until a terminal operation runs.
 */
class UnavailableNativeElement implements UIElement {
  // ── Scope / navigation (lazy — return the same query) ─────────────
  byTestId(): UIElement {
    return this;
  }
  byTestIdPrefix(): UIElement {
    return this;
  }
  byRole(): UIElement {
    return this;
  }
  byText(): UIElement {
    return this;
  }
  byPlaceholder(): UIElement {
    return this;
  }
  byLabel(): UIElement {
    return this;
  }
  first(): UIElement {
    return this;
  }
  last(): UIElement {
    return this;
  }
  filterByText(): UIElement {
    return this;
  }
  visible(): UIElement {
    return this;
  }

  // ── Actions ───────────────────────────────────────────────────────
  tap(): Promise<void> {
    return notImplemented();
  }
  fill(): Promise<void> {
    return notImplemented();
  }
  clear(): Promise<void> {
    return notImplemented();
  }
  press(): Promise<void> {
    return notImplemented();
  }
  selectOption(): Promise<void> {
    return notImplemented();
  }

  // ── Reads ─────────────────────────────────────────────────────────
  count(): Promise<number> {
    return notImplemented();
  }
  isVisible(): Promise<boolean> {
    return notImplemented();
  }
  isEnabled(): Promise<boolean> {
    return notImplemented();
  }
  text(): Promise<string> {
    return notImplemented();
  }
  allTexts(): Promise<string[]> {
    return notImplemented();
  }
  optionValues(): Promise<string[]> {
    return notImplemented();
  }
  value(): Promise<string> {
    return notImplemented();
  }
  attribute(): Promise<string | null> {
    return notImplemented();
  }
  boundingBox(): Promise<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null> {
    return notImplemented();
  }

  // ── Retrying assertions ───────────────────────────────────────────
  expectVisible(): Promise<void> {
    return notImplemented();
  }
  expectHidden(): Promise<void> {
    return notImplemented();
  }
  expectEnabled(): Promise<void> {
    return notImplemented();
  }
  expectDisabled(): Promise<void> {
    return notImplemented();
  }
  expectAttached(): Promise<void> {
    return notImplemented();
  }
  expectNotAttached(): Promise<void> {
    return notImplemented();
  }
  expectCount(): Promise<void> {
    return notImplemented();
  }
  expectValue(): Promise<void> {
    return notImplemented();
  }
  expectAttribute(): Promise<void> {
    return notImplemented();
  }
  expectContainsText(): Promise<void> {
    return notImplemented();
  }
  expectNonEmptyText(): Promise<void> {
    return notImplemented();
  }
}

/**
 * Placeholder native {@link AppDriver} — carries the real native capability
 * profile so capability gating works; every interaction throws until LS-8447
 * supplies the Appium implementation.
 */
class PendingNativeDriver implements AppDriver {
  readonly capabilities: DriverCapabilities = NATIVE_CAPABILITIES;
  readonly #element: UIElement = new UnavailableNativeElement();

  open(): Promise<void> {
    return notImplemented();
  }

  byTestId(): UIElement {
    return this.#element;
  }
  byTestIdPrefix(): UIElement {
    return this.#element;
  }
  byRole(): UIElement {
    return this.#element;
  }
  byText(): UIElement {
    return this.#element;
  }
  byPlaceholder(): UIElement {
    return this.#element;
  }
  byLabel(): UIElement {
    return this.#element;
  }
}

/**
 * Construct the native {@link AppDriver} the `platform: 'native'` fixture
 * injects. Returns the placeholder until LS-8447 swaps in `AppiumNativeDriver`;
 * the fixture and native projects reference only this factory, so that swap is
 * a one-line change here.
 */
export function createNativeDriver(): AppDriver {
  return new PendingNativeDriver();
}
