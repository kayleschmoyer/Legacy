import { extractFailures, MAX_EXTRACTED_FAILURES } from './extract-failures.js';

describe('extractFailures', () => {
  it('extracts TAP not-ok lines with error context from a long log', () => {
    const filler = Array.from({ length: 500 }, (_, i) => `ok ${i} - fine`);
    const log = [
      ...filler,
      'not ok 501 - broken thing',
      '  ---',
      '  error: boom',
      '  ...',
      'ok 502 - after',
      '# fail 1',
    ].join('\n');
    expect(extractFailures(log).failures).toEqual([
      'not ok 501 - broken thing | --- | error: boom | ...',
    ]);
  });

  it('extracts jest FAIL/● headers but not Console blocks', () => {
    const log = [
      'FAIL apps/web/Foo.spec.tsx',
      '  ● Console',
      '  ● Foo › renders',
      '  ● Test suite failed to run',
    ].join('\n');
    expect(extractFailures(log).failures).toEqual([
      'FAIL apps/web/Foo.spec.tsx',
      '● Foo › renders',
      '● Test suite failed to run',
    ]);
  });

  it('extracts TS errors, eslint errors, prettier warns and nx failed tasks', () => {
    const log = [
      "src/index.ts(12,3): error TS2322: Type 'a' is not assignable to type 'b'.",
      '/repo/src/foo.ts',
      '  3:1  error  Unexpected any  @typescript-eslint/no-explicit-any',
      '[warn] lib/bar.ts',
      '[warn] Code style issues found in 1 file.',
      ' NX   Running target test failed',
      'Failed tasks:',
      '- db:test',
      '- stats-lambda:test',
      '',
    ].join('\n');
    expect(extractFailures(log).failures).toEqual([
      "src/index.ts(12,3): error TS2322: Type 'a' is not assignable to type 'b'.",
      '/repo/src/foo.ts 3:1  error  Unexpected any  @typescript-eslint/no-explicit-any',
      '[warn] lib/bar.ts',
      '- db:test',
      '- stats-lambda:test',
    ]);
  });

  it('caps the list and reports the omitted count', () => {
    const log = Array.from(
      { length: MAX_EXTRACTED_FAILURES + 5 },
      (_, i) => `not ok ${i + 1} - t${i}`,
    ).join('\n');
    const r = extractFailures(log);
    expect(r.failures).toHaveLength(MAX_EXTRACTED_FAILURES);
    expect(r.omittedFailures).toBe(5);
  });

  it('returns nothing for clean output', () => {
    expect(extractFailures('ok 1 - a\n# pass 1')).toEqual({ failures: [] });
  });
});
