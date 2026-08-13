# League Detail — persistent guidance

Rules derived from responsive iteration on this prototype. They are easy to re-derive
badly and easy to lose between sessions — read them before changing layout, padding, or
hit targets here. Tracked by LS-9414.

## Responsive density

Tiers: XXS <380 · XS <600 · MD ≥780 (tabs reappear).

1. **Chrome shrinks before content.** Tab bar 10px/15px padding (9px/13px at ≤780,
   9px/11px at ≤380), week pager 8px/14px, card interiors 15px (≤600) / 13px (≤380),
   card title 16px at ≤380. Desktop 20px card padding is too heavy for a ~300px column.
2. **Hit areas are decoupled from visual size.** Any control under 44px on touch gets a
   transparent `::after`/`::before` inset expansion instead of being made physically
   bigger — tabs, `.ls-navbtn` (32px visual, −6px inset), `.ls-icon-mini`, `.ls-btn.sm`,
   `.ls-backlink`.
3. **Cut repeated content, don't just tighten it.** Facts constant across tabs (sport,
   scoring format, team count, invite code, season-status chip) belong on Overview, not
   in every tab's header.

## Phone header structure (≤600)

Two lines total: breadcrumb + role badge, then league name with the week riding beside
it (`h1` goes `display:inline`, `.ls-hero-status` inline, status chip hidden). Crest,
Invite action, era, and the stacked meta grid are all hidden. Padding 20/18/22
(18/15/20 at ≤380), 16px under the breadcrumb line.

## Known xxs gaps (not yet addressed)

- `.ls-player-row` wraps actions to a second line at ~340px.
- Commissioner badge is icon-only at ≤600 and reads as decoration.

## Unresolved: these thresholds are not the canonical bands

The 380 / 600 / 780 tiers above do **not** correspond to the repo's canonical
breakpoints in `lib/design-tokens/src/lib/breakpoints.ts`
(`xxs: 0, xs: 660, sm: 800, md: 860, lg: 980, xl: 1120, xxl: 1280`), which
`league-styles.css` currently snaps to via its `@979 / @859 / @799 / @659` tiers and
documents in its own header comment.

Before implementing against this guidance, resolve which vocabulary wins — either
re-snap these numbers to the canonical bands, or record here that League Detail
intentionally uses its own sub-thresholds, so the next agent does not "fix" the drift.
See LS-9414.
