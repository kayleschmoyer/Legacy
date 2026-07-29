import type { CSSProperties } from 'react';
import { Platform } from '../../platform-components';

/**
 * Cross-platform inline-style normalizer for the web-first PlayerStatsPage
 * (LS-8440).
 *
 * `PlayerStatsPage` was authored web-first and passes web CSS as inline
 * `style` on Tamagui/React Native nodes: CSS box shorthands
 * (`padding: '32px 24px 0'`, `margin: '0 auto'`), the `background`/`border`
 * shorthands, `transform: 'translateY(-50%)'` **strings**, `em`/`ch`/`clamp()`
 * length units, and web-only keys (`whiteSpace`, `textOverflow`,
 * `fontVariantNumeric`). On web (react-native-web) these are valid CSS. On
 * native React Native's style resolver rejects them — a `transform` string
 * throws outright ("Transform … must be … an array"), crashing the Player
 * Statistics screen.
 *
 * {@link csp} returns the style **untouched on web** (so web behavior is
 * byte-for-byte unchanged) and, on native, returns an equivalent object using
 * only RN-valid keys/values.
 *
 * Its strategy is **align, not just remove** (LS-8631). Where a native
 * equivalent exists it **converts** so the two platforms render the same:
 * box shorthands expand to per-edge props; `background`/`border` map to their
 * RN equivalents; co-located `em` lengths resolve to px against a numeric
 * `fontSize` (`value × fontSize`); simple single-function `transform` strings
 * become RN's array form; and a simple `boxShadow` maps to RN 0.76+'s
 * validated array form. Only values with **no** native equivalent — inherited
 * `em` (no co-located `fontSize`), `rem`/`ch`/`vw`/`clamp()` lengths,
 * multi-function/ambiguous transforms, `cursor`/`whiteSpace`/gradients/
 * `filter` — are dropped, so the screen renders instead of crashing.
 */
export type LooseStyle = Record<string, unknown>;

// Web-only keys that have no React Native style equivalent. Dropped on native.
const DROP_ON_NATIVE = new Set<string>([
  'whiteSpace',
  'wordBreak',
  'textOverflow',
  'cursor',
  'outline',
  'outlineWidth',
  'outlineStyle',
  'outlineColor',
  'appearance',
  // `boxShadow` is NOT dropped: it converts to RN 0.76+'s array form below.
  'transition',
  'transitionProperty',
  'transitionDuration',
  // `filter`/`backdropFilter` stay dropped: RN's New-Arch `filter` support is
  // narrow and less battle-tested, converting adds native-crash surface for a
  // value not used by the current web-first surface, and the alignment win is
  // marginal. Convert here only if a concrete need appears (LS-8631).
  'filter',
  'backdropFilter',
  'gridTemplateColumns',
  'gridTemplateRows',
  'columnGap',
]);

// Keys whose values are lengths. On native a string value must resolve to a
// number or a percentage; unsupported units (em/ch/vw/clamp) are dropped.
const LENGTH_KEYS = new Set<string>([
  'width',
  'height',
  'minWidth',
  'maxWidth',
  'minHeight',
  'maxHeight',
  'top',
  'right',
  'bottom',
  'left',
  'gap',
  'rowGap',
  'borderRadius',
  'borderTopLeftRadius',
  'borderTopRightRadius',
  'borderBottomLeftRadius',
  'borderBottomRightRadius',
  'fontSize',
  'lineHeight',
  'letterSpacing',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'paddingHorizontal',
  'paddingVertical',
  'paddingStart',
  'paddingEnd',
  'marginTop',
  'marginRight',
  'marginBottom',
  'marginLeft',
  'marginHorizontal',
  'marginVertical',
  'marginStart',
  'marginEnd',
]);

const EDGES = ['Top', 'Right', 'Bottom', 'Left'] as const;

/**
 * Resolve a single CSS length token to an RN-acceptable value.
 * - `''` / unsupported unit (`ch`, `vw`, `rem`, `clamp()`, `calc()`) →
 *   `undefined` (drop it — RN cannot represent it)
 * - `'auto'` and percentage strings pass through (RN accepts both for box props)
 * - unitless numbers and `Npx` collapse to a number
 * - `Nem` resolves to `N × emBase` px when `emBase` is a number (a numeric
 *   `fontSize` co-located in the same style object; see {@link toNativeStyle}).
 *   Without a co-located base it stays `undefined` — an inherited `em` cannot be
 *   resolved safely, so we drop rather than guess (LS-8631). `rem` has no
 *   in-object base at all and is likewise dropped.
 */
export function resolveLength(
  token: string,
  emBase?: number,
): string | number | undefined {
  const t = token.trim();
  if (t === '' || t === 'auto') return t === 'auto' ? 'auto' : undefined;
  if (/^-?\d*\.?\d+%$/.test(t)) return t;
  const px = /^(-?\d*\.?\d+)px$/.exec(t);
  if (px) return Number(px[1]);
  const em = /^(-?\d*\.?\d+)em$/.exec(t);
  if (em)
    return typeof emBase === 'number' ? Number(em[1]) * emBase : undefined;
  if (/^-?\d*\.?\d+$/.test(t)) return Number(t);
  return undefined;
}

/**
 * Convert a simple single-function CSS `transform` string to RN's array form.
 * RN 0.76+ accepts percentage `translateX/Y`. Multi-function, multi-argument,
 * or unrepresentable transforms return `undefined` (dropped) so we never hand
 * RN a value it would reject — a `transform` string throws on native.
 */
export function parseTransform(value: string): LooseStyle[] | undefined {
  const m = /^\s*([a-zA-Z]+)\(([^()]*)\)\s*$/.exec(value);
  if (!m) return undefined; // multi-function or malformed → drop
  const fn = m[1];
  const arg = m[2].trim();
  if (arg === '' || arg.includes(',')) return undefined; // multi-arg → drop
  switch (fn) {
    case 'translateX':
    case 'translateY': {
      if (/^-?\d*\.?\d+%$/.test(arg)) return [{ [fn]: arg }]; // RN 0.76+ %
      const px = /^(-?\d*\.?\d+)px$/.exec(arg);
      if (px) return [{ [fn]: Number(px[1]) }];
      if (/^-?\d*\.?\d+$/.test(arg)) return [{ [fn]: Number(arg) }];
      return undefined;
    }
    case 'scale':
    case 'scaleX':
    case 'scaleY':
      if (/^-?\d*\.?\d+$/.test(arg)) return [{ [fn]: Number(arg) }];
      return undefined;
    case 'rotate':
      // RN rotate takes an angle string ('45deg' / '0.5rad').
      if (/^-?\d*\.?\d+(deg|rad)$/.test(arg)) return [{ [fn]: arg }];
      return undefined;
    default:
      return undefined;
  }
}

/**
 * Convert a **simple** CSS `boxShadow` (single, non-`inset`, px/unitless
 * offsets and blur/spread, optional trailing color) to RN 0.76+'s validated
 * `BoxShadowValue` array form. Multiple shadows, `inset`, color-first syntax,
 * or non-px length units return `undefined` (dropped) — the array form is
 * RN-validated so we only emit shapes we can build exactly.
 */
export function parseBoxShadow(value: unknown): LooseStyle[] | undefined {
  if (typeof value !== 'string') return undefined;
  const v = value.trim();
  if (v === '' || v === 'none' || /\binset\b/i.test(v)) return undefined;

  // Split off a single trailing color token (rgba()/hsl()/hex/named). The
  // `(?:^|\s)` boundary stops the bare-word alternative from matching a length
  // unit like the `px` in `4px`; a color's internal commas (e.g.
  // `rgba(0,0,0,.3)`) stay inside its parens, so a comma left in the length
  // part means multiple shadows → drop.
  let color: string | undefined;
  let lengths = v;
  const cm =
    /(?:^|\s)(rgba?\([^)]*\)|hsla?\([^)]*\)|#[0-9a-fA-F]{3,8}|[a-zA-Z]+)$/.exec(
      v,
    );
  if (cm) {
    color = cm[1];
    lengths = v.slice(0, cm.index).trim();
  }
  if (lengths.includes(',')) return undefined; // multiple shadows → drop

  const tokens = lengths.split(/\s+/).filter(Boolean);
  if (tokens.length < 2 || tokens.length > 4) return undefined;
  const nums = tokens.map((tok) => {
    const px = /^(-?\d*\.?\d+)px$/.exec(tok);
    if (px) return Number(px[1]);
    if (/^-?\d*\.?\d+$/.test(tok)) return Number(tok);
    return Number.NaN; // em/%/color-first/etc → drop
  });
  if (nums.some(Number.isNaN)) return undefined;

  const [offsetX, offsetY, blurRadius, spreadDistance] = nums;
  const shadow: LooseStyle = { offsetX, offsetY };
  if (blurRadius !== undefined) shadow.blurRadius = blurRadius;
  if (spreadDistance !== undefined) shadow.spreadDistance = spreadDistance;
  if (color !== undefined) shadow.color = color;
  return [shadow];
}

// Expand a CSS box shorthand string ('32px 24px 0') into per-edge RN props,
// following the CSS 1–4 value order [Top, Right, Bottom, Left].
function expandBoxShorthand(
  prop: 'padding' | 'margin',
  value: string,
  emBase?: number,
): LooseStyle {
  const tokens = value.trim().split(/\s+/);
  const [t, r = t, b = t, l = r] = tokens;
  const bySide: Record<(typeof EDGES)[number], string> = {
    Top: t,
    Right: r,
    Bottom: b,
    Left: l,
  };
  const out: LooseStyle = {};
  for (const edge of EDGES) {
    const resolved = resolveLength(bySide[edge] ?? '', emBase);
    if (resolved !== undefined) out[`${prop}${edge}`] = resolved;
  }
  return out;
}

// Map the CSS `border` shorthand ('1px solid rgba(…)' or 0) to RN props.
function expandBorderShorthand(value: unknown): LooseStyle {
  if (value === 0 || value === '0') return { borderWidth: 0 };
  if (typeof value !== 'string') return {};
  const m = /^\s*(-?\d*\.?\d+)px\s+(solid|dashed|dotted)\s+(.+?)\s*$/.exec(
    value,
  );
  if (!m) return {};
  return {
    borderWidth: Number(m[1]),
    borderStyle: m[2],
    borderColor: m[3],
  };
}

// Map the CSS `background` shorthand to `backgroundColor`. Gradients/images
// (web-only) are dropped.
function expandBackgroundShorthand(value: unknown): LooseStyle {
  if (typeof value === 'string' && /(gradient|url\()/i.test(value)) return {};
  return { backgroundColor: value };
}

/**
 * Convert a web-first style object into one that only uses React Native-valid
 * keys and values. Exported for unit testing; production code should call
 * {@link csp}, which is a no-op on web.
 */
export function toNativeStyle(style: LooseStyle): LooseStyle {
  const out: LooseStyle = {};

  // `em` lengths resolve against a co-located numeric `fontSize` (LS-8631).
  // Only a fontSize that itself resolves to a number is a valid base — an
  // inherited/`em` fontSize leaves emBase undefined, so co-located `em`
  // lengths drop rather than resolve against a wrong base.
  const rawFontSize = style.fontSize;
  const resolvedFontSize =
    typeof rawFontSize === 'number'
      ? rawFontSize
      : typeof rawFontSize === 'string'
        ? resolveLength(rawFontSize)
        : undefined;
  const emBase =
    typeof resolvedFontSize === 'number' ? resolvedFontSize : undefined;

  for (const [key, value] of Object.entries(style)) {
    if (value === undefined || value === null) continue;
    if (key.startsWith('--')) continue; // CSS custom property (e.g. `--pct`)
    if (DROP_ON_NATIVE.has(key)) continue;

    switch (key) {
      case 'padding':
      case 'margin':
        if (typeof value === 'string') {
          Object.assign(out, expandBoxShorthand(key, value, emBase));
        } else {
          out[key] = value;
        }
        break;
      case 'background':
        Object.assign(out, expandBackgroundShorthand(value));
        break;
      case 'border':
        Object.assign(out, expandBorderShorthand(value));
        break;
      case 'display':
        // RN supports only 'flex' | 'none'; anything else (grid, block) is web-only.
        if (value === 'flex' || value === 'none') out[key] = value;
        break;
      case 'transform':
        // RN requires the array form ([{ translateY: -4 }]); a CSS string
        // throws. Pass an existing array through; convert a simple
        // single-function string; drop anything ambiguous (LS-8631).
        if (Array.isArray(value)) {
          out[key] = value;
        } else if (typeof value === 'string') {
          const rn = parseTransform(value);
          if (rn !== undefined) out[key] = rn;
        }
        break;
      case 'boxShadow': {
        // RN 0.76+ supports boxShadow; convert a simple shadow to the
        // validated array form, drop anything lossy/ambiguous (LS-8631).
        const rn = parseBoxShadow(value);
        if (rn !== undefined) out[key] = rn;
        break;
      }
      case 'fontVariantNumeric':
        // RN spells this `fontVariant` and takes an array of feature strings.
        if (typeof value === 'string') out.fontVariant = value.split(/\s+/);
        break;
      default:
        if (LENGTH_KEYS.has(key) && typeof value === 'string') {
          const resolved = resolveLength(value, emBase);
          if (resolved !== undefined) out[key] = resolved;
        } else {
          out[key] = value;
        }
    }
  }
  return out;
}

/**
 * Cross-platform `style` wrapper. Identity on web (web rendering is unchanged);
 * on native returns an RN-safe equivalent so PlayerStatsPage renders instead of
 * crashing (LS-8440).
 */
export function csp<const T extends CSSProperties>(style: T): T {
  // A `const` type parameter preserves the call site's literal types (e.g.
  // `flexDirection: 'column'` and `maxHeight: '60%'` stay literals, not widened
  // to `string`) so the returned style stays assignable to both Tamagui's loose
  // style prop and React Native's strict ViewStyle/TextStyle. The CSSProperties
  // constraint accepts the web-first shorthands this component uses.
  if (Platform.OS === 'web') return style;
  return toNativeStyle(style as unknown as LooseStyle) as unknown as T;
}
