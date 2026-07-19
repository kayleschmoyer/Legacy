import type { remote } from 'webdriverio';

import {
  androidKeycode,
  labelSelector,
  placeholderSelector,
  roleSelector,
  testIdPrefixSelector,
  testIdSelector,
  textSelector,
} from './native-selectors';
import type {
  AppDriver,
  DriverCapabilities,
  ExpectOptions,
  TextOptions,
  UIElement,
  UIRole,
} from './types';

/**
 * Native (Android / Appium) implementation of {@link AppDriver} (ADR-0016
 * §platform seam, native rollout blueprint step 1).
 *
 * A thin adapter over a WebdriverIO session (WebdriverIO + Appium +
 * UiAutomator2), the exact native counterpart of
 * {@link ./playwright-web.driver.PlaywrightWebDriver}. Page/component objects
 * migrated to {@link AppDriver}/`BaseScreen` (DraftPage + PlayerSearchBox are
 * the reference) drive the native app through this driver with **zero changes**
 * — the selector vocabulary and the retrying `expect*` surface behave
 * identically to web.
 *
 * ## Design (from ADR-0016 + the ticket)
 *
 * - **Injected session.** Like the web driver receives a Playwright `Page`, this
 *   receives an already-created wdio `Browser`. Session creation (capabilities,
 *   `disableWindowAnimation`, the app under test) lives in
 *   {@link ./appium-session.createAndroidSession} so the driver stays a pure
 *   adapter with no device/build knowledge — and no platform branches leak into
 *   page objects (ADR-0016 §4).
 * - **`open(path)` navigates via deep link.** expo-router routes are URL-shaped
 *   on native too, so `/baseball/league/7/draft` opens as
 *   `legacysports://baseball/league/7/draft` through Appium's `mobile: deepLink`.
 * - **Retrying assertions.** `expect*` polls via wdio `waitUntil` /
 *   `waitForDisplayed`, re-resolving the selector each tick — the same
 *   "wait until" determinism levers Playwright's web-first assertions give on
 *   web (ADR-0016; ADR-0015 §1). No sample-and-hope.
 * - **Selector vocabulary** maps to the Android accessibility tree via
 *   {@link ./native-selectors} (testID → accessibility id, role/name → a11y
 *   tree). The known Tamagui pitfall — `data-testid` dropped on some a11y
 *   buttons on web — must be verified to propagate `testID` on native for the
 *   same components; that verification runs on the emulator (the contract suite
 *   + reference migration), not in unit tests.
 *
 * ## Capabilities (honestly declared — ADR-0016 §capability model)
 *
 * `{ networkMock: false, clock: false, trace: false, hover: false,
 * multiWindow: false }`. A spec needing one of these gates on it explicitly
 * (`test.skip(!driver.capabilities.clock, …)`) — a missing capability is a
 * scoping decision, never a runtime surprise. In-process network mocking is
 * delivered separately by the per-worker GraphQL mock server (LS-8448), not by
 * the driver.
 */

/**
 * The wdio session, derived from `remote()` so no value import is needed. Used
 * for session-level commands (`waitUntil`) and cast to {@link AndroidCommands}
 * for the Appium/protocol commands the base typings don't surface.
 */
type NativeBrowser = Awaited<ReturnType<typeof remote>>;

/** Options for the wdio element `waitFor*` commands. */
interface WdioWaitOptions {
  timeout?: number;
  reverse?: boolean;
  timeoutMsg?: string;
}

/**
 * The minimal wdio element surface this adapter uses. Declared structurally
 * (rather than via wdio's chainable/resolved element types, which do not unify
 * cleanly across the `$`/`$$`/await boundary) so the driver depends only on the
 * commands it actually calls. A real `WebdriverIO.Element` satisfies it.
 */
interface NativeQueryable {
  $$(selector: string): AsyncIterable<NativeElement>;
}
interface NativeElement extends NativeQueryable {
  readonly elementId: string;
  click(): Promise<void>;
  setValue(value: string): Promise<void>;
  clearValue(): Promise<void>;
  getText(): Promise<string>;
  getAttribute(name: string): Promise<string | null>;
  isDisplayed(): Promise<boolean>;
  isEnabled(): Promise<boolean>;
  isExisting(): Promise<boolean>;
  waitForDisplayed(options?: WdioWaitOptions): Promise<boolean>;
}

/** Anything descendant queries can run within: the session or an element. */
type QueryRoot = NativeQueryable;

/** Appium (UiAutomator2) commands not in the base wdio protocol typings. */
interface AndroidCommands {
  pressKeyCode(keycode: number): Promise<void>;
  getElementRect(
    elementId: string,
  ): Promise<{ x: number; y: number; width: number; height: number }>;
  executeScript(script: string, args: unknown[]): Promise<unknown>;
}

/** A selection/filter step layered on top of a raw selector match set. */
type ElementOp =
  | { readonly type: 'first' }
  | { readonly type: 'last' }
  | { readonly type: 'index'; readonly n: number }
  | { readonly type: 'filterText'; readonly text: string | RegExp };

/** Default retry budget when a spec does not pass an explicit `timeout`. */
const DEFAULT_TIMEOUT_MS = 5000;

/** Build the deep-link URL for an app route (`/x/y` → `scheme://x/y`). */
export function buildDeepLink(scheme: string, path: string): string {
  return `${scheme}://${path.replace(/^\/+/, '')}`;
}

function matchesText(actual: string, expected: string | RegExp): boolean {
  return expected instanceof RegExp
    ? expected.test(actual)
    : actual.includes(expected);
}

/**
 * A lazily-resolved native element (or collection) — the wdio-backed analogue
 * of a Playwright `Locator`. It stores a query (scope resolver + selector +
 * ops), never a handle, and re-resolves on every action and every assertion
 * poll so retry semantics hold on native exactly as on web.
 */
class AppiumElement implements UIElement {
  readonly #browser: NativeBrowser;
  readonly #resolveScope: () => Promise<QueryRoot | undefined>;
  readonly #selector: string;
  readonly #ops: readonly ElementOp[];
  readonly #timeout: number;
  readonly #label: string;

  constructor(
    browser: NativeBrowser,
    resolveScope: () => Promise<QueryRoot | undefined>,
    selector: string,
    ops: readonly ElementOp[],
    timeout: number,
    label: string,
  ) {
    this.#browser = browser;
    this.#resolveScope = resolveScope;
    this.#selector = selector;
    this.#ops = ops;
    this.#timeout = timeout;
    this.#label = label;
  }

  // ── Query resolution ──────────────────────────────────────────────

  /** All matches at this level, fresh, with any text filters applied. */
  async #matches(): Promise<NativeElement[]> {
    const scope = await this.#resolveScope();
    if (!scope) return [];
    let matched: NativeElement[] = [];
    for await (const el of scope.$$(this.#selector)) matched.push(el);
    for (const op of this.#ops) {
      if (op.type === 'filterText') {
        const filtered: NativeElement[] = [];
        for (const el of matched) {
          if (matchesText(await el.getText(), op.text)) filtered.push(el);
        }
        matched = filtered;
      }
    }
    return matched;
  }

  /** Which of the matches this element points at (first unless narrowed). */
  #selectionIndex(count: number): number {
    let selection: 'first' | 'last' | number = 'first';
    for (const op of this.#ops) {
      if (op.type === 'first') selection = 'first';
      else if (op.type === 'last') selection = 'last';
      else if (op.type === 'index') selection = op.n;
    }
    if (selection === 'first') return 0;
    if (selection === 'last') return count - 1;
    return selection;
  }

  /** The single target element, or `undefined` when nothing matches yet. */
  async #one(): Promise<NativeElement | undefined> {
    const matched = await this.#matches();
    return matched[this.#selectionIndex(matched.length)];
  }

  /** The single target element, waiting until it exists (throws on timeout). */
  async #require(timeout = this.#timeout): Promise<NativeElement> {
    let found: NativeElement | undefined;
    await this.#browser.waitUntil(
      async () => {
        found = await this.#one();
        return found !== undefined && (await found.isExisting());
      },
      { timeout, timeoutMsg: `native element not found: ${this.#label}` },
    );
    const el = found;
    if (!el) throw new Error(`native element not found: ${this.#label}`);
    return el;
  }

  #android(): AndroidCommands {
    return this.#browser as unknown as AndroidCommands;
  }

  /** Poll `predicate` (re-resolving each tick) until true or timeout. */
  async #waitFor(
    predicate: (el: NativeElement | undefined) => Promise<boolean>,
    options: ExpectOptions | undefined,
    describe: string,
  ): Promise<void> {
    await this.#browser.waitUntil(async () => predicate(await this.#one()), {
      timeout: options?.timeout ?? this.#timeout,
      timeoutMsg: `${describe}: ${this.#label}`,
    });
  }

  #derive(
    selector: string,
    ops: readonly ElementOp[],
    label: string,
  ): UIElement {
    return new AppiumElement(
      this.#browser,
      () => this.#one(),
      selector,
      ops,
      this.#timeout,
      label,
    );
  }

  #withOp(op: ElementOp, label: string): UIElement {
    return new AppiumElement(
      this.#browser,
      this.#resolveScope,
      this.#selector,
      [...this.#ops, op],
      this.#timeout,
      `${this.#label} ${label}`,
    );
  }

  // ── ElementScope (descendant queries) ─────────────────────────────
  byTestId(id: string): UIElement {
    return this.#derive(
      testIdSelector(id),
      [],
      `${this.#label} > testId=${id}`,
    );
  }

  byTestIdPrefix(prefix: string): UIElement {
    return this.#derive(
      testIdPrefixSelector(prefix),
      [],
      `${this.#label} > testId^=${prefix}`,
    );
  }

  byRole(
    role: UIRole,
    options?: { name?: string | RegExp; exact?: boolean; level?: number },
  ): UIElement {
    return this.#derive(
      roleSelector(role, options),
      [],
      `${this.#label} > role=${String(role)}`,
    );
  }

  byText(text: string | RegExp, options?: TextOptions): UIElement {
    return this.#derive(
      textSelector(text, options),
      [],
      `${this.#label} > text=${String(text)}`,
    );
  }

  byPlaceholder(text: string | RegExp): UIElement {
    return this.#derive(
      placeholderSelector(text),
      [],
      `${this.#label} > placeholder=${String(text)}`,
    );
  }

  byLabel(text: string | RegExp, options?: TextOptions): UIElement {
    return this.#derive(
      labelSelector(text, options),
      [],
      `${this.#label} > label=${String(text)}`,
    );
  }

  first(): UIElement {
    return this.#withOp({ type: 'first' }, '(first)');
  }

  last(): UIElement {
    return this.#withOp({ type: 'last' }, '(last)');
  }

  filterByText(text: string | RegExp): UIElement {
    return this.#withOp(
      { type: 'filterText', text },
      `(hasText=${String(text)})`,
    );
  }

  // ── Actions ───────────────────────────────────────────────────────
  async tap(): Promise<void> {
    const el = await this.#require();
    await el.waitForDisplayed({ timeout: this.#timeout });
    await el.click();
  }

  async fill(value: string): Promise<void> {
    const el = await this.#require();
    await el.waitForDisplayed({ timeout: this.#timeout });
    await el.setValue(value);
  }

  async clear(): Promise<void> {
    const el = await this.#require();
    await el.clearValue();
  }

  async press(key: string): Promise<void> {
    // The element is the intended keyboard target; ensure it exists (and is
    // focused via a prior fill) before dispatching the hardware keycode.
    await this.#require();
    await this.#android().pressKeyCode(androidKeycode(key));
  }

  /**
   * Best-effort native picker selection. Android has no `<select>`: open the
   * control, then tap the option whose label matches `value`. Spec authors
   * should prefer explicit taps on custom pickers; this exists for parity with
   * the web `<select>` path.
   */
  async selectOption(value: string): Promise<void> {
    const control = await this.#require();
    await control.click();
    // Keep the wdio chainable (do not await it) so its element commands proxy
    // through — awaiting the chainable itself is redundant here.
    const option = this.#browser.$(textSelector(value, { exact: true }));
    await option.waitForDisplayed({ timeout: this.#timeout });
    await option.click();
  }

  // ── Reads (point-in-time snapshots) ───────────────────────────────
  async count(): Promise<number> {
    return (await this.#matches()).length;
  }

  async isVisible(): Promise<boolean> {
    const el = await this.#one();
    return (
      el !== undefined && (await el.isExisting()) && (await el.isDisplayed())
    );
  }

  async isEnabled(): Promise<boolean> {
    const el = await this.#one();
    return (
      el !== undefined && (await el.isExisting()) && (await el.isEnabled())
    );
  }

  async text(): Promise<string> {
    const el = await this.#one();
    return el ? el.getText() : '';
  }

  async allTexts(): Promise<string[]> {
    const matched = await this.#matches();
    return Promise.all(matched.map((el) => el.getText()));
  }

  /**
   * Best-effort native-picker option values. Android renders picker choices as
   * `CheckedTextView` spinner items; read their labels. The web `<option>`
   * `value` attribute has no native equivalent, so labels are returned.
   */
  async optionValues(): Promise<string[]> {
    const el = await this.#require();
    const values: string[] = [];
    for await (const item of el.$$(
      'android=new UiSelector().className("android.widget.CheckedTextView")',
    )) {
      values.push(await item.getText());
    }
    return values;
  }

  async value(): Promise<string> {
    // Android EditText exposes its current value as its text.
    const el = await this.#one();
    return el ? el.getText() : '';
  }

  async attribute(name: string): Promise<string | null> {
    const el = await this.#one();
    return el ? el.getAttribute(name) : null;
  }

  async boundingBox(): Promise<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null> {
    const el = await this.#one();
    if (!el || !(await el.isExisting())) return null;
    return this.#android().getElementRect(el.elementId);
  }

  // ── Retrying assertions ───────────────────────────────────────────
  async expectVisible(options?: ExpectOptions): Promise<void> {
    await this.#waitFor(
      async (el) =>
        el !== undefined && (await el.isExisting()) && (await el.isDisplayed()),
      options,
      'expected element to be visible',
    );
  }

  async expectHidden(options?: ExpectOptions): Promise<void> {
    await this.#waitFor(
      async (el) =>
        el === undefined ||
        !(await el.isExisting()) ||
        !(await el.isDisplayed()),
      options,
      'expected element to be hidden',
    );
  }

  async expectEnabled(options?: ExpectOptions): Promise<void> {
    await this.#waitFor(
      async (el) =>
        el !== undefined && (await el.isExisting()) && (await el.isEnabled()),
      options,
      'expected element to be enabled',
    );
  }

  async expectDisabled(options?: ExpectOptions): Promise<void> {
    await this.#waitFor(
      async (el) =>
        el !== undefined && (await el.isExisting()) && !(await el.isEnabled()),
      options,
      'expected element to be disabled',
    );
  }

  async expectAttached(options?: ExpectOptions): Promise<void> {
    await this.#waitFor(
      async (el) => el !== undefined && (await el.isExisting()),
      options,
      'expected element to be attached',
    );
  }

  async expectNotAttached(options?: ExpectOptions): Promise<void> {
    await this.#waitFor(
      async (el) => el === undefined || !(await el.isExisting()),
      options,
      'expected element to be detached',
    );
  }

  async expectCount(count: number, options?: ExpectOptions): Promise<void> {
    await this.#browser.waitUntil(
      async () => (await this.#matches()).length === count,
      {
        timeout: options?.timeout ?? this.#timeout,
        timeoutMsg: `expected ${count} matches: ${this.#label}`,
      },
    );
  }

  async expectValue(value: string, options?: ExpectOptions): Promise<void> {
    await this.#waitFor(
      async (el) => el !== undefined && (await el.getText()) === value,
      options,
      `expected value "${value}"`,
    );
  }

  async expectAttribute(
    name: string,
    value: string | RegExp,
    options?: ExpectOptions,
  ): Promise<void> {
    await this.#waitFor(
      async (el) => {
        if (!el) return false;
        const actual = await el.getAttribute(name);
        return actual !== null && matchesText(actual, value);
      },
      options,
      `expected attribute ${name}=${String(value)}`,
    );
  }

  async expectContainsText(
    text: string | RegExp,
    options?: ExpectOptions,
  ): Promise<void> {
    await this.#waitFor(
      async (el) => el !== undefined && matchesText(await el.getText(), text),
      options,
      `expected text to contain "${String(text)}"`,
    );
  }

  async expectNonEmptyText(options?: ExpectOptions): Promise<void> {
    await this.#waitFor(
      async (el) => el !== undefined && (await el.getText()).trim().length > 0,
      options,
      'expected non-empty text',
    );
  }
}

/** Optional wiring for {@link AppiumNativeDriver}. */
export interface AppiumNativeDriverOptions {
  /** Custom URL scheme for deep links (default: the app's `legacysports`). */
  readonly scheme?: string;
  /** Android package for the deep-link target (default: the app package). */
  readonly appPackage?: string;
  /** Default retry budget for actions/assertions with no explicit timeout. */
  readonly defaultTimeout?: number;
}

/** The app's custom scheme + Android package (mirrors `apps/app/app.json`). */
export const NATIVE_APP_SCHEME = 'legacysports';
export const NATIVE_APP_PACKAGE = 'com.legacysports.app';

export class AppiumNativeDriver implements AppDriver {
  /**
   * The underlying wdio session — the deliberate escape hatch for fixtures and
   * native-only call sites during migration, mirroring
   * {@link PlaywrightWebDriver.page}. Page objects typed against
   * {@link AppDriver} cannot reach it, which is the point.
   */
  readonly browser: NativeBrowser;

  readonly capabilities: DriverCapabilities = {
    networkMock: false,
    clock: false,
    trace: false,
    hover: false,
    multiWindow: false,
  };

  readonly #scheme: string;
  readonly #appPackage: string;
  readonly #timeout: number;

  constructor(browser: NativeBrowser, options?: AppiumNativeDriverOptions) {
    this.browser = browser;
    this.#scheme = options?.scheme ?? NATIVE_APP_SCHEME;
    this.#appPackage = options?.appPackage ?? NATIVE_APP_PACKAGE;
    this.#timeout = options?.defaultTimeout ?? DEFAULT_TIMEOUT_MS;
  }

  /** Open an app route via deep link (expo-router routes are URL-shaped). */
  async open(path: string): Promise<void> {
    const android = this.browser as unknown as AndroidCommands;
    await android.executeScript('mobile: deepLink', [
      { url: buildDeepLink(this.#scheme, path), package: this.#appPackage },
    ]);
  }

  #root(selector: string, label: string): UIElement {
    return new AppiumElement(
      this.browser,
      () => Promise.resolve<QueryRoot>(this.browser),
      selector,
      [],
      this.#timeout,
      label,
    );
  }

  byTestId(id: string): UIElement {
    return this.#root(testIdSelector(id), `testId=${id}`);
  }

  byTestIdPrefix(prefix: string): UIElement {
    return this.#root(testIdPrefixSelector(prefix), `testId^=${prefix}`);
  }

  byRole(
    role: UIRole,
    options?: { name?: string | RegExp; exact?: boolean; level?: number },
  ): UIElement {
    return this.#root(roleSelector(role, options), `role=${String(role)}`);
  }

  byText(text: string | RegExp, options?: TextOptions): UIElement {
    return this.#root(textSelector(text, options), `text=${String(text)}`);
  }

  byPlaceholder(text: string | RegExp): UIElement {
    return this.#root(placeholderSelector(text), `placeholder=${String(text)}`);
  }

  byLabel(text: string | RegExp, options?: TextOptions): UIElement {
    return this.#root(labelSelector(text, options), `label=${String(text)}`);
  }
}
