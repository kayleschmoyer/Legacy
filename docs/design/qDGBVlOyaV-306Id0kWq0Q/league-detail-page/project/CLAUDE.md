# League Detail — persistent guidance

The app-wide responsive rules that came out of this page now live in
[`.agents/skills/ui/references/responsive-density.md`](../../../../../.agents/skills/ui/references/responsive-density.md)
— density ladder, the 44px touch-target floor, and the reduction order for narrow tiers.
**Read that first.** This file covers only what is specific to League Detail.

## Tier mapping

This prototype is HTML/CSS, so it uses raw `@media` breakpoints. The implementation is
Tamagui and uses media props. The mapping (this resolves the open question in LS-9414 —
express tiers as token names, not the prototype's raw pixels):

| Prototype tier   | Implement as       | Fires at |
| ---------------- | ------------------ | -------- |
| XXS (<380)       | `$xxs`             | ≤390     |
| XS (<600)        | `$xs`              | ≤660     |
| Tabs reappear    | `$gtSm`            | ≥801     |

The prototype's own `@media` tiers (`@979 / @859 / @799 / @659`) are documented in the header
comment of `league-styles.css` and snap to `lib/design-tokens`' band table. Those bands are
**not** what Tamagui media props fire at — see the drift table in the reference above before
porting any threshold literally.

## Phone header structure (`$xs`)

Two lines total: breadcrumb + role badge, then league name with the week riding beside it
(`h1` goes `display:inline`, `.ls-hero-status` inline, status chip hidden). Crest, Invite
action, era, and the stacked meta grid are all hidden. Padding 20/18/22 (18/15/20 at `$xxs`),
16px under the breadcrumb line.

This is the page's own hero arrangement, not a general pattern — a two-line header is right
here because the league name and current week are the only two facts that change per view.

## What this page cuts, and why

Sport, scoring format, team count, invite code, and season-status chip are constant across
every tab, so they live on Overview and appear in no other tab's header. This is the worked
example behind the app-wide "cut repeated content" rule.

## Resolved gaps (LS-9419)

- `.ls-player-row` keeps `.ls-player-actions` on one line down to 320px via a scoped
  `@media (max-width: 390px)` override (gap/padding stepped down one space token).
- The commissioner badge (`LeagueHero.jsx`) goes icon-only below `$xs` (799px tier) — its label
  text is wrapped in `.ls-chip-commish-label` and hidden there, but the chip carries
  `aria-label="Commissioner"` so it still reads as a role, not decoration. No `::after`/`::before`
  hit-area technique was introduced — the badge isn't interactive, so it has no hit target to size.
