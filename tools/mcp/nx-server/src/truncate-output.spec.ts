import { describe, expect, it } from '@jest/globals';

import {
  buildCompactOutput,
  compressFormatterOutput,
  labelBenignEslintPreFixCrash,
  truncateOutput,
  truncateOutputPreferTail,
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

describe('labelBenignEslintPreFixCrash', () => {
  it('prefixes the known-benign eslint --fix crash banner as non-fatal', () => {
    const output = [
      '6/9 Linting...',
      '  Fixing 3 file(s) in tools/mcp/worktree-server...',
      '',
      'Oops! Something went wrong! :(',
      '',
      'ESLint: 9.39.5',
      '',
      'No files matching the pattern "src/index.ts" were found.',
      'Please check for typing mistakes in the pattern.',
      '',
      ' NX   Running target lint for project mcp-worktree-server:',
      ' NX   Successfully ran target lint for project mcp-worktree-server',
    ].join('\n');

    const result = labelBenignEslintPreFixCrash(output);
    expect(result).toContain('[non-fatal, pre-fix step');
    expect(result).toContain('Oops! Something went wrong! :(');
    expect(result).toContain('Successfully ran target lint');
  });

  it('leaves output unchanged when the banner is absent', () => {
    const output = '6/9 Linting...\nNX  Successfully ran target lint';
    expect(labelBenignEslintPreFixCrash(output)).toBe(output);
  });

  it('labels every occurrence when the crash repeats across projects', () => {
    const banner =
      'Oops! Something went wrong! :(\n\nESLint: 9.39.5\n\nNo files matching the pattern "src/index.ts" were found.\nPlease check for typing mistakes in the pattern.\n';
    const output = `${banner}\n${banner}`;
    const result = labelBenignEslintPreFixCrash(output);
    expect(result.match(/\[non-fatal, pre-fix step/g)).toHaveLength(2);
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

describe('truncateOutputPreferTail (LS-10092)', () => {
  it('returns input unchanged when under the limit', () => {
    expect(truncateOutputPreferTail('short', 100)).toBe('short');
  });

  it('keeps more of the tail than the default balanced truncation', () => {
    const input = 'A'.repeat(5_000) + 'B'.repeat(5_000);
    const tailBiased = truncateOutputPreferTail(input, 1_000);
    const balanced = truncateOutput(input, 1_000);

    const countB = (s: string) => s.split('').filter((c) => c === 'B').length;
    expect(countB(tailBiased)).toBeGreaterThan(countB(balanced));
    expect(tailBiased.startsWith('A')).toBe(true);
    expect(tailBiased.endsWith('B')).toBe(true);
    expect(tailBiased).toContain('characters omitted');
  });

  it('stays within the character budget', () => {
    const result = truncateOutputPreferTail('X'.repeat(10_000), 500);
    expect(result.length).toBeLessThanOrEqual(500);
  });
});

describe('truncateStepErrors with preferTail (LS-10092)', () => {
  const failingStep = [
    '6/9 Linting...',
    ...Array.from({ length: 30 }, (_, i) => `progress line ${i}`),
    ...Array.from({ length: 5 }, (_, i) => `error: real violation ${i}`),
  ].join('\n');

  it('keeps the end of an over-long step body instead of the start', () => {
    const result = truncateStepErrors(failingStep, true);
    expect(result).toContain('error: real violation 4');
    expect(result).toContain('earlier lines omitted');
    expect(result).not.toContain('progress line 0');
    // The header keeps its own line — the note must not be appended to it.
    expect(result.split('\n')[0]).toBe('6/9 Linting...');
  });

  it('keeps the start of the body by default (unchanged behaviour)', () => {
    const result = truncateStepErrors(failingStep);
    expect(result).toContain('progress line 0');
    expect(result).not.toContain('error: real violation 4');
    expect(result).toContain('more lines — run step directly for full output');
  });

  it('leaves a short step body alone in either mode', () => {
    const short = ['1/9 Checking...', 'all good'].join('\n');
    expect(truncateStepErrors(short, true)).toBe(short);
    expect(truncateStepErrors(short)).toBe(short);
  });
});

describe('buildCompactOutput with preferTail (LS-10092)', () => {
  it('surfaces the trailing error list a head-truncated chunk would drop', () => {
    const output = [
      '6/9 Linting...',
      ...Array.from({ length: 400 }, (_, i) => `checked project ${i}`),
      '/repo/lib/a.ts:12:1  error  Unexpected any  @typescript-eslint/no-explicit-any',
    ].join('\n');

    const tailBiased = buildCompactOutput(output, 30_000, true);
    expect(tailBiased).toContain('@typescript-eslint/no-explicit-any');
    expect(buildCompactOutput(output, 30_000)).not.toContain(
      '@typescript-eslint/no-explicit-any',
    );
  });
});
