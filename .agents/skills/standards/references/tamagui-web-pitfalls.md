# Tamagui Web Pitfalls

Common mistakes that cause silent layout breakage when Tamagui components render on web.

---

## 1. Numeric `lineHeight` in `style` prop → `1px` (most common)

### Root cause

Tamagui's `normalizeValueWithProperty` (in `@tamagui/web`) mirrors React Native's convention where every numeric style value is treated as pixels — **unless** the property is listed in `stylePropsUnitless`.

`lineHeight` is **not** in `stylePropsUnitless`. It is in `stylePropsFont`, which marks it as a recognised style but does not prevent the `px` suffix. Result:

```
lineHeight: 1    →  CSS  line-height: 1px
lineHeight: 1.55 →  CSS  line-height: 1.55px
lineHeight: 1.02 →  CSS  line-height: 1.02px
```

With a display heading at `font-size: clamp(40px, 4.4vw, 60px)`, the flex layout box shrinks to ~1 px while the glyph overflows 40–60 px downward. Every subsequent sibling is positioned ~1 px below the heading's start, landing in the middle of the visible text — the classic "overlapping content" screenshot.

The code path in `@tamagui/web/dist/cjs/helpers/normalizeValueWithProperty.cjs`:

```js
// value=1, property="lineHeight"
stylePropsUnitless['lineHeight']; // → undefined  (not in the set)
typeof value === 'number'; // → true
res = `${value}px`; // → "1px"  ← bug
```

### Fix

Pass the value as a **string** so Tamagui skips the `px` conversion. Because TypeScript's RN style types expect a `number`, cast through `unknown`:

```tsx
// ❌ Wrong — becomes line-height: 1px
style={{ lineHeight: 1 }}
style={{ lineHeight: 1.55 }}

// ✅ Correct — becomes line-height: 1 (unitless ratio)
style={{ lineHeight: ('1' as unknown as number) }}
style={{ lineHeight: ('1.55' as unknown as number) }}
```

This pattern is consistent with how large `fontSize` values are already handled in cross-platform components (e.g. `'clamp(40px, 4.4vw, 60px)' as unknown as number`).

### Affected props

Any numeric style value that should be **unitless** on web is susceptible. The full `stylePropsUnitless` allowlist (as of `@tamagui/helpers` 1.x) is:

```
flex flexGrow flexShrink flexBasis fontWeight
opacity zIndex aspectRatio order orphans widows
columnCount fillOpacity floodOpacity stopOpacity
strokeMiterlimit strokeOpacity
```

Properties **not** in this list — including `lineHeight`, `letterSpacing`, `tabSize`, `lineClamp` — will have `px` appended when passed as numbers.

---

## 2. HTML element default styles leak through Tamagui prop overrides (LS-3712)

### Root cause

Tamagui components that render a semantic HTML element (e.g. `H1` → `<h1>`, `Paragraph` → `<p>`) inherit the browser's UA stylesheet. Tamagui prop overrides (e.g. `margin={0}`) generate a CSS class but **may not win the specificity battle** against the element's base styles in every browser or theme combination.

The fix established in LS-3712 is to move the affected property into the inline `style` object, which always wins:

```tsx
// ❌ Tamagui prop — may lose to <h1> UA margin
<H1 margin={0} style={{ fontFamily: FONT_DISPLAY }}>...</H1>

// ✅ Inline style — highest specificity, always wins
<H1 style={{ fontFamily: FONT_DISPLAY, margin: 0 }}>...</H1>
```

Note: `fontFamily` in Tamagui `H1` has its own override quirk (see `LS-3630`) — always set it via `style`, not as a Tamagui prop.

---

## 3. `position: 'fixed'` / `position: 'sticky'` elements need a layout spacer

### Root cause

A fixed or sticky element is taken out of normal flow — subsequent siblings start from where the fixed element _would_ have been. Without a same-height spacer, content slides under the fixed element.

The `ScoreboardTicker` is a worked example of the correct pattern:

```tsx
return (
  <>
    {/* Spacer — same height as the fixed strip, keeps content below it */}
    <div aria-hidden="true" style={{ height: TICKER_HEIGHT_PX, flexShrink: 0 }} />

    {/* The actual fixed element */}
    <TickerStrip position="fixed" top={NAV_HEIGHT_PX} ...>
      ...
    </TickerStrip>
  </>
);
```

Secondary sticky elements (roster header, toolbar) use the `SECONDARY_STICKY_TOP` constant from `apps/web/src/constants/dimensions.ts` so they clear both the nav bar and the ticker strip.

---

## Quick diagnosis checklist

When you see "content overlaps heading" or "element slides behind nav":

1. **lineHeight bug?** — Search for `lineHeight:` in style props. Any numeric value → add the string cast.
2. **UA margin leak?** — Check if the overlapping element is an `H1`/`H2`/`Paragraph` with `margin` set as a Tamagui prop. Move it to `style`.
3. **Missing spacer?** — Check if the covering element uses `position: fixed` or `position: sticky`. Add a same-height `aria-hidden` sibling spacer.
4. **z-index ordering?** — Check `constants/dimensions.ts`: `NAV_Z_INDEX=200 > TICKER_Z_INDEX=150 > CONTENT_STICKY_Z_INDEX=100`.
