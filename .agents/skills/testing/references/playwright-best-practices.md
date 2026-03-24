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

// ✅ OK when you just need DOM ready (e.g., before a snapshot)
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

## Always pass `--config`

A legacy root `playwright.config.ts` exists. Without `--config`, Playwright picks it up and uses the wrong port/settings.

```powershell
# ❌ WRONG: picks up root config (port 4200, dev server)
pnpm exec playwright test

# ✅ CORRECT: uses E2E config (port 4280, static build)
pnpm exec playwright test --config=apps/web-e2e/playwright.config.ts
```

> **Known tech debt:** ~40 `waitForTimeout()` and ~20 `networkidle` calls exist in integration tests and page objects. These should be eliminated in future PRs but are not blocking `@critical` tests.

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

## Snapshot Testing (Deprecated)

Visual snapshot tests tagged `@visual` still exist in `apps/web-e2e/src/tests/` but are being phased out. No dedicated CI workflow or Nx target exists for updating baselines. Until these tests and their baselines are fully removed:

- **Run `@visual` tests locally:**
  ```powershell
  pnpm exec nx e2e web-e2e -- --grep='@visual'
  ```
- **Update snapshot baselines** (when a legitimate UI change causes a diff):
  ```powershell
  pnpm exec playwright test --config=apps/web-e2e/playwright.config.ts --update-snapshots --grep='@visual'
  ```
- **Do not add new `@visual` snapshot tests.** New visual assertions should use standard `toBeVisible()` / `toHaveScreenshot()` expectations without baseline files.

> **Tracking:** Snapshot spec removal is tracked under the LS-1779 ticket. Once all `@visual` specs are deleted, remove this section.

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
