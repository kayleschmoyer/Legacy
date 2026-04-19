# Playwright Best Practices

> Extracted from e2e-testing SKILL.md — load when writing or reviewing Playwright test code.

Follow these Playwright-recommended patterns. Violations cause flaky, slow, and non-deterministic tests.

## Never use `waitForTimeout()`

`page.waitForTimeout()` is an arbitrary sleep — tests that depend on it are slow (best case) and flaky (worst case). Replace with a condition-based wait:

```typescript
// ❌ WRONG: arbitrary sleep
await page.waitForTimeout(1000);
await expect(page.getByText('Results')).toBeVisible();

// ✅ CORRECT: wait for the condition directly
await expect(page.getByText('Results')).toBeVisible();

// ✅ For debounced inputs: fill then assert on the result
await page.fill('#search', 'query');
await expect(page.getByTestId('search-results')).toBeVisible();

// ✅ For polling (integration tests): use expect.poll()
await expect
  .poll(async () => {
    const resp = await page.request.get('/api/status');
    return resp.json();
  })
  .toEqual(expect.objectContaining({ ready: true }));
```

## Never use `waitForLoadState('networkidle')`

`'networkidle'` waits until no network requests for 500ms — it's **deprecated**, unreliable with long-polling/WebSockets, and adds unnecessary delay. SPAs with polling or analytics never truly go idle.

```typescript
// ❌ WRONG: unreliable, deprecated
await page.waitForLoadState('networkidle');

// ✅ CORRECT: wait for a specific element
await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

// ✅ OK when you just need DOM ready (e.g., before asserting on content)
await page.waitForLoadState('domcontentloaded');
```

## Never use `page.$()`, `page.$$()`, `page.waitForSelector()`, or `elementHandle`

These are legacy Puppeteer-style APIs. Playwright locators are auto-waiting, auto-retrying, and composable.

```typescript
// ❌ WRONG: Puppeteer-style
const el = await page.$('.my-button');
await el?.click();

// ✅ CORRECT: Playwright locator
await page.locator('.my-button').click();
// Even better: use semantic selectors
await page.getByRole('button', { name: /submit/i }).click();
```

## Prefer web-first assertions

```typescript
// ❌ WRONG: manual check
const isVisible = await page.locator('.toast').isVisible();
expect(isVisible).toBe(true);

// ✅ CORRECT: auto-retrying web-first assertion
await expect(page.locator('.toast')).toBeVisible();
```

> **Known tech debt (LS-1783 audit):** ~55 `waitForTimeout()` calls remain across 17 E2E spec files. 5 clear violations were fixed in LS-1783; the remaining instances in complex animation/debounce/draft flows are tracked as follow-up tickets. `waitForLoadState('networkidle')` calls remain in both page objects and some spec files and should be treated as tech debt to remove when those areas are modified. `route.fallback()` is used in 90+ places as a passthrough for non-mocked routes — these should be replaced with `route.fulfill()` returning diagnostic errors (tracked separately).

## Locator Conventions

Prefer Playwright's accessibility-first selectors in this order:

1. **Role-based** (best): `page.getByRole('button', { name: /create league/i })`
2. **Text**: `page.getByText('Fantasy League')`
3. **Placeholder**: `page.getByPlaceholder('Enter your league name')`
4. **Test ID** (when no semantic option): `page.getByTestId('leagues-grid')`
5. **CSS selector** (last resort): `page.locator('a[href="/about"]')`

> Avoid brittle CSS class selectors — they change with styling updates.

## Page Objects

Page objects live in `apps/web-e2e/src/pages/` and encapsulate locators for a route or component group.

### Pattern

```typescript
import { type Locator, type Page, expect } from '@playwright/test';

export class ExamplePage {
  readonly page: Page;
  readonly heading: Locator;
  readonly submitButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { level: 1 });
    this.submitButton = page.getByRole('button', { name: /submit/i });
  }

  async goto() {
    await this.page.goto('/example');
    await this.page.waitForLoadState('domcontentloaded');
  }

  async expectLoaded() {
    await expect(this.heading).toBeVisible({ timeout: 15000 });
  }
}
```

### Rules

- One page object per route group (e.g., `league.page.ts` covers create + detail + list)
- Expose `Locator` properties for assertions, helper methods for multi-step interactions
- Use `expect` inside helper methods only for preconditions (e.g., `expectLoaded`)
- Name the file `<domain>.page.ts`

## Assert Behavior, Not Pixels

E2E tests must use **behavioral assertions** — never `toHaveScreenshot()` or `toMatchSnapshot()`. Visual regression testing belongs in component isolation (Storybook/Chromatic).

```typescript
// ❌ WRONG: visual snapshot
await expect(page).toHaveScreenshot('search-results.png');

// ✅ CORRECT: behavioral assertion
await expect(page.getByTestId('search-results')).toBeVisible();
await expect(page.getByText('3 results found')).toBeVisible();

// ✅ Verify state changes via attributes/text, not screenshots
const battingTab = page.getByRole('tab', { name: /batting/i });
await battingTab.click();
await expect(battingTab).toHaveAttribute('data-state', 'active');

// ✅ Verify responsive layout via element visibility
await page.setViewportSize({ width: 375, height: 667 });
await expect(page.getByRole('button', { name: /menu/i })).toBeVisible();
await expect(page.getByRole('navigation')).not.toBeVisible();
```

### What to assert instead of screenshots

| Instead of…                            | Assert…                                                           |
| -------------------------------------- | ----------------------------------------------------------------- |
| Full-page screenshot                   | Key headings, navigation elements, and content containers visible |
| Component screenshot                   | Component text, attributes, and interaction states                |
| Loading state screenshot               | Loading indicator visible, then content visible after load        |
| Error state screenshot                 | Error message text or `[role="alert"]` visible                    |
| Responsive screenshot at N breakpoints | Elements show/hide at each viewport size                          |

## Tamagui / Custom Component Pitfalls

### Custom dialog backdrops intercept Playwright clicks

Tamagui custom dialogs (not `<Dialog>`) that use a `position: fixed` backdrop `YStack` will intercept Playwright's hit test via `elementFromPoint()`. Even with proper `zIndex`, Playwright sees the backdrop, not the dialog content.

**Fix for the component:** Add `onPress={(e) => e.stopPropagation()}` to the inner dialog panel, plus `role="dialog"`, `aria-modal`, and `aria-label` for testability.

**Fix for the test:** Use `{ force: true }` on clicks inside the dialog, but **always scope locators to the dialog first**:

```typescript
const dialog = page.getByRole('dialog', { name: 'My Dialog' });
await dialog.getByRole('button', { name: /confirm/i }).click({ force: true });
```

> **Warning:** Unscoped `page.getByRole('button')` with `force: true` can match navigation buttons outside the dialog, causing it to close or navigate away.

### Adding testID for selection UIs

When Tamagui components lack semantic roles (e.g., player selection rows), add `testID` which renders as `data-testid` on web:

```tsx
<XStack testID={`item-${id}`} role="option" aria-label={`Select ${name}`}>
```

### Collapsed accordion sections

Accordion-style sections render children but keep them hidden. Always expand the accordion (click the header) before asserting on or clicking elements inside it.
