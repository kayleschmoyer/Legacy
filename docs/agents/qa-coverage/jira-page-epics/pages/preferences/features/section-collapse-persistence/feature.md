# Feature: Collapsible Section State Persistence

**Jira:** LS-5614
**Page:** `preferences` (Epic LS-5290)
**Platforms:** web, mobile-web, android (declared; implemented on web only — see LS-7664)
**Entitlement:** all

## Description

The Appearance / Sports & Stats / Notifications sections each have a `SectionHeader` with `aria-expanded`; collapsed bodies are `inert` + `aria-hidden` (`CollapsibleBody`). State persists in localStorage key `ls_prefs_sections_collapsed`; corrupt JSON falls back to all-expanded with a warning. Native's Preferences screen has no collapsible sections by design (LS-7664 documents this as a web-only behavior).

## Source

Extracted from: `docs/agents/pages/preferences.md`

## Platform coverage

| Platform | Harness    | Spec / Flow                                                         | Status  |
| -------- | ---------- | ------------------------------------------------------------------- | ------- |
| web      | Playwright | `apps/web-e2e/src/tests/preferences-section-collapse.spec.ts` (new) | pending |
| android  | Maestro    | — (feature not implemented on native; LS-7664)                      | n/a     |

The android row is `n/a` even though the story declares android: there is nothing to automate. LS-7664 resolves the platform ambiguity; once it lands, the story's `**Platforms:**` line should drop android.

## Existing coverage

### Unit tests

- `apps/web/src/pages/preferences/PreferencesPage.collapsed-sections.spec.tsx` — `loadCollapsedSections`: defaults, restores stored state, corrupt JSON → all expanded + warning
- `apps/web/src/pages/preferences/CollapsibleBody.spec.tsx` — `sets inert and aria-hidden when collapsed`; `omits inert when expanded`
- `apps/web/src/pages/preferences/PreferencesPage.error-collapse.spec.tsx` — error card overrides collapsed state

### E2E tests

None.

## Pending assertions

### web — `apps/web-e2e/src/tests/preferences-section-collapse.spec.ts` (4)

1. Clicking the Appearance header sets `aria-expanded="false"` and hides its content (`Theme` label no longer visible/interactive); clicking again restores it.
2. After collapsing Appearance, `page.reload()` keeps it collapsed and `ls_prefs_sections_collapsed` contains `appearance: true`; the other sections remain expanded.
3. Sections are independent: collapse Sports & Stats, navigate away (`/`) and back, Sports & Stats is still collapsed, Appearance state unchanged.
4. Corrupt storage: seed `ls_prefs_sections_collapsed` with `{not json`, load the page, all sections are expanded and the page does not crash.

## Known defects (existing tickets)

LS-7096 (device-local, not synced) In Review — being worked elsewhere; LS-7097, LS-7098 Done; LS-7664 (web-only) To Do.
