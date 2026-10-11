/**
 * PlayersPage native-driver construction contract (LS-8452, ADR-0016).
 *
 * The player `*.dual.spec.ts` shared specs (player-stats-search,
 * player-compare-search) speak only the portable `stats`/`compare` verbs and
 * `driver.open()` navigation, so they must run on the native Playwright project
 * once an Appium driver lands (LS-8449). The precondition is that `PlayersPage`
 * CONSTRUCTS on a driver that is not the {@link PlaywrightWebDriver} — before
 * LS-8452 its constructor hard-threw unless given the web driver, which would
 * have made both dual specs fail to even build `playersPage` on native.
 *
 * These pure unit tests pin that contract without an emulator: a minimal non-web
 * {@link AppDriver} stub (the ADR-0016 native capability profile — all false)
 * must build the object and its portable surfaces, while every documented
 * web-only remainder throws a descriptive error rather than silently no-op'ing.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import type {
  AppDriver,
  DriverCapabilities,
  UIElement,
  UIRole,
} from '../driver';
import { PlayersPage } from '../pages';

/**
 * A self-chaining element stub. No verb is invoked during construction, so the
 * action/read/assert surface throws if ever reached — a real native driver, not
 * this stub, implements those. The scope methods return `this` so
 * construction-time chains (e.g. the page-size `<select>`'s `.byRole`) resolve.
 */
class StubElement implements UIElement {
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

  #unsupported(): never {
    throw new Error('StubElement: verbs are not exercised by construction');
  }
  tap(): Promise<void> {
    return this.#unsupported();
  }
  fill(): Promise<void> {
    return this.#unsupported();
  }
  clear(): Promise<void> {
    return this.#unsupported();
  }
  press(): Promise<void> {
    return this.#unsupported();
  }
  selectOption(): Promise<void> {
    return this.#unsupported();
  }
  count(): Promise<number> {
    return this.#unsupported();
  }
  isVisible(): Promise<boolean> {
    return this.#unsupported();
  }
  isEnabled(): Promise<boolean> {
    return this.#unsupported();
  }
  text(): Promise<string> {
    return this.#unsupported();
  }
  allTexts(): Promise<string[]> {
    return this.#unsupported();
  }
  optionValues(): Promise<string[]> {
    return this.#unsupported();
  }
  value(): Promise<string> {
    return this.#unsupported();
  }
  attribute(): Promise<string | null> {
    return this.#unsupported();
  }
  boundingBox(): Promise<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null> {
    return this.#unsupported();
  }
  expectVisible(): Promise<void> {
    return this.#unsupported();
  }
  expectHidden(): Promise<void> {
    return this.#unsupported();
  }
  expectEnabled(): Promise<void> {
    return this.#unsupported();
  }
  expectDisabled(): Promise<void> {
    return this.#unsupported();
  }
  expectAttached(): Promise<void> {
    return this.#unsupported();
  }
  expectNotAttached(): Promise<void> {
    return this.#unsupported();
  }
  expectCount(): Promise<void> {
    return this.#unsupported();
  }
  expectValue(): Promise<void> {
    return this.#unsupported();
  }
  expectAttribute(): Promise<void> {
    return this.#unsupported();
  }
  expectContainsText(): Promise<void> {
    return this.#unsupported();
  }
  expectNonEmptyText(): Promise<void> {
    return this.#unsupported();
  }
}

/** Non-web driver stub mirroring the ADR-0016 native capability profile. */
class NativeStubDriver implements AppDriver {
  readonly capabilities: DriverCapabilities = {
    networkMock: false,
    clock: false,
    trace: false,
    hover: false,
    multiWindow: false,
  };
  open(): Promise<void> {
    return Promise.resolve();
  }
  byTestId(): UIElement {
    return new StubElement();
  }
  byTestIdPrefix(): UIElement {
    return new StubElement();
  }
  byRole(_role: UIRole): UIElement {
    return new StubElement();
  }
  byText(): UIElement {
    return new StubElement();
  }
  byPlaceholder(): UIElement {
    return new StubElement();
  }
  byLabel(): UIElement {
    return new StubElement();
  }
}

void test('PlayersPage constructs on a non-web (native-profile) driver', () => {
  const driver = new NativeStubDriver();
  let playersPage: PlayersPage | undefined;
  assert.doesNotThrow(() => {
    playersPage = new PlayersPage(driver);
  });
  // Portable surfaces the dual specs consume must be present.
  assert.ok(playersPage?.stats, 'stats surface should be constructed');
  assert.ok(playersPage?.compare, 'compare surface should be constructed');
  assert.ok(playersPage?.detail, 'detail surface should be constructed');
});

void test('web-only remainders throw a descriptive error off-web', async () => {
  const playersPage = new PlayersPage(new NativeStubDriver());

  // premiumGate is composed from a raw Locator root — web-only.
  assert.throws(() => playersPage.premiumGate, /web-only|native driver/i);

  // gotoDetail/gotoBrefId use page.goto + waitForLoadState — web-only.
  await assert.rejects(
    () => playersPage.gotoDetail(1),
    /web-only|native driver/i,
  );
  await assert.rejects(
    () => playersPage.gotoBrefId('bondsba01'),
    /web-only|native driver/i,
  );

  // A compare web-only remainder (blur) throws; a portable read does not exist
  // to call here without a live element, so we assert the remainder guard only.
  await assert.rejects(
    () => playersPage.compare.blurSearch(),
    /web-only|native driver/i,
  );
});
