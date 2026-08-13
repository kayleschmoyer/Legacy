---
name: ui-responsive-density
description: 'Breakpoint tiers, density ladder, touch-target minimums, and content-reduction rules for narrow viewports. Load before changing padding, type size, hit targets, or what a surface shows at phone widths.'
---

# Responsive Density

`shared-components-first` owns **structure** — build once, adapt by viewport, never by platform. This reference owns **density**: how much a surface tightens as the viewport narrows, how small a control may look, and what it stops showing.

Structure answers "one column or two." Density answers "how much padding, how big a tap target, how much content."

## Doing responsive work? Read these

Guidance is split by concern. For anything non-trivial you want all four:

| Concern                                                    | Where                                                                                      |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Which tier, how much padding, hit targets, what to cut     | **This page**                                                                              |
| Structure — build once, adapt by viewport, 6 anti-patterns | [`shared-components-first/SKILL.md`](../../shared-components-first/SKILL.md)               |
| Review gates that block a PR                               | [`common-review-patterns.md` #47](../../pr-lifecycle/references/common-review-patterns.md) |
| Verifying it in E2E                                        | [`playwright-best-practices.md`](../../testing/references/playwright-best-practices.md)    |

Adjacent Tamagui rendering traps that bite while restyling per tier — string `letterSpacing` crashing native `RCTText`, numeric `lineHeight` collapsing to `1px`, `position: sticky` needing a layout spacer — live in [`tamagui-native-pitfalls.md`](../../standards/references/tamagui-native-pitfalls.md) and [`tamagui-web-pitfalls.md`](../../standards/references/tamagui-web-pitfalls.md).

## Tier table — ground truth

These are the media tokens Tamagui actually compiles, read from `@tamagui/config`'s `media` export. **Use the token names, never raw pixel values** — pixels drift, token names do not.

| Token  | Fires at | `gt` counterpart   | Typical use                          |
| ------ | -------- | ------------------ | ------------------------------------ |
| `$xxs` | ≤ 390px  | —                  | Smallest phones. Last-resort tier.   |
| `$xs`  | ≤ 660px  | `$gtXs` (≥ 661px)  | Phone. The main "compact" tier.      |
| `$sm`  | ≤ 800px  | `$gtSm` (≥ 801px)  | Large phone / small tablet portrait. |
| `$md`  | ≤ 1020px | `$gtMd` (≥ 1021px) | Tablet. Multi-column starts above.   |
| `$lg`  | ≤ 1280px | `$gtLg` (≥ 1281px) | Laptop.                              |
| `$xl`  | ≤ 1650px | `$gtXl` (≥ 1651px) | Desktop.                             |

Two things that bite:

- **There is no `$xxl` and no `$gtXxs`.** `lib/design-tokens/src/lib/breakpoints.ts` defines both. Tamagui has no equivalent, so `$xxl={{ … }}` in JSX is silently inert — it compiles, lints, and does nothing. See [Known drift](#known-drift) before trusting that file.
- **`$xxs` does not default to active.** Every other tier is treated as matching before measurement (`mediaQueryDefaultActive.xxs === false`); `$xxs` is not. So the first paint, SSR output, and jest renders all take the non-`$xxs` branch. Never put content-critical rendering behind `$xxs` alone — use it to tighten, never to reveal.

## 1. Chrome shrinks before content

Interface chrome — tab bars, pagers, card padding, headers — gives up space first. The data the user came for is the last thing to shrink.

Desktop padding is routinely too heavy for a narrow column: a 20px card interior on a ~300px viewport spends 13% of the width on nothing.

**The ladder: step down one space token per tier.** Space tokens are `$1`=4, `$2`=8, `$3`=12, `$4`=16, `$5`=20, `$6`=24, `$7`=32.

```tsx
<Card
  padding="$5" // 20px — desktop
  $xs={{ padding: '$4' }} // 16px — phone
  $xxs={{ padding: '$3' }} // 12px — smallest phones
/>
```

Same ladder for type: a 20px card title steps to 18 then 16, not 20 then 12. One step per tier, no cliffs.

Do not tighten `gap` and `padding` on the same element in the same tier unless the result was actually measured — the two compound and content starts colliding.

## 2. Hit areas are decoupled from visual size

**Minimum interactive box: 44×44px, at every tier, on every platform.** A control may _look_ 32px or 28px. Its pressable box may not be smaller than 44.

Never solve this by making the control physically bigger — that wrecks the density work in §1. Separate the two boxes: **an outer pressable sized ≥44 with a transparent background, wrapping an inner visual element at its designed size.**

```tsx
// Outer box is the hit area; inner box is what the user sees.
<Stack
  onPress={onPress}
  minWidth={44}
  minHeight={44}
  alignItems="center"
  justifyContent="center"
  backgroundColor="transparent"
>
  <Stack
    width={32}
    height={32}
    borderRadius="$2"
    backgroundColor="$surfaceCard"
  >
    <ChevronLeft size={16} color="$color" />
  </Stack>
</Stack>
```

Sizing shortcut: the padding each side needs is `(44 − visual) / 2`. A 32px control needs 6px; a 28px control needs 8px.

**Two mechanisms that do not work — do not reach for either:**

- **`hitSlop` is web-broken.** react-native-web implements it only on the legacy `Touchable` export. `Pressable` and `View` — what Tamagui primitives compile to — contain zero references to it. On native it works; on web it is silently dropped, so the control keeps its 32px hit box and nothing warns you. Native-only surfaces may use it; anything in `lib/shared-components` may not.
- **`::after` / `::before` inset expansion is web-only.** Pseudo-elements do not exist in React Native. A shared component relying on one has no hit area at all on native.

The padded-wrapper pattern above is the only approach that behaves identically on both platforms, which is also why it satisfies `shared-components-first`'s prohibition on platform branches that change layout.

## 3. Cut repeated content, don't just tighten it

Below `$xs` there is a point where tightening stops working and the answer is to show less.

**A fact that is constant across a surface's sub-views belongs in one place on that surface, not in every sub-view's header.** On a league, that is sport, scoring format, team count, invite code, and season status — true on every tab, so they live on Overview and nowhere else. The same test applies to any tabbed or paged surface.

Reduction order, applied in sequence:

1. **Decorative and redundant chrome** — crests, avatars, era labels, separators.
2. **Facts available one level up** — anything the parent screen already stated.
3. **Secondary actions** — collapse into an overflow rather than dropping them.
4. **Structural collapse** — multi-column meta grids fold into inline text; headers go from stacked to a single line.

Never drop a **primary** action or the surface's own identity. If a tier has nothing left to cut and still overflows, the layout is wrong for that tier — reach for a different arrangement, not a smaller font.

Hiding is real work: an element hidden at `$xs` must not be the only route to a feature. Confirm the path still exists at that width.

## Checklist

- [ ] Padding/type step **one** space token per tier — no cliffs
- [ ] Every interactive box is ≥44×44, verified at `$xxs`
- [ ] No `hitSlop` in `lib/shared-components`; no `::after` insets for hit area anywhere
- [ ] Nothing content-critical is gated behind `$xxs` alone
- [ ] Anything hidden at a narrow tier is reachable another way
- [ ] Tested by dragging a desktop browser narrow, not only in a device emulator — the same widths must produce the same layout

## Pitfalls

### Unit tests do not exercise any of this — and lie in two directions

Both jest setups mock `matchMedia` to return `matches: false` for **every** query
([`lib/shared-components/src/test-setup.ts`](../../../../lib/shared-components/src/test-setup.ts),
[`apps/web/src/test-setup.ts`](../../../../apps/web/src/test-setup.ts)). Nothing matches, ever.
The two halves of Tamagui's responsive system then fail in opposite directions:

- **Style overrides don't apply.** `$xs={{ padding: '$4' }}` is inert, so the component renders
  at its **base** — i.e. desktop — density.
- **Conditionals take the false branch.** `media.gtMd ? <Wide/> : <Narrow/>` renders `<Narrow/>`.

So a unit test sees the **narrow structure at desktop density** — a combination no real viewport
ever produces. A green test says nothing about whether either tier is correct, and a snapshot
taken this way locks in the fiction.

Consequences to plan around:

- Never treat unit tests as coverage for a responsive change. They cannot fail on one.
- Don't "fix" a layout because a jest snapshot looks wrong at a width — check a real viewport first.
- Responsive regressions are caught in E2E at explicit viewport sizes, or not at all. Add the case
  there. See [`playwright-best-practices.md`](../../testing/references/playwright-best-practices.md).
- If a component genuinely needs unit coverage of both branches, take `isNarrow` as a prop with a
  detected default (the `MinigamesHub` pattern) so tests can drive it directly.

### The rest, in one place

| Pitfall                                                        | Detail                                                                                         |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `hitSlop` silently dropped on web                              | [§2](#2-hit-areas-are-decoupled-from-visual-size)                                              |
| `::after` / `::before` insets don't exist on native            | [§2](#2-hit-areas-are-decoupled-from-visual-size)                                              |
| `$xxl` / `gtXxs` compile but never fire                        | [Tier table](#tier-table--ground-truth)                                                        |
| `$xxs` inactive before measurement — SSR/first paint/jest      | [Tier table](#tier-table--ground-truth)                                                        |
| `gap` + `padding` tightened together compound into collisions  | [§1](#1-chrome-shrinks-before-content)                                                         |
| Responsive tokens dropped when extracting to shared-components | [`shared-components-first`](../../shared-components-first/SKILL.md) has a `grep -c` diagnostic |
| Platform branch used where a breakpoint belongs                | [review pattern #47](../../pr-lifecycle/references/common-review-patterns.md) — blocks the PR  |

## Known drift

`lib/design-tokens/src/lib/breakpoints.ts` says it mirrors `@tamagui/config`. It partly does not:

| Token | design-tokens | Tamagui (real)    |
| ----- | ------------- | ----------------- |
| `xs`  | 660           | 660 ✅            |
| `sm`  | 800           | 800 ✅            |
| `md`  | 860           | **1020**          |
| `lg`  | 980           | **1280**          |
| `xl`  | 1120          | **1650**          |
| `xxl` | 1280          | **no such token** |

That file is the right source for **raw numbers in non-Tamagui contexts** (web-only CSS, canvas, native measurement). It is _not_ a guide to what `$md`/`$lg` do in JSX. When writing media props, this page's table wins. Reconciliation is tracked separately — see LS-9416.
