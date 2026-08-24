/**
 * The shared {@link ../types.AppDriver} contract (ADR-0016 §platform seam).
 *
 * One set of platform-neutral behavioural cases, written purely against the
 * `AppDriver`/`UIElement` interface, that EVERY driver must satisfy. The web
 * spec ({@link ./web.contract.spec}) runs them against
 * {@link ../playwright-web.driver.PlaywrightWebDriver} on a `data:`-URL fixture;
 * the native spec ({@link ./driver.native.spec}) runs the SAME cases against
 * {@link ../appium-native.driver.AppiumNativeDriver} on an emulator (gated).
 * That is the AC1 "runs against both drivers" guarantee: the cases are the
 * single source of truth for what "conforms to the contract" means, so a driver
 * that diverges fails here rather than in a migrated page object.
 *
 * Cases assert through the driver's own retrying `expect*` surface wherever
 * possible (a failure throws and fails the test) and fall back to `expect()`
 * for point-in-time reads. They never reference Playwright `Page`/wdio `Browser`
 * — only the neutral interface — so they are identical on every platform.
 */
import { expect } from '@playwright/test';

import { FIXTURE } from './fixture';
import type { AppDriver, DriverCapabilities } from '../types';

/** One named conformance case, run against an already-opened fixture. */
export interface AppDriverContractCase {
  readonly name: string;
  run(driver: AppDriver): Promise<void>;
}

/**
 * Assert a driver declares exactly the capabilities the platform supports —
 * honesty is the contract (ADR-0016 §capability model). Not part of the
 * fixture-driven cases because it needs no rendered fixture.
 */
export function assertCapabilities(
  driver: AppDriver,
  expected: DriverCapabilities,
): void {
  expect(driver.capabilities).toEqual(expected);
}

export const APP_DRIVER_CONTRACT_CASES: readonly AppDriverContractCase[] = [
  {
    name: 'byTestId resolves the root and expectVisible/expectAttached retry',
    run: async (driver) => {
      await driver.byTestId(FIXTURE.root).expectVisible();
      await driver.byTestId(FIXTURE.root).expectAttached();
    },
  },
  {
    name: 'isVisible reports a rendered element as visible',
    run: async (driver) => {
      expect(await driver.byTestId(FIXTURE.root).isVisible()).toBe(true);
    },
  },
  {
    name: 'byTestIdPrefix collects every matching row (count + expectCount)',
    run: async (driver) => {
      const rows = driver.byTestIdPrefix(FIXTURE.rowPrefix);
      await rows.expectCount(FIXTURE.rows.length);
      expect(await rows.count()).toBe(FIXTURE.rows.length);
    },
  },
  {
    name: 'allTexts reads every match in order',
    run: async (driver) => {
      const texts = await driver.byTestIdPrefix(FIXTURE.rowPrefix).allTexts();
      for (const expected of FIXTURE.rowTexts) {
        expect(texts.some((t) => t.includes(expected))).toBe(true);
      }
    },
  },
  {
    name: 'first/last narrow a collection to distinct endpoints',
    run: async (driver) => {
      const rows = driver.byTestIdPrefix(FIXTURE.rowPrefix);
      await rows.first().expectContainsText(FIXTURE.rowTexts[0]);
      await rows.last().expectContainsText(FIXTURE.rowTexts.at(-1) as string);
    },
  },
  {
    name: 'filterByText narrows a collection to the matching row',
    run: async (driver) => {
      const bravo = FIXTURE.rowTexts[1];
      const filtered = driver
        .byTestIdPrefix(FIXTURE.rowPrefix)
        .filterByText(bravo);
      await filtered.expectCount(1);
      await filtered.first().expectContainsText(bravo);
    },
  },
  {
    name: 'visible narrows a duplicated testid to the rendered instance',
    run: async (driver) => {
      const duplicate = driver.byTestId(FIXTURE.duplicate);
      await duplicate.expectCount(2);
      const shown = duplicate.visible();
      await shown.expectCount(1);
      await shown.expectContainsText(FIXTURE.duplicateVisibleText);
    },
  },
  {
    name: 'byRole resolves a heading by name and level',
    run: async (driver) => {
      await driver
        .byRole('heading', { name: FIXTURE.headingName, level: 1 })
        .expectVisible();
    },
  },
  {
    name: 'byRole resolves an enabled button and reports it enabled',
    run: async (driver) => {
      const button = driver.byRole('button', {
        name: FIXTURE.primaryButtonName,
      });
      await button.expectVisible();
      await button.expectEnabled();
      expect(await button.isEnabled()).toBe(true);
    },
  },
  {
    name: 'expectDisabled/isEnabled reflect a disabled control',
    run: async (driver) => {
      const disabled = driver.byRole('button', {
        name: FIXTURE.disabledButtonName,
      });
      await disabled.expectDisabled();
      expect(await disabled.isEnabled()).toBe(false);
    },
  },
  {
    name: 'byPlaceholder + fill/value/expectValue/clear round-trips input',
    run: async (driver) => {
      const input = driver.byPlaceholder(FIXTURE.inputPlaceholder);
      await input.fill('Alpha');
      await input.expectValue('Alpha');
      expect(await input.value()).toBe('Alpha');
      await input.clear();
      await input.expectValue('');
    },
  },
  {
    name: 'byLabel resolves the same labelled input',
    run: async (driver) => {
      await driver.byLabel(FIXTURE.inputLabel).expectVisible();
    },
  },
  {
    name: 'press dispatches a portable key to the focused element',
    run: async (driver) => {
      const input = driver.byPlaceholder(FIXTURE.inputPlaceholder);
      await input.fill('Alpha');
      await input.press('Backspace');
      await input.expectValue('Alph');
    },
  },
  {
    name: 'selectOption + optionValues drive a select-like control',
    run: async (driver) => {
      const select = driver.byTestId(FIXTURE.select);
      const values = await select.optionValues();
      for (const value of FIXTURE.optionValues) {
        expect(values).toContain(value);
      }
      await select.selectOption(FIXTURE.optionValues[1]);
      await select.expectValue(FIXTURE.optionValues[1]);
    },
  },
  {
    name: 'attribute/expectAttribute read a DOM/a11y attribute',
    run: async (driver) => {
      const badge = driver.byTestId(FIXTURE.attr);
      expect(await badge.attribute(FIXTURE.attrName)).toBe(FIXTURE.attrValue);
      await badge.expectAttribute(FIXTURE.attrName, FIXTURE.attrValue);
    },
  },
  {
    name: 'alert role exposes non-empty, containing text',
    run: async (driver) => {
      const alert = driver.byRole('alert');
      await alert.expectNonEmptyText();
      await alert.expectContainsText('happened');
    },
  },
  {
    name: 'a missing element is not attached, hidden, and counts zero',
    run: async (driver) => {
      const absent = driver.byTestId(FIXTURE.absent);
      await absent.expectNotAttached();
      await absent.expectHidden();
      await absent.expectCount(0);
      expect(await absent.isVisible()).toBe(false);
    },
  },
  {
    name: 'boundingBox returns the rendered rectangle',
    run: async (driver) => {
      const box = await driver.byTestId(FIXTURE.root).boundingBox();
      expect(box).not.toBeNull();
      expect((box?.width ?? 0) > 0).toBe(true);
    },
  },
];
