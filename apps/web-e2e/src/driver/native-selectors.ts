/**
 * Selector-vocabulary translation for the native ({@link ./appium-native.driver})
 * driver (ADR-0016 §platform seam).
 *
 * The platform-neutral {@link ./types.ElementScope} vocabulary — `byTestId`,
 * `byTestIdPrefix`, `byRole`, `byText`, `byPlaceholder`, `byLabel` — is
 * deliberately narrow: exactly the subset that BOTH platforms can resolve.
 * On web it maps onto Playwright's `getByTestId`/`getByRole`/… ; here it maps
 * onto WebdriverIO + UiAutomator2 selector strings against the Android
 * accessibility tree.
 *
 * These functions are PURE (string in, selector string out) so the mapping is
 * unit-testable without an emulator — the translation is the contract, and a
 * regression in it is a regression in every migrated page object. Behavioural
 * verification (that the selector actually resolves the intended element) is
 * the emulator's job (the shared driver contract suite + the reference
 * migration, both gated on a running device).
 *
 * ## Mapping model (Android / UiAutomator2)
 *
 * - **testID** → **accessibility id** (`~id`). React Native surfaces a
 *   component's `testID` as the Android `content-desc` / accessibility id, and
 *   Tamagui forwards `testID` to the underlying RN node. NOTE the known Tamagui
 *   pitfall (LS-8437 family): `data-testid` is dropped on some a11y buttons on
 *   web — the same components must be verified to propagate `testID` on native
 *   (that verification runs on the emulator, not here).
 * - **role / name** → the accessibility tree. Android has no first-class ARIA
 *   role, so a role is approximated by widget class + the `content-desc`/`text`
 *   that carries the accessible name. The mapping is best-effort and documented
 *   per role below.
 * - **text** → `text` / `textContains` / `textMatches`.
 * - **label** (accessibility label) → `content-desc`
 *   (`description`/`descriptionContains`/`descriptionMatches`).
 * - **placeholder** → the EditText hint, which RN renders into `text` (empty
 *   field) or `content-desc`; matched across both.
 *
 * UiAutomator selectors are prefixed `android=`; XPath selectors start with `/`.
 * See https://webdriver.io/docs/selectors/#android-uiautomator and
 * https://webdriver.io/docs/selectors/#accessibility-id.
 */

import type { UIRole } from './types';

/**
 * Escape a string for embedding inside a UiAutomator `new UiSelector()."…"`
 * string argument (double-quoted): backslashes and double quotes only. The
 * UiAutomator string grammar is Java-string-like, so these two are sufficient.
 */
export function escapeUiaString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/** Escape a string for embedding inside an XPath double-quoted literal. */
function escapeXpathLiteral(value: string): string {
  // XPath 1.0 has no escape mechanism inside a string literal. When the value
  // itself contains a double quote, fall back to a concat() expression so the
  // selector never produces invalid XPath.
  if (!value.includes('"')) {
    return `"${value}"`;
  }
  const parts = value.split('"').map((part) => `"${part}"`);
  return `concat(${parts.join(", '\"', ")})`;
}

/**
 * The accessibility-id selector for a `testID`. This is the primary,
 * highest-fidelity native selector and the direct analogue of web's
 * `getByTestId` (`[data-testid="…"]`).
 */
export function testIdSelector(id: string): string {
  return `~${id}`;
}

/**
 * A `content-desc`-starts-with selector — the native analogue of web's
 * `[data-testid^="prefix"]` collection locator (e.g. the `player-row-<id>`
 * rows). Uses UiAutomator `descriptionStartsWith` because accessibility id maps
 * to `content-desc` on Android.
 */
export function testIdPrefixSelector(prefix: string): string {
  return `android=new UiSelector().descriptionStartsWith("${escapeUiaString(prefix)}")`;
}

/** Options accepted by the text/label selector builders (mirrors TextOptions). */
export interface NativeTextMatch {
  exact?: boolean;
}

/**
 * A visible-text selector. A `RegExp` maps to `textMatches` (UiAutomator takes
 * a regex source); a string maps to `text` when `exact` is set and
 * `textContains` otherwise — mirroring Playwright's substring-by-default
 * `getByText`.
 */
export function textSelector(
  text: string | RegExp,
  options?: NativeTextMatch,
): string {
  if (text instanceof RegExp) {
    return `android=new UiSelector().textMatches("${escapeUiaString(text.source)}")`;
  }
  const method = options?.exact ? 'text' : 'textContains';
  return `android=new UiSelector().${method}("${escapeUiaString(text)}")`;
}

/**
 * An accessibility-label selector (`content-desc`). Exact string → the
 * accessibility-id shorthand (`~label`); substring string → `descriptionContains`;
 * `RegExp` → `descriptionMatches`.
 */
export function labelSelector(
  text: string | RegExp,
  options?: NativeTextMatch,
): string {
  if (text instanceof RegExp) {
    return `android=new UiSelector().descriptionMatches("${escapeUiaString(text.source)}")`;
  }
  if (options?.exact) {
    return `~${text}`;
  }
  return `android=new UiSelector().descriptionContains("${escapeUiaString(text)}")`;
}

/**
 * A placeholder selector. RN renders a TextInput placeholder into the node's
 * `text` (while empty) or `content-desc`, so match either. XPath is used for
 * the string case so both attributes can be OR-ed in one query; a `RegExp`
 * falls back to UiAutomator `textMatches` (XPath 1.0 cannot express regex).
 */
export function placeholderSelector(text: string | RegExp): string {
  if (text instanceof RegExp) {
    return `android=new UiSelector().textMatches("${escapeUiaString(text.source)}")`;
  }
  const literal = escapeXpathLiteral(text);
  return `//android.widget.EditText[contains(@text, ${literal}) or contains(@content-desc, ${literal})]`;
}

/** Options accepted by {@link roleSelector} (mirrors AppDriver.byRole). */
export interface NativeRoleMatch {
  name?: string | RegExp;
  exact?: boolean;
  level?: number;
}

/**
 * Best-effort role→Android widget class map. Android exposes no ARIA role, so a
 * role is approximated by the widget class the RN renderer emits for that
 * accessibility role. Roles with no stable class equivalent (`group`, `region`,
 * generic containers) are matched by name alone (class `undefined`), which is
 * the honest behaviour — over-constraining on class would silently miss
 * elements a real device renders differently.
 */
const ROLE_TO_ANDROID_CLASS: Partial<Record<string, string>> = {
  button: 'android.widget.Button',
  link: 'android.widget.TextView',
  heading: 'android.widget.TextView',
  alert: 'android.widget.TextView',
  textbox: 'android.widget.EditText',
  searchbox: 'android.widget.EditText',
  checkbox: 'android.widget.CheckBox',
  radio: 'android.widget.RadioButton',
  switch: 'android.widget.Switch',
  img: 'android.widget.ImageView',
  image: 'android.widget.ImageView',
  list: 'android.widget.ListView',
  tab: 'android.widget.TextView',
};

/**
 * A role/name selector against the accessibility tree. Builds a UiAutomator
 * selector combining the mapped widget class (when known) with a `content-desc`
 * (accessible name) match. The accessible name matches `description`
 * exact/contains/regex exactly like {@link labelSelector}, because RN routes
 * `accessibilityLabel` (the source of an element's accessible name) to
 * `content-desc`.
 *
 * `level` (heading level) has no Android equivalent and is intentionally
 * ignored here — a heading-level assertion is a web-only concern and stays in
 * an unmigrated page object (ADR-0016 §narrow vocabulary).
 */
export function roleSelector(role: UIRole, options?: NativeRoleMatch): string {
  const className = ROLE_TO_ANDROID_CLASS[role as string];
  let selector = 'new UiSelector()';
  if (className) {
    selector += `.className("${escapeUiaString(className)}")`;
  }
  const name = options?.name;
  if (name instanceof RegExp) {
    selector += `.descriptionMatches("${escapeUiaString(name.source)}")`;
  } else if (typeof name === 'string') {
    selector += options?.exact
      ? `.description("${escapeUiaString(name)}")`
      : `.descriptionContains("${escapeUiaString(name)}")`;
  }
  return `android=${selector}`;
}

/**
 * Portable key → Android keycode map for {@link ./types.UIElement.press}. Only
 * keys with a real native keyboard equivalent are portable (ADR-0016); web-only
 * chords stay in unmigrated objects. `KeyEvent` codes:
 * https://developer.android.com/reference/android/view/KeyEvent
 */
export const ANDROID_KEYCODES: Readonly<Record<string, number>> = {
  Enter: 66,
  Escape: 111,
  Tab: 61,
  Backspace: 67,
  Delete: 112,
  ArrowUp: 19,
  ArrowDown: 20,
  ArrowLeft: 21,
  ArrowRight: 22,
  Space: 62,
};

/** Resolve a portable key name to its Android keycode, or throw if unmapped. */
export function androidKeycode(key: string): number {
  const code = ANDROID_KEYCODES[key];
  if (code === undefined) {
    throw new Error(
      `AppiumNativeDriver: key "${key}" has no portable Android keycode. ` +
        `Stick to the portable subset (${Object.keys(ANDROID_KEYCODES).join(', ')}) ` +
        `or keep the web-only chord in an unmigrated (Playwright-typed) page object.`,
    );
  }
  return code;
}
