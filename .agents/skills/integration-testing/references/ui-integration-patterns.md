# UI Integration Test Patterns (Browser-Based)

Playwright+Tamagui interaction patterns for full lifecycle tests that drive the real UI against live backends.

## Switching Users via localStorage JWT

When swapping identities in a single browser context, **always navigate first, then set the JWT, then reload**:

```typescript
async function switchUser(page: Page, jwt: string, url?: string) {
  if (url) {
    // Navigate first to establish correct origin (avoids SecurityError on about:blank)
    await page.goto(url);
    await page.waitForLoadState('domcontentloaded');
    // Set JWT, then reload so the app loads with the new identity
    await page.evaluate((t) => localStorage.setItem('auth_jwt', t), jwt);
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
  } else {
    await page.evaluate((t) => localStorage.setItem('auth_jwt', t), jwt);
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
  }
}
```

**Common mistake:** Setting localStorage before any navigation fails with `SecurityError: Access is denied` because the page is on `about:blank` (no origin). And navigating + setting JWT _without reloading_ leaves the app using the old identity's cached data.

## Custom Dialog Backdrop Interception

Tamagui custom dialogs (not `<Dialog>`) often use a `position: fixed` `YStack` backdrop with `onPress={onDismiss}`. This causes two Playwright problems:

1. **Event bubbling** — Clicks inside the dialog bubble to the backdrop, closing it. Fix: add `onPress={(e) => e.stopPropagation()}` to the inner dialog panel.
2. **Hit test interception** — Playwright's `elementFromPoint()` returns the backdrop overlay, not the dialog content, even with `zIndex`. Fix: use `{ force: true }` on clicks inside the dialog.

When using `force: true`, **always scope locators to the dialog element** to prevent clicking page-level buttons:

```typescript
// ✅ GOOD — scoped to dialog
const dialog = page.getByRole('dialog', { name: 'Propose Trade' });
await dialog.getByRole('button', { name: /Submit/i }).click({ force: true });

// ❌ BAD — unscoped, may click a nav button outside the dialog
await page.getByRole('button', { name: /Submit/i }).click({ force: true });
```

To make dialogs testable, add `role="dialog"`, `aria-modal`, and `aria-label` to the component:

```tsx
<YStack role="dialog" aria-modal aria-label="Propose Trade"
  onPress={(e) => e.stopPropagation()}>
```

## Collapsed Accordion Sections

Commissioner panel sections (e.g., "Waiver Processing") may render as collapsed accordions. Always **expand the section before looking for buttons inside it**:

```typescript
// Click accordion header to expand
const accordion = page.getByText('Waiver Processing');
await accordion.click();
// Now the button inside is visible
await page.getByRole('button', { name: /Process Waivers/i }).click();
```

## Auto-Created Resources

Some resources are created automatically by backend processes. Don't try to create them via UI if they already exist — verify existence instead:

```typescript
// ❌ BAD — matchups were already auto-created after draft
await page.getByRole('button', { name: /Create Week 1 Matchups/i }).click();

// ✅ GOOD — verify they exist
await expect(page.getByText(/Week 1/i)).toBeVisible({ timeout: 10000 });
```

## Adding testID for Complex Selection UIs

When selection UIs have no accessible role/name (e.g., player rows in a claim modal), add `testID` to the Tamagui component. This renders as `data-testid` on web:

```tsx
<XStack testID={`drop-player-${playerId}`} role="option" aria-label={`Drop ${name}`}>
```

Then in the test:

```typescript
const row = page.locator('[data-testid^="drop-player-"]').first();
await row.click();
```

## Exact `aria-label` for Add/Drop Player Buttons

Player searches often return multiple results, producing multiple "Add" buttons on the page. **Never use `.first()` on a generic `button[aria-label^="Add "]` selector** — it will click the wrong player. Always target the exact player name:

```typescript
// ❌ BAD — clicks first result, not necessarily the player you want
await page.locator('button[aria-label^="Add "]').first().click();

// ✅ GOOD — exact player match
await page.locator(`button[aria-label="Add ${playerName}"]`).click();
```

If the exact name is not available, fall back to the prefix selector only as a last resort, and assert the player was actually added before continuing.

## Tamagui `getByTestId` Is Not Forwarded to DOM

Tamagui components (e.g., `<Button>`, `<XStack>`) do not always forward `testID` to the rendered DOM element. If `getByTestId('my-id')` cannot find the element, use a role-based selector instead:

```typescript
// ❌ UNRELIABLE — Tamagui may not forward testID to DOM
await page.getByTestId('commissioner-section-toggle-draft-settings').click();

// ✅ RELIABLE — role + name always works for labeled buttons
await page.getByRole('button', { name: 'Draft Settings', exact: true }).click();
```

## Tamagui Disabled Buttons Reject Forced Clicks

Tamagui `<Button disabled>` renders with the native HTML `disabled` attribute. Playwright's `click({ force: true })` does **not** fire on natively disabled elements. Always wait for the button to become enabled first:

```typescript
// ❌ BAD — force: true is silently ignored on disabled buttons
await saveBtn.click({ force: true });

// ✅ GOOD — wait for enabled, then click normally
await expect(saveBtn).toBeEnabled({ timeout: 10_000 });
await saveBtn.click();
```

## Fixed Overlay Intercepts Clicks (`z-index: 9999`)

Toast overlays with `position: fixed; z-index: 9999` will intercept Playwright clicks even with `{ force: true }`. Use `dispatchEvent` to bypass:

```typescript
// ❌ BAD — toast overlay intercepts this
await element.click({ force: true });

// ✅ GOOD — dispatches click directly on the element, bypassing hit-test
await element.dispatchEvent('click');
```

This is useful for click targets obscured by persistent toast notifications (e.g., draft pick confirmation toasts that linger between picks).

## DB Unique Constraint in `randomizeDraftOrder` / `setDraftOrder`

If integration tests fail instantly (~200ms) with `duplicate key value violates unique constraint "draft_teams_uk_order"` it means the Lambda (lambdas/db) has not been deployed with the delete-and-reinsert fix from LS-1076. The serial UPDATE loop in the old code violates the unique constraint on `(draftId, draftOrder)` when swapping values. This is a **deploy problem**, not a test-side fix — deploy the Lambda and the test will pass.
