import { describe, expect, it } from '@jest/globals';

import {
  buildCompactOutput,
  compressFormatterOutput,
  truncateOutput,
  truncateStepErrors,
} from './truncate-output.js';

describe('truncateOutput', () => {
  it('returns input unchanged when under the limit', () => {
    expect(truncateOutput('short', 100)).toBe('short');
  });

  it('keeps head and tail and marks the omitted middle', () => {
    const input = 'A'.repeat(500) + 'B'.repeat(500);
    const result = truncateOutput(input, 100);
    expect(result).toContain('characters omitted');
    expect(result.startsWith('A')).toBe(true);
    expect(result.endsWith('B')).toBe(true);
    expect(result.length).toBeLessThan(input.length);
  });
});

describe('compressFormatterOutput', () => {
  it('collapses unchanged prettier file lines to a count summary', () => {
    const output = [
      '5/9 Formatting...',
      'apps/web/src/Foo.tsx 10ms (unchanged)',
      'apps/web/src/Bar.tsx 15ms (unchanged)',
      'lib/shared/Button.tsx 8ms (unchanged)',
      'NX  Successfully ran target format',
    ].join('\n');

    const result = compressFormatterOutput(output);
    expect(result).toContain('[Formatting: 3 files checked, 0 changed]');
    expect(result).not.toContain('(unchanged)');
    expect(result).toContain('NX  Successfully ran target format');
  });

  it('surfaces files that were actually reformatted', () => {
    const output = [
      'apps/web/src/Foo.tsx 10ms (unchanged)',
      'lib/changed.ts 45ms',
      'apps/web/src/Bar.tsx 12ms (unchanged)',
    ].join('\n');

    const result = compressFormatterOutput(output);
    expect(result).toContain('1 changed');
    expect(result).toContain('lib/changed.ts');
    expect(result).not.toContain('(unchanged)');
  });

  it('does not match plain single-word lines without a path separator', () => {
    const output = 'done\nok\nNX success';
    expect(compressFormatterOutput(output)).toBe(output);
  });

  it('leaves eslint output unchanged (no prettier-shaped lines)', () => {
    const output = [
      '6/9 Linting...',
      '/repo/apps/web/src/foo.ts',
      "  12:5  error  'x' is assigned a value but never used  @typescript-eslint/no-unused-vars",
      '✖ 1 problem (1 error, 0 warnings)',
    ].join('\n');
    expect(compressFormatterOutput(output)).toBe(output);
  });
});

describe('truncateStepErrors', () => {
  it('truncates step bodies longer than 20 lines', () => {
    const body = Array.from({ length: 30 }, (_, i) => `line ${i}`).join('\n');
    const output = `6/9 Linting...\n${body}`;
    const result = truncateStepErrors(output);
    expect(result).toContain('more lines — run step directly for full output');
    expect(result).not.toContain('line 25');
  });

  it('caps a large eslint per-file dump under a pc-lint step header', () => {
    const files = Array.from(
      { length: 400 },
      (_, i) => `lib/project${i}/src/index.ts 3ms (unchanged)`,
    );
    const output = `6/9 Linting...\n${files.join('\n')}\nNX   Successfully ran target lint for 400 projects`;
    const result = truncateStepErrors(output);
    expect(result.length).toBeLessThan(output.length);
    expect(result).toContain('more lines — run step directly for full output');
  });

  it('does not truncate a body of exactly 20 content lines', () => {
    const body = Array.from({ length: 20 }, (_, i) => `line ${i}`).join('\n');
    const output = `1/1 Lint...\n${body}`;
    expect(truncateStepErrors(output)).toBe(output);
  });

  it('returns output unchanged when no step headers are present', () => {
    const output = 'just some output\nno step headers';
    expect(truncateStepErrors(output)).toBe(output);
  });
});

describe('buildCompactOutput', () => {
  it('compresses formatter output and truncates step bodies for pc-format', () => {
    const prettierLines = Array.from(
      { length: 500 },
      (_, i) => `apps/web/src/file${i}.tsx ${i + 1}ms (unchanged)`,
    ).join('\n');
    const output = `5/9 Formatting...\n${prettierLines}\nNX  Successfully ran target format`;
    const result = buildCompactOutput(output, 30_000);
    expect(result).toContain('[Formatting: 500 files checked, 0 changed]');
    expect(result.length).toBeLessThan(output.length);
  });

  it('caps a large eslint dump for pc-lint even though it is not prettier-shaped', () => {
    const errorLines = Array.from(
      { length: 500 },
      (_, i) => `  ${i}:1  error  something wrong  some-rule`,
    ).join('\n');
    const output = `6/9 Linting...\n${errorLines}\n✖ 500 problems (500 errors, 0 warnings)`;
    const result = buildCompactOutput(output, 30_000);
    expect(result.length).toBeLessThan(output.length);
    expect(result).toContain('more lines — run step directly for full output');
  });
});
