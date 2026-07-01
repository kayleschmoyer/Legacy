// Allow-list for commissioner-supplied CSS color values to block stored CSS injection.
// Accepts hex (#rgb, #rrggbb, #rrggbbaa), rgb/rgba, hsl/hsla, and named color keywords.
const SAFE_CSS_COLOR_RE =
  /^(#[0-9a-fA-F]{3,8}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(\s*,\s*[\d.]+)?\s*\)|hsla?\(\s*\d+\s*,\s*[\d.]+%\s*,\s*[\d.]+%(\s*,\s*[\d.]+)?\s*\)|[a-zA-Z]+)$/;

export function safeCssColor(
  color: string | null | undefined,
): string | undefined {
  if (!color) return undefined;
  const trimmed = color.trim();
  return SAFE_CSS_COLOR_RE.test(trimmed) ? trimmed : undefined;
}
