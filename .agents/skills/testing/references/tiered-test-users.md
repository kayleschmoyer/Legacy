# Tiered Test-User Model — worked examples

> Home of the rule (tier table + the three-rule summary): [testing SKILL § Tiered Test-User Model](../SKILL.md#tiered-test-user-model-premium-default-free-for-gates). This file carries the copy-paste examples and the review-checklist guard.

### Hermetic e2e — copy-paste examples

```typescript
// Premium is the DEFAULT — no opt-in needed for a feature test.
import { test, expect } from '../fixtures/auth-enhanced';

test('premium user sees the advanced filter', async ({ page }) => {
  await page.goto('/players');
  await expect(
    page.getByRole('button', { name: /advanced filters/i }),
  ).toBeVisible();
});

// Free-tier spec — MUST assert the gate.
import { useTier } from '../fixtures/shared-mocks';

test('free user is gated out of the advanced filter', async ({ page }) => {
  await useTier(page, 'free'); // before goto
  await page.goto('/players');
  await expect(page.getByText(/upgrade to premium/i)).toBeVisible(); // ← gate assertion
});

// Admin-only surface.
test('admin can reach the admin console', async ({ page }) => {
  await useTier(page, 'admin');
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: /admin/i })).toBeVisible();
});
```

`useTier` and `EntitlementTier` are exported from `apps/web-e2e/src/fixtures/shared-mocks.ts`. It pins `GetUserById` and cascades every other operation to the baseline; call it BEFORE `page.goto()`. See [shared-mocks.ts](../../../../apps/web-e2e/src/fixtures/shared-mocks.ts) (LS-8056).

### Live integration — copy-paste examples

```typescript
import { test, expect } from '../fixtures/api';

// Premium is the default identity behind `api` / `api2`.
test('premium user can call a premium-gated resolver', async ({
  premiumJwt,
}) => {
  const result = await gqlFetchEnvelope(premiumJwt, PREMIUM_GATED_QUERY, vars);
  expect(
    result.errors?.some((e) => e.extensions?.code === 'PREMIUM_REQUIRED'),
  ).toBeFalsy();
});

// Free-tier spec — MUST assert the gate fires.
test('free user is blocked by the premium gate', async ({ freeJwt }) => {
  const result = await gqlFetchEnvelope(freeJwt, PREMIUM_GATED_QUERY, vars);
  expect(
    result.errors?.some((e) => e.extensions?.code === 'PREMIUM_REQUIRED'),
  ).toBeTruthy();
});
```

`loginAs(tier, seat)` lives in `apps/web-e2e/src/utils/test-user-auth.ts` and powers the `premiumJwt` / `premiumJwt2` / `freeJwt` / `freeJwt2` / `adminJwt` / `adminJwt2` fixtures in `apps/web-e2e/src/integration/fixtures/api.ts`. The pool is **6 premium / 6 free / 2 admin** seats; use seats ≥ 2 when a spec needs two distinct same-tier identities in one league. See [tiered-auth.integration.spec.ts](../../../../apps/web-e2e/src/integration/tests/tiered-auth.integration.spec.ts) (LS-8055).

### Review-checklist guard

When reviewing (self-review or PR review) any new spec, ask:

- Does the spec call `useTier(page, 'free')` or use `freeJwt` / `freeJwt2`?
- If yes: is there an assertion that the gate engages (upgrade CTA, `PREMIUM_REQUIRED` error, disabled affordance, gate overlay)?
- If no: the spec is testing a premium-gated feature against a free user with no gate assertion. **Switch it back to the premium default** unless the gate assertion is added.

This is the LS-5030 footgun in a single check — see `.agents/skills/pr-lifecycle/references/self-review.md`.
