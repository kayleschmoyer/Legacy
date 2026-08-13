# Handoff: Sign-in Screen Redesign ("2a — Lifted Abstract")

## Overview
Redesign of the mobile sign-in screen for **bkrupa/legacy-sports**. Replaces the baseball-specific "Step up to the plate" headline with the sport-neutral brand lockup ("LEGACY SPORTS / Where history plays on."), removes Discord, and lifts the brand block to the upper third so the Google button sits directly beneath it. Also applies to the matching cold-start splash continuity (BrandedSplash already uses this lockup).

## About the Design Files
`2a-sign-in.html` in this bundle is a **design reference created in HTML** — a prototype showing intended look, not production code. Recreate it in the existing codebase environment: **React Native + Tamagui**, by modifying:
- `lib/shared-components/src/features/auth/LoginPage.tsx` (card → full-bleed layout, copy, buttons)
- `apps/app/src/app/login.tsx` (screen container — unchanged except it no longer passes `onDiscordSignIn`)

Use the existing Tamagui theme tokens (`$brandGoldLight`, `$textMuted`, etc.) — never raw hex (repo rule: `.agents/skills/ui/references/brand-colors.md`; hex values below are the dark-theme resolutions for reference).

## Fidelity
**High-fidelity.** Colors, type, and spacing are final and sourced from `@legacy-sports/design-tokens` and `lib/tamagui-config`. Recreate pixel-perfectly with the repo's tokens and fonts.

## Screens / Views

### Sign-in (390×844 reference frame)
- **Purpose**: OAuth-only sign-in (Google). Biometric shortcut button (existing) may render below the Google button unchanged.
- **Layout**: Full-bleed column, no card. Page: `$background` (#0A0F1A), padding 32px top / 28px sides / 28px bottom. Background wash: `radial-gradient(ellipse at 50% -10%, rgba(27,58,92,0.35) 0%, transparent 55%)` (web only; native may use a top-anchored LinearGradient of `$brandNavy` at 0.35 → transparent, or omit).
- **Brand block** — column, centered, gap 16px, margin-top 96px from status bar:
  1. Gold rule: 48×2px, radius 2, `rgba(197,165,90,0.65)` (matches BrandedSplash accent rule)
  2. Wordmark: "LEGACY SPORTS" — Big Shoulders Display 800, 44px/44px, letter-spacing 1px, `$brandGoldLight` (#D4BB78), centered
  3. Tagline: "Where history plays on." — Literata italic 400, 15px, `$textMuted` (#9CAAC5)
- **Sign-in block** — margin-top 56px below tagline, column gap 12px:
  1. Label: "SIGN IN TO CONTINUE" — Literata 700, 10px, letter-spacing 1.6px, uppercase, `$fg4` (#6C80BA), centered, margin-bottom 4px
  2. Google button: height 52, background white, border 1px `rgba(0,0,0,0.12)`, radius 12; content centered, gap 12: official Google G glyph 20px (`BrandIcon name="google"`) + "Continue with Google" Literata 700 14px `#1f1f1f`. Press: background `#f4f4f5`. Loading: existing spinner + "Connecting to Google…" behavior from LoginPage.tsx is unchanged.
- **Legal** — pinned to bottom (flex spacer between sign-in block and legal): "By continuing, you agree to our Terms of Service and Privacy Policy." — Literata 400, 12px/18px, `$fg4` (#6C80BA), centered. No divider line above it (unlike the old card).

## Interactions & Behavior
- Google button → existing `handleGoogleSignIn` flow (loading state, error banner).
- **Removed**: Discord button (`onDiscordSignIn` no longer passed / rendered). Apple button logic (iOS gate) unchanged if still required for App Store 4.8.
- Error banner: keep LoginPage's existing error XStack (seam-red soft background) rendered below the Google button.
- Biometric button (when available): keep existing style (`$brandNavy` bg, `$accentMuted` border, `$brandGold` text), rendered below Google.
- No text inputs → no keyboard handling needed (unchanged).

## State Management
Unchanged from current `login.tsx`: `isGoogleLoading`, `errorMessage`, biometric state, post-login redirect.

## Design Tokens (dark-theme resolutions)
- `$background` #0A0F1A · `$brandNavy` #1B3A5C · `$brandGoldLight` #D4BB78 · gold rule rgba(197,165,90,0.65)
- `$textMuted`/fg3 #9CAAC5 · fg4 #6C80BA · `$fg1` #F8FAFC
- Radius: button 12px · Button height: 52px
- Fonts: Big Shoulders Display (800) headings, Literata (400 italic, 700) body — already registered via expo-font / fonts.css

## Assets
- Google G glyph and gold rule: already in repo (`BrandIcon.tsx` `google` glyph; BrandedSplash gold rule). No new assets.

## Files
- `2a-sign-in.html` — standalone reference of option 2a (open in any browser)
- Source-of-truth design doc: `Sign In Redesign.dc.html` in the design project (option 2a)
