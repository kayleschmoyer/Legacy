import {
  markdownTable,
  minifiedJson,
  pick,
  pickFields,
  truncate,
} from './index';

describe('minifiedJson', () => {
  it('serializes without indentation or newlines', () => {
    const out = minifiedJson({ a: 1, b: [2, 3], c: { d: 'e' } });
    expect(out).toBe('{"a":1,"b":[2,3],"c":{"d":"e"}}');
    expect(out).not.toContain('\n');
    expect(out).not.toContain('  ');
  });

  it('is smaller than pretty-printed JSON for the same value', () => {
    const value = { items: [{ id: 1 }, { id: 2 }], ok: true };
    expect(minifiedJson(value).length).toBeLessThan(
      JSON.stringify(value, null, 2).length,
    );
  });

  it('drops undefined like JSON.stringify and never returns undefined', () => {
    expect(minifiedJson({ a: undefined, b: 1 })).toBe('{"b":1}');
    expect(minifiedJson(undefined)).toBe('null');
  });
});

describe('pick / pickFields', () => {
  it('keeps only the requested keys in the given order', () => {
    const row = { id: 1, title: 'x', body: 'long', author: 'me' };
    expect(pick(row, ['title', 'id'])).toEqual({ title: 'x', id: 1 });
    expect(Object.keys(pick(row, ['title', 'id']))).toEqual(['title', 'id']);
  });

  it('skips absent keys rather than emitting undefined', () => {
    const obj: { id: number; missing?: string } = { id: 1 };
    const result = pick(obj, ['id', 'missing']);
    expect(result).toEqual({ id: 1 });
    expect('missing' in result).toBe(false);
  });

  it('applies across an array of records', () => {
    const rows = [
      { id: 1, n: 'a', extra: true },
      { id: 2, n: 'b', extra: false },
    ];
    expect(pickFields(rows, ['id', 'n'])).toEqual([
      { id: 1, n: 'a' },
      { id: 2, n: 'b' },
    ]);
  });
});

describe('truncate', () => {
  it('returns short strings unchanged with no ellipsis', () => {
    expect(truncate('hello', 10)).toBe('hello');
    expect(truncate('hello', 5)).toBe('hello');
  });

  it('truncates to the budget including the ellipsis', () => {
    const out = truncate('abcdefghij', 5);
    expect(out).toBe('abcd…');
    expect(out.length).toBe(5);
  });

  it('honors a custom ellipsis', () => {
    expect(truncate('abcdefghij', 6, { ellipsis: '...' })).toBe('abc...');
  });

  it('shows omitted count and still respects the budget', () => {
    const value = 'x'.repeat(100);
    const out = truncate(value, 10, { showOmitted: true });
    expect(out.length).toBeLessThanOrEqual(10);
    expect(out).toMatch(/…\+\d+$/);
    // kept chars + omitted count must reconstruct the original length.
    const omittedMatch = out.match(/\+(\d+)$/);
    expect(omittedMatch).not.toBeNull();
    const omitted = Number(omittedMatch?.[1]);
    const kept = out.replace(/…\+\d+$/, '').length;
    expect(kept + omitted).toBe(100);
  });

  it('hard-cuts when the budget cannot fit the ellipsis', () => {
    expect(truncate('abcdef', 1)).toBe('a');
    expect(truncate('abcdef', 0)).toBe('');
  });

  it('returns non-strings untouched', () => {
    expect(truncate(42 as unknown as string, 1)).toBe(42);
  });
});

describe('markdownTable', () => {
  it('writes headers once and one compact line per row', () => {
    const out = markdownTable([
      { id: 1, state: 'open' },
      { id: 2, state: 'merged' },
    ]);
    expect(out).toBe('id|state\n---|---\n1|open\n2|merged');
  });

  it('is smaller than pretty JSON for a flat uniform list', () => {
    const rows = Array.from({ length: 8 }, (_, i) => ({
      number: i,
      title: `pr ${i}`,
      state: 'open',
    }));
    expect(markdownTable(rows).length).toBeLessThan(
      JSON.stringify(rows, null, 2).length,
    );
  });

  it('respects an explicit column order and prunes to it', () => {
    const out = markdownTable([{ id: 1, title: 't', secret: 'hide' }], {
      columns: ['title', 'id'],
    });
    expect(out).toBe('title|id\n---|---\nt|1');
    expect(out).not.toContain('secret');
  });

  it('renames headers without renaming the data keys', () => {
    const out = markdownTable([{ n: 1 }], { headers: { n: 'Number' } });
    expect(out).toBe('Number\n---\n1');
  });

  it('derives the union of keys across heterogeneous rows', () => {
    const out = markdownTable([{ a: 1 }, { b: 2 }]);
    expect(out).toBe('a|b\n---|---\n1|\n|2');
  });

  it('renders nullish as empty and objects as minified JSON', () => {
    const out = markdownTable([{ a: null, b: { x: 1 }, c: undefined }]);
    expect(out).toBe('a|b|c\n---|---|---\n|{"x":1}|');
  });

  it('escapes pipes and newlines so the table stays parseable', () => {
    const out = markdownTable([{ v: 'a|b\nc' }]);
    expect(out).toBe('v\n---\na\\|b c');
  });

  it('returns an empty string for no rows', () => {
    expect(markdownTable([])).toBe('');
  });

  it('pads columns when asked, with outer pipes', () => {
    const out = markdownTable(
      [
        { id: 1, state: 'open' },
        { id: 200, state: 'x' },
      ],
      { pad: true },
    );
    expect(out).toBe(
      [
        '| id  | state |',
        '| --- | ----- |',
        '| 1   | open  |',
        '| 200 | x     |',
      ].join('\n'),
    );
  });
});
