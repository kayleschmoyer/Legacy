import {
  containsHtmlLikeMarkup,
  sanitizeDisplayName,
  stripInvisibleAndControlChars,
} from './sanitize-name';

describe('stripInvisibleAndControlChars', () => {
  it('removes C0 control characters', () => {
    expect(stripInvisibleAndControlChars('admin\u0007League')).toBe(
      'adminLeague',
    );
  });

  it('removes C1 control characters', () => {
    expect(stripInvisibleAndControlChars('admin\u0085League')).toBe(
      'adminLeague',
    );
  });

  it('removes zero-width characters (ZWSP/ZWNJ/ZWJ)', () => {
    expect(stripInvisibleAndControlChars('admin\u200B\u200C\u200DLeague')).toBe(
      'adminLeague',
    );
  });

  it('removes bidi directional-override characters (RTL override, U+202E)', () => {
    expect(stripInvisibleAndControlChars('\u202EadminLeague')).toBe(
      'adminLeague',
    );
  });

  it('removes a BOM / zero-width no-break space', () => {
    expect(stripInvisibleAndControlChars('\uFEFFadminLeague')).toBe(
      'adminLeague',
    );
  });

  it('leaves printable Unicode (accents, emoji, non-Latin scripts) untouched', () => {
    expect(stripInvisibleAndControlChars('José \u{1F3C6} Ramírez')).toBe(
      'José \u{1F3C6} Ramírez',
    );
  });

  it('is a no-op on a plain ASCII string', () => {
    expect(stripInvisibleAndControlChars("Bobby's Dynasty League")).toBe(
      "Bobby's Dynasty League",
    );
  });
});

describe('containsHtmlLikeMarkup', () => {
  it('detects a script tag', () => {
    expect(containsHtmlLikeMarkup('<script>alert(1)</script>')).toBe(true);
  });

  it('detects an img tag with an event handler', () => {
    expect(containsHtmlLikeMarkup('<img src=x onerror=alert(1)>')).toBe(true);
  });

  it('detects a lone angle bracket', () => {
    expect(containsHtmlLikeMarkup('5 < 10 fans')).toBe(true);
  });

  it('returns false for text with no angle brackets', () => {
    expect(containsHtmlLikeMarkup("Bobby's Dynasty League")).toBe(false);
  });
});

describe('sanitizeDisplayName', () => {
  it('strips invisible/control chars and trims surrounding whitespace', () => {
    expect(sanitizeDisplayName('  \u202Eadmin\u200BLeague  ')).toBe(
      'adminLeague',
    );
  });

  it('reduces a string of only invisible characters to empty', () => {
    expect(sanitizeDisplayName('\u200B\u200B\u200B')).toBe('');
  });

  it('leaves a normal name unchanged aside from trimming', () => {
    expect(sanitizeDisplayName("  Bobby's Dynasty League  ")).toBe(
      "Bobby's Dynasty League",
    );
  });
});
