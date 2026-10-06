# Feature: Premium Status Display

**Jira:** LS-5641
**Page:** `profile-settings` (Epic LS-5293)
**Platforms:** web, mobile-web, android
**Entitlement:** mixed

## Description

Shows premium vs free badge / status on the profile settings page.

## Implementation

Native: "Subscription & Billing" card in `profile-settings.tsx` ("Premium (Annual|Monthly)" vs "Free plan — tap to upgrade", `subscription-warning-chip`). Web: **not implemented** on `ProfileSettingsPage.tsx` (only the access-level badge).

## Platform coverage

| Platform | Harness    | Spec / Flow                                                      | Status  |
| -------- | ---------- | ---------------------------------------------------------------- | ------- |
| web      | Playwright | `apps/web-e2e/src/tests/profile-settings-premium-status.spec.ts` | pending |
| android  | Maestro    | `maestro/flows/profile-settings/premium-status-display.yaml`     | pending |

`mobile-web` is exercised by the same web spec under the Mobile Chrome / Mobile Safari Playwright projects (`profile-settings` specs are not excluded from them), so it has no separate row.

## Existing coverage

No existing hermetic E2E coverage.

Unit / component coverage (supporting evidence only — does not make a row `covered`):

- `apps/app/src/app/(app)/(tabs)/(home,leagues,players,games,you)/profile-settings.spec.tsx`: "subscription grace state (LS-7228)", "navigation" (subscription-settings press)

## Pending assertions

### web — `apps/web-e2e/src/tests/profile-settings-premium-status.spec.ts` (4)

- [ ] Premium user (`useTier(page, "premium")`): premium status indicator renders (blocked by LS-7226 / LS-7230 / LS-7234 — web has no subscription card or badge)
- [ ] Free user (`useTier(page, "free")`, explicit gate assertion): free / upgrade state renders and no premium indicator
- [ ] Free-state upgrade CTA navigates to `/profile/subscription`
- [ ] Grace state (past_due or cancel-at-period-end) shows the warning, not a plain premium label

### android — `maestro/flows/profile-settings/premium-status-display.yaml` (3)

- [ ] Premium account: Subscription & Billing card shows "Premium (…)"
- [ ] Free account: card shows "Free plan — tap to upgrade"
- [ ] Tap the card; assert the subscription settings screen opens

Maestro flows follow `maestro/flows/trade-center/trade-center.yaml` (`launch-authenticated` subflow, screenshots under `maestro/artifacts/profile-settings/`). They run against a real dev build with `EXPO_PUBLIC_BYPASS_AUTH=true`, so assertions must tolerate seeded data.

## Notes

Real spec-vs-implementation gap already ticketed: LS-7226 (no Subscription card on web), LS-7230, LS-7234; native deep-link LS-7672. No new finding filed. Entitlement is `mixed`: expect premium and non-premium variants.

## Related

- **Epic:** LS-5293 — QA — Page: Profile Settings
- **Implementation ref:** `docs/agents/pages/profile/settings.md`
- **Audit:** LS-10616
