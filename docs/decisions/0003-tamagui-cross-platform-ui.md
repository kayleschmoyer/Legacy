# 0003. Use Tamagui for cross-platform web/native UI

Date: 2025-04-10

## Status

Accepted

## Context

When the React Native mobile app (`apps/app`) was added alongside the existing
Vite/React web app (`apps/web`), a choice had to be made about how to build UI:

- **Duplicate per platform** — maintain entirely separate component sets for web
  and native. Full design freedom per platform but doubles every UI implementation,
  doubles every bug fix, and diverges visually over time.
- **React Native Web + Tailwind** — compile RN primitives to DOM elements via
  `react-native-web`, style with Tailwind on web and `StyleSheet` on native. Two
  styling systems in one codebase; Tailwind class purging conflicts with RN Web's
  runtime style injection.
- **Native Base / React Native Paper** — good RN ecosystem support but web
  rendering is secondary; bundle size on web is large and customization requires
  theme overrides that diverge from the design system.
- **Tamagui** — a compile-time UI kit that targets both React DOM and React Native
  from a single component definition. Uses a single token-based theme, flattens
  styled components at build time (removing runtime overhead), and exposes media
  query props (`$gtMd`, `$sm`, etc.) directly on every component.

The team's constraint: a small frontend team that could not realistically maintain
two separate component implementations long-term.

## Decision

We will use **Tamagui** for all shared UI, housed in `lib/shared-components`.
Both `apps/web` and `apps/app` consume these components.

- Shared components live in `lib/shared-components` and are Tamagui primitives
  (`Stack`, `Text`, `XStack`, `YStack`, styled variants, etc.).
- Platform-specific behavior is handled via media props (`$gtMd: { display: 'flex' }`)
  or the `useMedia` hook — no per-platform duplicates.
- The web app's Vite config and the mobile app's Metro config both include the
  Tamagui compiler plugin, enabling compile-time style flattening.
- `apps/web` and `apps/app` may each have a thin adapter layer for platform-specific
  navigation or native API calls, but visual components are always built in
  `lib/shared-components` first.

## Consequences

### Easier

- A UI bug fix in `lib/shared-components` is instantly live on both platforms.
- The design token system (`tamagui.config.ts`) is the single source of truth for
  colors, spacing, and typography — no Tailwind config to keep in sync.
- Tamagui's compile-time flattening removes styled-component wrapper overhead; web
  bundle size is competitive with hand-written CSS.

### Harder

- Tamagui's `tag` prop renders as the actual HTML host element at runtime (e.g.
  `<Stack tag="tr">` renders a real `<tr>`), which can surprise developers who
  assume React Native style visual flattening. E2E selectors must target real
  HTML tags, not React component names.
- `data-testid` and `testID` are sometimes dropped on Tamagui-styled components
  with `role="radio"` or similar a11y roles in the web build. Locate by
  `role` + accessible name in E2E tests.
- Upgrading Tamagui requires validating both the web build (Vite) and the mobile
  build (Metro) — a single upgrade PR touches two compilation pipelines.
- Not every React Native ecosystem library has a Tamagui-compatible counterpart;
  complex animated components may need manual bridging.

### Now constrained

- **New visual components must be built in `lib/shared-components` first**, not
  in `apps/web` or `apps/app` directly. Platform-specific code is allowed only
  when the component genuinely has no shared surface (e.g. a native OS permission
  dialog). See `docs/architecture/shared-components.md` for the layering rules.
- **Do not import `react-native` primitives directly in `apps/web`** — all
  cross-platform primitives come from `lib/shared-components` via Tamagui wrappers.
