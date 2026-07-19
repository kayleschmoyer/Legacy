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
 * only RN-valid keys/values: box shorthands are expanded to per-edge props,
 * `background`/`border` are mapped to their RN equivalents, and values RN
 * cannot represent (relative units, `transform` strings) are dropped so the
 * screen renders instead of crashing.
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
  'boxShadow',
  'transition',
  'transitionProperty',
  'transitionDuration',
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
 * - `''` / unsupported unit (em, ch, vw, rem, clamp(), calc()) → `undefined`
 *   (drop it — RN cannot represent it)
 * - `'auto'` and percentage strings pass through (RN accepts both for box props)
 * - unitless numbers and `Npx` collapse to a number
 */
export function resolveLength(token: string): string | number | undefined {
  const t = token.trim();
  if (t === '' || t === 'auto') return t === 'auto' ? 'auto' : undefined;
  if (/^-?\d*\.?\d+%$/.test(t)) return t;
  const px = /^(-?\d*\.?\d+)px$/.exec(t);
  if (px) return Number(px[1]);
  if (/^-?\d*\.?\d+$/.test(t)) return Number(t);
  return undefined;
}

// Expand a CSS box shorthand string ('32px 24px 0') into per-edge RN props,
// following the CSS 1–4 value order [Top, Right, Bottom, Left].
function expandBoxShorthand(
  prop: 'padding' | 'margin',
  value: string,
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
    const resolved = resolveLength(bySide[edge] ?? '');
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
  for (const [key, value] of Object.entries(style)) {
    if (value === undefined || value === null) continue;
    if (key.startsWith('--')) continue; // CSS custom property (e.g. `--pct`)
    if (DROP_ON_NATIVE.has(key)) continue;

    switch (key) {
      case 'padding':
      case 'margin':
        if (typeof value === 'string') {
          Object.assign(out, expandBoxShorthand(key, value));
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
        // RN requires the array form ([{ translateY: -4 }]); a CSS string throws.
        if (Array.isArray(value)) out[key] = value;
        break;
      case 'fontVariantNumeric':
        // RN spells this `fontVariant` and takes an array of feature strings.
        if (typeof value === 'string') out.fontVariant = value.split(/\s+/);
        break;
      default:
        if (LENGTH_KEYS.has(key) && typeof value === 'string') {
          const resolved = resolveLength(value);
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
