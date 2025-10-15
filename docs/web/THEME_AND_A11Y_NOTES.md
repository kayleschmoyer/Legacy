# Theme accents and a11y patterns

This document summarizes the recent theme and accessibility improvements applied to the web app and how to use them going forward.

## Sport accent tokens

Shared in `lib/tamagui-config`: tokens for baseball and football accents provide sport-specific CTAs and highlights while keeping the core brand palette consistent.

- `$sportBaseballPrimary`, `$sportBaseballSecondary`
- `$sportFootballPrimary`, `$sportFootballSecondary`

Use these on prominent buttons or badges in sport-specific screens. Keep AA color contrast (4.5:1 for body text, 3:1 for large text/UI components). When in doubt, prefer the “Primary” token for backgrounds and ensure text color is `$color` or another high-contrast token.

## Focus-visible and skip link

Global CSS includes a focus-visible outline fallback and a skip link pattern:

- Keyboard users get a consistent outline via `:focus-visible` with `--focusRing` fallback.
- The skip link (`<a class="skip-link sr-only" href="#main-content">`) becomes visible on focus. Ensure your main content container has `id="main-content"`.

## Global polite announcer

We added a single, application-wide screen reader announcer.

- Component: `GlobalAnnouncer` (mounted in `apps/web/src/app/app.tsx`)
- Helper: `announcePolite(message: string)` in `apps/web/src/utils/a11y.ts`

Usage example:

```ts
import { announcePolite } from '@/utils/a11y';

announcePolite('Your roster was updated');
```

Use this for non-critical confirmations or “toast-like” updates. For errors or urgent warnings, continue to use in-context error text and, when appropriate, `aria-live="assertive"` near the source control.

## Radiogroups and keyboard patterns

The draft board implements radiogroups for filters and view modes with arrow/Home/End navigation. When adding new selection groups, follow the same pattern:

- role="radiogroup" with a descriptive label
- each control as role="radio" with `aria-checked="true|false"`
- keyboard handling for ArrowLeft/Right/Up/Down and Home/End

## Reduced motion

Animations respect `prefers-reduced-motion: reduce`. Keep animated effects optional and avoid essential information relying on animation only.

## Testing

- Unit: Jest + RTL a11y tests exist for the draft board semantics and keyboard behavior.
- E2E: Playwright responsive snapshots cover `/baseball` and `/baseball/draft`. Add more routes as needed when screens become critical to flows.

## Contributing

- Prefer semantic HTML roles/landmarks (main, nav, aside) and proper labeling.
- Use `aria-busy` during async work and announce completion via the polite announcer.
- Ensure all interactive elements are keyboard focusable and operable without a mouse.
