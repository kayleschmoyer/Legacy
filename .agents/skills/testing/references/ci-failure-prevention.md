# CI Failure Prevention

Patterns derived from analysis of the last 100 merged PRs. **22 of 100 PRs hit a CI failure label before merging.** The three categories below account for all of them. Addressing these at write-time eliminates the reactive fix-push → re-wait cycle.

## Failure frequency

| Category                            | Count | % of CI failures |
| ----------------------------------- | ----- | ---------------- |
| `CI: E2E Failure`                   | 19    | 86%              |
| `CI: Migration`                     | 2     | 9%               |
| `CI: Build Failure` (infra/billing) | 1     | 5%               |

> **Note on `CI: Build Failure`:** The single instance was a GitHub Actions account-level spending-limit issue — the runner never started, so no code ran. There is no agent-actionable prevention pattern; it self-heals once the billing issue is resolved. Sections 1–4 below cover only the code-level failure categories.

---

## 1. E2E: GrowthBook feature flag not seeded (dominant pattern)

**Symptom in CI logs:**

```
Error: element(s) not found
  - waiting for getByTestId('sport-tab-football')
  > 640 | await expect(page.getByTestId('sport-tab-football')).toHaveAttribute(
```

**Root cause:** The CI runner has no `VITE_GROWTHBOOK_CLIENT_KEY` so GrowthBook defaults every flag to off. Any element whose visibility or presence is gated behind a GrowthBook flag will never appear, and the locator times out.

**Rule:** If a test navigates to a route or asserts on an element that is only rendered when a GrowthBook flag is `true`, you **must** seed that flag via `page.addInitScript()` before `page.goto()`. The script runs before the page bundle loads, so GrowthBook's bootstrap hook will pick up the seeded value.

```ts
// ❌ Bad — element never appears because football_enabled is off in CI
await page.goto('/football/league/create');
await expect(page.getByTestId('sport-tab-football')).toHaveAttribute(
  'aria-selected',
  'true',
);

// ✅ Good — seed the flag before the bundle loads
await page.addInitScript(() => {
  (window as Record<string, unknown>)['__gbSeededFeatures'] = {
    football_enabled: { defaultValue: true },
  };
});
await page.goto('/football/league/create');
await expect(page.getByTestId('football-beta-banner')).toBeVisible({
  timeout: 10000,
});
```

**Checklist before writing a test that touches a flag-gated route:**

1. Does this route require a GrowthBook flag to render its content?
2. If yes → add `page.addInitScript()` with `__gbSeededFeatures` to seed the flag.
3. Assert on the content/element that appears _after_ the flag is active, not on the flag-gate UI itself (e.g., the beta banner, not the sport tab's `aria-selected` attribute).

**Where this matters:** Any route under a feature flag (e.g., `/football/**` behind `football_enabled`), any UI element that renders conditionally on GrowthBook, any `test.skip` that was previously skipping due to "flag not configured in CI".

---

## 2. E2E: Body text comparison fails on Suspense fallback

**Symptom in CI logs:**

```
Error: expect(received).not.toBe(expected) // Object.is equality
  at apps/web-e2e/src/tests/football-hub.spec.ts:611:33
```

**Root cause:** Two different routes (e.g., `/football` and `/baseball`) both render React Suspense fallbacks with identical loading text while their async data loads. A test that compares `page.locator('body').textContent()` between the two pages gets identical text and fails the `not.toBe` assertion.

**Rule:** Never compare `body.textContent()` across routes to verify they show distinct content. Use stable `aria-label` landmarks on page-level containers instead.

```ts
// ❌ Bad — both pages may show the same Suspense fallback text during load
await page.goto('/football');
const footballText = await page.locator('body').textContent();
await page.goto('/baseball');
const baseballText = await page.locator('body').textContent();
expect(footballText).not.toBe(baseballText); // fails when both show "Loading..."

// ✅ Good — aria-label landmarks are only present after the correct content loads
await page.goto('/football');
await expect(
  page.locator('[aria-label="Football fantasy landing page"]'),
).toBeVisible({ timeout: 10000 });

await page.goto('/baseball');
await expect(
  page.locator('[aria-label="Baseball fantasy landing page"]'),
).toBeVisible({ timeout: 10000 });
```

**Follow-on:** The production component that renders these pages must add the `aria-label` attribute to its outer container. If you add the E2E test assertion first, make sure the matching attribute exists in the component code — otherwise the CI failure shifts from a body-text race to an "element not found" error.

---

## 3. E2E: Asserting on inherited attribute state without waiting for hydration

**Symptom in CI logs:**

```
Error: expect(locator).toHaveAttribute(expected) failed
Expected: "true"
Locator: getByTestId('sport-tab-football')
Error: element(s) not found
```

**Root cause:** The test asserts on an attribute (e.g., `aria-selected="true"`) that is set by JavaScript after hydration. When combined with a GrowthBook flag that controls whether the element renders at all, you get two failure modes: (a) element not found because the flag is off; (b) element found but attribute not yet set because hydration hasn't completed.

**Rule:** Prefer asserting on a higher-signal element whose presence already encodes the state you need, rather than asserting on an attribute that may update asynchronously.

```ts
// ❌ Bad — two failure modes: element absent (flag off) or attribute not set (hydration lag)
await expect(page.getByTestId('sport-tab-football')).toHaveAttribute(
  'aria-selected',
  'true',
);

// ✅ Good — the beta banner only renders when football is active and hydrated
await expect(page.getByTestId('football-beta-banner')).toBeVisible({
  timeout: 10000,
});
// or assert on a heading that only renders in football mode
await expect(
  page.getByRole('heading', { name: /Create Football League/i }),
).toBeVisible({ timeout: 10000 });
```

**Corollary:** Always add an explicit `timeout` when asserting on elements that depend on GrowthBook flags or async data. The default Playwright timeout (5s) is often too short when a flag seed + route load + React hydration all have to complete. Use `{ timeout: 10000 }` as a baseline for flag-gated elements.

---

## 4. Migration check: unapplied migration files block CI

**Symptom in CI logs:**

```
📊 Migration summary: 187 applied in DB, 190 files on disk
❌ 3 migration file(s) have NOT been applied:
Run `pnpm exec nx run db:migrate` to apply pending migrations.
```

**Root cause:** The `Verify All Migrations Applied` CI check (`scripts/check-migrations-applied.js`) connects to the CI reference database using a `ci_readonly` role and compares every `.ts` file under `lib/db-client/migrations/` against the list of applied migrations in `drizzle.__drizzle_migrations`. When you add new migration files in a PR, those files exist on disk but the CI database has not yet had them applied — so the count diverges and CI applies the `CI: Migration` label and blocks merge.

**Rule:** After writing any new migration file under `lib/db-client/migrations/`, apply it to the dev database before pushing:

```bash
pnpm exec nx run db:migrate
```

This ensures the migration is syntactically valid (it will error out here if there's a SQL or TypeScript problem). See [`.agents/skills/database/SKILL.md`](../../database/SKILL.md) for the full migration authoring workflow.

**Note on deploy-lag false positives:** The CI reference DB is updated by the deploy pipeline after each merge to `main`. If the check lists unapplied filenames that belong to _other recently-merged PRs_ (not your own new files), this is a deploy-lag false positive — the check will self-heal after those migrations propagate through the deploy pipeline. Verify this by comparing the listed unapplied filenames against what your PR actually added.

---

## Pre-write checklist

Before pushing any change that touches E2E tests or database migrations, verify:

**E2E tests:**

- [ ] If the tested route is behind a GrowthBook flag → `page.addInitScript()` seeds `__gbSeededFeatures` with `{ flagName: { defaultValue: true } }`
- [ ] Assertions use `aria-label` landmarks or semantic roles, not `body.textContent()` comparisons
- [ ] Timeouts are `{ timeout: 10000 }` or greater for any flag-gated or async-loaded element
- [ ] Assertions target the rendered _content_ (heading, banner, landmark), not the attribute state of the flag-gate control itself
- [ ] New test files are built locally (`pnpm exec nx build web`) and the affected tests run green before push

**Database migrations:**

- [ ] `pnpm exec nx run db:migrate` applied the new migration without errors
- [ ] Migration file is a valid TypeScript file under `lib/db-client/migrations/` (correct extension, correct directory)

---

## Related references

- [e2e-determinism.md](e2e-determinism.md) — the 12 levers that eliminate flake (includes the full antipattern catalog)
- [playwright-best-practices.md](playwright-best-practices.md) — locator conventions, timeout patterns
- [e2e-ci-and-validation.md](e2e-ci-and-validation.md) — CI pipeline structure, local pre-commit validation steps
- [database SKILL.md](../../database/SKILL.md) — migration authoring and apply workflow
