# Tamagui / React Native — Native-Only Pitfalls

Crashes and defects that happen **only on iOS/Android** (never on web, never in jest).
These are the mirror image of [`tamagui-web-pitfalls.md`](tamagui-web-pitfalls.md): there the
web renderer misbehaves; here the **native** renderer rejects values that web accepts.

The unifying rule: `apps/web` (react-native-web) and the jest suites (jsdom + react-dom)
accept **CSS strings** for style values. The native renderer does **not** — many style
props must be a **number**. A value that renders fine on web and passes every test can hard-crash
the native UI thread.

---

## 1. String `letterSpacing` (and other numeric-only props) crash native `RCTText`

### Symptom

The app **closes entirely** the moment the screen mounts. There is **no red box**, the JS
`ScreenErrorBoundary` never fires, and nothing reaches Rollbar — because the throw is on the
**native UI thread**, not in JS. A full native logcat shows:

```
JSApplicationIllegalArgumentException: Error while updating property 'letterSpacing'
  of a view managed by: RCTText
Caused by: java.lang.ClassCastException: java.lang.String cannot be cast to java.lang.Double
```

(Filtered logcat — e.g. `ReactNativeJS:V` only — often shows **nothing**, which is why this
reads as "crash with no logs.")

### Root cause

React Native's `RCTText`/`RCTTextView` view manager types `letterSpacing` as a `float`/`Double`.
A **string** value (`'0.08em'`, even a unit-less `'0.5'`) forwarded to the native prop setter
does `(Double) value` on a `String` → `ClassCastException` → the UI thread aborts.

On **web**, react-native-web maps the same value to CSS `letter-spacing`, which is valid — so the
bug is invisible on web and in any react-dom/jsdom test.

```tsx
// ❌ CONFIRMED CRASH — string on the Tamagui shorthand PROP reaches native as a string
<Text letterSpacing="0.08em">…</Text>
<PositionBadge letterSpacing="0.08em" />         // forwarded to <Text letterSpacing={…}> (LS-8624)

// ✅ Native-safe — numeric points (this is the codebase norm: <Text letterSpacing={1.4}>)
<Text letterSpacing={0.8}>…</Text>
```

**Prop form vs `style`-object form.** The confirmed vector (LS-8624) is a string on the Tamagui
**shorthand prop** (`letterSpacing={…}`). The `style`-object form
(`<Text style={{ letterSpacing: '0.1em' }}>`) was observed **not** to crash on the same screen —
`StatsGridHeaderCell` renders style-object `letterSpacing: '0.1em'` header cells first, yet the
crash stack pointed at the PositionBadge **prop** — i.e. Tamagui appears to normalize the
`style`-object path but forwards the shorthand prop more directly. **Do not rely on that
normalization:** use a **number** in both forms. A string in `style` at minimum drops the tracking
silently on native (or via `csp()`), and is a latent crash if Tamagui's handling changes.

The real amplifier is **shared passthrough components** that type the prop `number | string` and
forward it verbatim — `PositionBadge`, `StatusBadge`, `ToggleControls`. One caller passing a
`'0.08em'` string turns into a native crash. Tighten those prop types to `number`.

### Why it evades every safety net

- **Web renders it** — `apps/web` is fine, so design/QA on web never sees it.
- **Jest can't catch it** — the `shared-components` "mobile" jest project runs under
  `testEnvironment: jsdom` + `@testing-library/react` (**react-dom**), only faking
  `Platform.OS === 'ios'`. It accepts string CSS and never runs Yoga/native prop setters, so a
  full-page render spec **passes** while the real device crashes. (This is exactly why
  `PlayerStatsPage.render.spec.tsx` gave false assurance for LS-8440.)
- **Not JS-catchable** — a native-thread `ClassCastException` is not a JS exception; the
  `ScreenErrorBoundary` and Rollbar never see it. The app simply closes.

### Affected props

Any RN style prop typed numeric-only will `ClassCastException` on a string value. Confirmed /
high-risk on `Text`:

| Prop            | Native type | Safe value         | Web-only string that crashes native |
| --------------- | ----------- | ------------------ | ----------------------------------- |
| `letterSpacing` | `Double`    | `1`, `0.8`         | `'0.1em'`, `'0.5'`                  |
| `lineHeight`    | `Double`    | `20` (absolute px) | `'1.55'`, `'1'`, `'1.4em'`          |

> Note the asymmetry with the **web** pitfall: on web you must pass `lineHeight` as a _string_
> (`('1' as unknown as number)`) to avoid the `1px` bug. That string is **native-poison**. The
> correct cross-platform shape is to branch: `Platform.OS === 'web' ? ('1' as unknown as number) : 48`
> (see `StatsPageHeader.tsx`) — or route the whole style through `csp()`.

### The three correct patterns

1. **Numeric px (preferred).** Works on both platforms; Tamagui passes numbers through
   untouched. Convert `Nem` → `N * fontSize` px.

   ```tsx
   <Text style={{ letterSpacing: 1 }}>…</Text>
   ```

2. **`csp()` — the cross-platform style normalizer, as a safety net only**
   (`lib/shared-components/src/features/players/crossPlatformStyle.ts`). On web it is the
   identity; on native it **drops** values RN can't represent (em/ch/clamp lengths, `transform`
   strings, box-shorthands). `letterSpacing` is in its `LENGTH_KEYS`, so a `'0.1em'` string is
   dropped on native — no crash. **But drop ≠ align:** the tracking is _silently lost_ on native
   while web still shows it, so `csp()` trades a crash for a **fidelity gap**. Use it as a catch-all
   guard, not as the primary way to style a value that has a native equivalent.

   ```tsx
   <Text style={csp({ letterSpacing: '0.1em' })}>…</Text> // no crash; tracking lost on native ≠ web
   ```

3. **Explicit `Platform.OS` branch** when web genuinely needs the string form.
   ```tsx
   letterSpacing: Platform.OS === 'web' ? ('0.1em' as unknown as number) : 1;
   ```

### Alignment vs removal: `csp()` drops, it does not convert

`csp()`'s strategy is _removal_ — anything native can't parse is stripped. That prevents the crash
but means **native and web render differently** for every dropped value. Three tiers:

- **Convertible → align, don't drop.** `letterSpacing`/`lineHeight` em→px is exact
  (`value × fontSize`, e.g. `0.1em` at `fontSize 11` = `1.1`). Author it **numeric** so both
  platforms match — this is the fix, not `csp()`-drop. (Tracked in **LS-8630**.)
- **Web-only, no native equivalent → divergence is inherent.** `cursor`, `whiteSpace`,
  gradients, `backdropFilter` on old RN — dropping is the only option; the gap is acceptable.
- **Convertible but currently dropped → latent divergence.** `transform: 'translateY(-50%)'`
  could become RN's array form `[{ translateY: '-50%' }]`; `boxShadow`/`filter` are supported on
  RN 0.76+. `csp()` drops these today. Evolving `csp()` from _drop_ → _convert_ here would make it
  an alignment layer, not a removal one. (Tracked in **LS-8631**.)

Rule of thumb: if the value **has** a native equivalent, convert it (numeric/array) so the two
platforms agree; reserve `csp()`-drop for values that are genuinely web-only.

### Detection

```bash
# String letterSpacing / lineHeight in native-reachable code (crash risk):
rg "letterSpacing:\s*['\"\`]|letterSpacing=(\"|'|\{\s*['\"\`])" lib/shared-components/src apps/app/src
rg "lineHeight:\s*['\"\`]" lib/shared-components/src apps/app/src
```

Exclude `apps/web` (web-only, safe) and `docs/design` (synced design bundles, not shipped code).
A hit only crashes if the component **actually renders on native** — trace whether `apps/app`
imports it (directly or transitively). `PlayersScreen`, `elite-draft` marketing views, etc. may
be web-only.

### Prevention

Add an ESLint `no-restricted-syntax` rule scoped to `lib/shared-components/src` and `apps/app/src`
that flags a string literal assigned to `letterSpacing` / `lineHeight` in a JSX style object or
prop. String-unit typography belongs behind `csp()` or a `Platform.OS` branch, or should be a
number.

---

## Provenance

- **LS-8624** (Done) — the confirmed instance: `PlayerStatsDataGrid.tsx:1206` passed
  `letterSpacing="0.08em"` to the shared `PositionBadge`, which types the prop `number | string`
  and forwards it to a Tamagui `<Text letterSpacing={…}>`. Every stats-grid row that renders a
  position badge crashed on mount → "Players tab closes the app." Fixed by making the value
  numeric. The ticket also recommended tightening `PositionBadge.letterSpacing` to `number`.
- **LS-8568** introduced the regression: migrating the hand-rolled position pill to the shared
  `PositionBadge` preserved the site's existing `'0.08em'` string, reintroducing LS-8440's
  fixed value at a new call site.
- Confirmed error signature: `ClassCastException: java.lang.String cannot be cast to
java.lang.Double` at `ViewManagersPropertyCache$FloatPropSetter` on `RCTText.letterSpacing`.
- **Codebase norm:** `letterSpacing` props are numeric almost everywhere
  (`<Text letterSpacing={1.4}>`). The bug is a _lone string_ slipping into that numeric prop —
  which is why a `number`-only prop type + a lint guard closes the class.
