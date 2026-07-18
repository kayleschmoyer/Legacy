import { csp, resolveLength, toNativeStyle } from './crossPlatformStyle';
import { Platform } from '../../platform-components';

// LS-8440: PlayerStatsPage was authored web-first and passed web CSS as inline
// `style` on Tamagui/RN nodes. On native RN's resolver rejects those values —
// a `transform` string throws and crashes the Player Statistics screen. These
// tests lock the normalization: every web-only idiom actually present in the
// component becomes an RN-safe value (or is dropped), and web output is
// untouched.

describe('resolveLength', () => {
  it('collapses px and unitless numbers to a number', () => {
    expect(resolveLength('8px')).toBe(8);
    expect(resolveLength('0')).toBe(0);
    expect(resolveLength('-1px')).toBe(-1);
    expect(resolveLength('1.5')).toBe(1.5);
  });

  it('passes through percentages and auto', () => {
    expect(resolveLength('100%')).toBe('100%');
    expect(resolveLength('auto')).toBe('auto');
  });

  it('drops units RN cannot represent', () => {
    expect(resolveLength('64ch')).toBeUndefined();
    expect(resolveLength('0.08em')).toBeUndefined();
    expect(resolveLength('4.4vw')).toBeUndefined();
    expect(resolveLength('clamp(40px, 4.4vw, 60px)')).toBeUndefined();
    expect(resolveLength('')).toBeUndefined();
  });
});

describe('toNativeStyle — box shorthands', () => {
  it('expands a 3-value padding string into per-edge props (CSS T/R/B/L order)', () => {
    expect(toNativeStyle({ padding: '32px 24px 0' })).toEqual({
      paddingTop: 32,
      paddingRight: 24,
      paddingBottom: 0,
      paddingLeft: 24,
    });
  });

  it('expands a 2-value padding string', () => {
    expect(toNativeStyle({ padding: '8px 14px' })).toEqual({
      paddingTop: 8,
      paddingRight: 14,
      paddingBottom: 8,
      paddingLeft: 14,
    });
  });

  it('expands a 4-value padding string', () => {
    expect(toNativeStyle({ padding: '0 12px 0 38px' })).toEqual({
      paddingTop: 0,
      paddingRight: 12,
      paddingBottom: 0,
      paddingLeft: 38,
    });
  });

  it('keeps `auto` margins so `margin: "0 auto"` still centers', () => {
    expect(toNativeStyle({ margin: '0 auto' })).toEqual({
      marginTop: 0,
      marginRight: 'auto',
      marginBottom: 0,
      marginLeft: 'auto',
    });
  });

  it('leaves numeric box values untouched', () => {
    expect(toNativeStyle({ margin: 0, padding: 12 })).toEqual({
      margin: 0,
      padding: 12,
    });
  });
});

describe('toNativeStyle — background / border shorthands', () => {
  it('maps `background` color to `backgroundColor`', () => {
    expect(toNativeStyle({ background: 'rgba(13,21,38,0.6)' })).toEqual({
      backgroundColor: 'rgba(13,21,38,0.6)',
    });
  });

  it('drops web-only gradient backgrounds', () => {
    expect(
      toNativeStyle({ background: 'linear-gradient(90deg, #000, #fff)' }),
    ).toEqual({});
  });

  it('expands the `border` shorthand into RN border props', () => {
    expect(toNativeStyle({ border: '1px solid #1C2740' })).toEqual({
      borderWidth: 1,
      borderStyle: 'solid',
      borderColor: '#1C2740',
    });
  });

  it('maps `border: 0` to `borderWidth: 0`', () => {
    expect(toNativeStyle({ border: 0 })).toEqual({ borderWidth: 0 });
  });
});

describe('toNativeStyle — drops values RN would reject or ignore', () => {
  it('drops a `transform` string (RN requires the array form and throws on a string)', () => {
    expect(toNativeStyle({ transform: 'translateY(-50%)' })).toEqual({});
  });

  it('keeps an already-RN transform array', () => {
    const t = [{ translateY: -4 }];
    expect(toNativeStyle({ transform: t })).toEqual({ transform: t });
  });

  it('drops `em` letterSpacing but keeps numeric letterSpacing', () => {
    expect(toNativeStyle({ letterSpacing: '0.08em' })).toEqual({});
    expect(toNativeStyle({ letterSpacing: '-0.02em' })).toEqual({});
    expect(toNativeStyle({ letterSpacing: 1 })).toEqual({ letterSpacing: 1 });
  });

  it('drops web-only text keys', () => {
    expect(
      toNativeStyle({
        whiteSpace: 'nowrap',
        textOverflow: 'ellipsis',
        cursor: 'pointer',
        outlineWidth: 0,
      }),
    ).toEqual({});
  });

  it('maps `fontVariantNumeric` to the RN `fontVariant` array', () => {
    expect(toNativeStyle({ fontVariantNumeric: 'tabular-nums' })).toEqual({
      fontVariant: ['tabular-nums'],
    });
  });

  it('drops the `--pct` CSS custom property', () => {
    expect(toNativeStyle({ '--pct': '50%', width: 10 })).toEqual({ width: 10 });
  });

  it('drops unsupported length units on dimension props', () => {
    expect(toNativeStyle({ maxWidth: '64ch' })).toEqual({});
    expect(toNativeStyle({ maxWidth: '100%', width: '100%' })).toEqual({
      maxWidth: '100%',
      width: '100%',
    });
  });

  it('keeps `display: flex|none`, drops other display values', () => {
    expect(toNativeStyle({ display: 'flex' })).toEqual({ display: 'flex' });
    expect(toNativeStyle({ display: 'grid' })).toEqual({});
  });
});

describe('toNativeStyle — the never-crash invariant', () => {
  // The exact web-only style object from the header pill (PlayerStatsPage.tsx).
  const headerPill = {
    marginTop: 14,
    padding: '8px 14px',
    background: 'rgba(13,21,38,0.6)',
    border: '1px solid #1C2740',
    borderRadius: 8,
    maxWidth: '100%',
    overflow: 'hidden',
  };

  it('emits only RN-safe values (no multi-token strings, em, or transform strings)', () => {
    const native = toNativeStyle(headerPill);
    for (const value of Object.values(native)) {
      if (typeof value === 'string') {
        // Percentages and single color/keyword tokens are fine; a space-joined
        // CSS shorthand or an em/ch unit is what crashes RN.
        expect(value).not.toMatch(/\d(px|em|ch|vw|vh|rem)\b/);
        expect(value.trim()).not.toMatch(/\s/);
      }
    }
    // Sanity: the good numeric props survived.
    expect(native).toMatchObject({ marginTop: 14, borderRadius: 8 });
  });
});

describe('csp', () => {
  it('is an identity on web and an RN-safe transform on native', () => {
    const style = { padding: '8px 14px', letterSpacing: '0.08em' };
    if (Platform.OS === 'web') {
      // Web behavior must be byte-for-byte unchanged (same reference).
      expect(csp(style)).toBe(style);
    } else {
      expect(csp(style)).toEqual(toNativeStyle(style));
      expect(csp(style)).not.toHaveProperty('letterSpacing');
    }
  });
});
