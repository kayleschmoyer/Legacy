import { CSSProperties } from 'react';

/**
 * Utility to safely combine style arrays for cross-platform compatibility.
 * Filters out falsy values and flattens nested arrays.
 */
export function combineStyles(
  ...styles: (CSSProperties | CSSProperties[] | false | undefined | null)[]
): CSSProperties {
  const flatStyles = styles.flat(Infinity).filter(Boolean) as CSSProperties[];
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return Object.assign({}, ...flatStyles);
}

/**
 * Type guard to safely handle style arrays that may contain false values
 */
export function filterStyles<T>(styles: (T | false | undefined | null)[]): T[] {
  return styles.filter(Boolean) as T[];
}

/**
 * Helper to create style arrays that work with both React Native and web
 * This function ensures TypeScript doesn't complain about filter methods on style arrays
 */
export function createStyleArray(
  ...styles: (CSSProperties | false | undefined | null)[]
): CSSProperties {
  return combineStyles(...styles);
}

/**
 * Creates a safe style prop that TypeScript will accept as CSSProperties
 * Use this when you have conditional styles that may include false values
 */
export function safeStyle(
  styles:
    | (CSSProperties | false | undefined | null)[]
    | CSSProperties[]
    | CSSProperties
    | false
    | undefined
    | null,
): CSSProperties {
  if (!styles) return {};
  if (Array.isArray(styles)) {
    const filtered = styles.filter(
      (style): style is CSSProperties =>
        style !== false && style !== null && style !== undefined,
    );
    if (filtered.length === 0) return {};
    if (filtered.length === 1) {
      const firstStyle = filtered[0];
      return firstStyle || {};
    }
    return Object.assign({}, ...filtered) as CSSProperties;
  }
  // At this point, styles must be CSSProperties since we've ruled out array, false, null, undefined
  if (!styles) return {};
  return styles;
}

/**
 * Safely handles single conditional styles that might be false
 */
export function safeConditionalStyle(
  style: false | CSSProperties | null | undefined,
): CSSProperties {
  return style || {};
}
