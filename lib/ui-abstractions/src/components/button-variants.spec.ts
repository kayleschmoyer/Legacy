import { type ButtonVariant, VARIANT_STYLES } from './button-variants';

describe('Button VARIANT_STYLES (LS-2786)', () => {
  const variants: ButtonVariant[] = [
    'primary',
    'secondary',
    'outline',
    'ghost',
    'link',
  ];

  it('defines a style for every variant', () => {
    for (const v of variants) {
      expect(VARIANT_STYLES[v]).toBeDefined();
    }
  });

  it('does not map every variant to outlined (regression)', () => {
    const tamaguiVariants = variants.map(
      (v) => VARIANT_STYLES[v].tamaguiVariant,
    );
    const uniques = new Set(tamaguiVariants);
    expect(uniques.size).toBeGreaterThan(1);
  });

  it('renders primary as a filled button (non-transparent background)', () => {
    expect(VARIANT_STYLES.primary.backgroundColor).not.toBe('transparent');
    expect(VARIANT_STYLES.primary.borderWidth).toBeGreaterThanOrEqual(0);
  });

  it('renders ghost and link with no border and transparent background', () => {
    for (const v of ['ghost', 'link'] as const) {
      expect(VARIANT_STYLES[v].backgroundColor).toBe('transparent');
      expect(VARIANT_STYLES[v].borderWidth).toBe(0);
    }
  });

  it('renders outline with a visible border', () => {
    expect(VARIANT_STYLES.outline.borderWidth).toBeGreaterThan(0);
    expect(VARIANT_STYLES.outline.borderColor).not.toBe('transparent');
  });

  it('underlines link text only', () => {
    expect(VARIANT_STYLES.link.textDecorationLine).toBe('underline');
    expect(VARIANT_STYLES.primary.textDecorationLine).toBeUndefined();
  });

  it('produces visibly different styles for primary vs ghost', () => {
    const p = VARIANT_STYLES.primary;
    const g = VARIANT_STYLES.ghost;
    expect(p.backgroundColor).not.toBe(g.backgroundColor);
  });
});
