import { describe, expect, it } from '@jest/globals';

import {
  parseSteps,
  extractErrors,
  truncateOutput,
  parseAndValidateVariables,
  compressFormatterOutput,
  truncateStepErrors,
  buildCompactOutput,
} from './run-target-utils.js';

describe('parseSteps', () => {
  it('marks a step passed when NX reports success', () => {
    const output = [
      '1/2 Typecheck...',
      'NX   Successfully ran target typecheck for project web',
      '2/2 Lint...',
      'NX   Successfully ran target lint for project web',
    ].join('\n');

    const steps = parseSteps(output);
    expect(steps).toEqual([
      { name: 'Typecheck', status: 'passed' },
      { name: 'Lint', status: 'passed' },
    ]);
  });

  it('marks a step failed on an NX failed-tasks verdict', () => {
    const output = ['1/1 Test...', 'NX   Failed tasks: test'].join('\n');

    const steps = parseSteps(output);
    expect(steps).toEqual([{ name: 'Test', status: 'failed' }]);
  });

  it('marks a step failed on a TypeScript compiler error', () => {
    const output = [
      '1/1 Typecheck...',
      "src/foo.ts(3,5): error TS2322: Type 'string' is not assignable.",
    ].join('\n');

    const steps = parseSteps(output);
    expect(steps[0]).toEqual({ name: 'Typecheck', status: 'failed' });
  });

  it('does not falsely fail on console.error noise like "Failed prop type"', () => {
    const output = [
      '1/1 Test...',
      'Warning: Failed prop type: Invalid prop `foo`',
      'NX   Successfully ran target test for project web',
    ].join('\n');

    const steps = parseSteps(output);
    expect(steps[0].status).toBe('passed');
  });

  it('returns an empty array when no step markers are present', () => {
    expect(parseSteps('just some unrelated output')).toEqual([]);
  });
});

describe('extractErrors', () => {
  it('collects error and FAIL lines as anchors', () => {
    const output = ['ERROR: something broke', 'FAIL src/bar.spec.ts'].join(
      '\n',
    );

    const errors = extractErrors(output);
    expect(errors).toContain('ERROR: something broke');
    expect(errors).toContain('FAIL src/bar.spec.ts');
  });

  it('does not anchor on a node_modules line even when it says "failed"', () => {
    const output = [
      'node_modules/pkg/index.js: failed internally',
      'just a plain line',
      'another plain line',
    ].join('\n');

    // The node_modules line is excluded as an anchor, and nothing else matches,
    // so no errors are collected.
    expect(extractErrors(output)).toEqual([]);
  });

  it('does not anchor on a stack frame line', () => {
    const output = [
      '    at error (/repo/foo.ts:1:1)',
      'plain',
      'plain two',
    ].join('\n');

    // The "at ..." stack frame contains "error" but is excluded as an anchor.
    expect(extractErrors(output)).toEqual([]);
  });

  it('deduplicates and caps at 50 entries', () => {
    const lines = Array.from({ length: 200 }, (_, i) => `error number ${i}`);
    const errors = extractErrors(lines.join('\n'));
    expect(errors.length).toBeLessThanOrEqual(50);
  });
});

describe('parseAndValidateVariables — command injection prevention', () => {
  // Every payload contains a metacharacter make or a shell would need for
  // command substitution / chaining. All MUST be rejected before reaching make.
  const malicious = [
    'FOO=$X', // variable expansion
    'FOO=a;rm', // command separator
    'FOO=a&&b', // command chaining
    'FOO=a|b', // pipe
    'FOO=$(id)', // command substitution
    'FOO=a>b', // redirection
    'FOO=`id`', // backtick command substitution
    'FOO=a b', // embedded space splits, second token "b" has no "="
  ];

  it.each(malicious)('rejects malicious payload %p', (variables) => {
    const result = parseAndValidateVariables(variables);
    expect(result.ok).toBe(false);
  });

  it('accepts well-formed KEY=VALUE tokens', () => {
    const result = parseAndValidateVariables('DRYRUN=1 FORCE=1 NO_CONFIRM=1');
    expect(result).toEqual({
      ok: true,
      parts: ['DRYRUN=1', 'FORCE=1', 'NO_CONFIRM=1'],
    });
  });

  it('accepts path-like values with slashes, colons and dots', () => {
    const result = parseAndValidateVariables('OUT=dist/foo.txt WIN=C:\\tmp');
    expect(result.ok).toBe(true);
  });
});

describe('compressFormatterOutput', () => {
  it('collapses unchanged prettier file lines to a count summary', () => {
    const output = [
      '3/9 Formatting...',
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

  it('leaves output unchanged when no prettier lines are present', () => {
    const output = '1/1 Typecheck...\nerror TS2345: foo';
    expect(compressFormatterOutput(output)).toBe(output);
  });
});

describe('truncateStepErrors', () => {
  it('truncates step bodies longer than 20 lines', () => {
    const body = Array.from({ length: 30 }, (_, i) => `line ${i}`).join('\n');
    const output = `1/1 Lint...\n${body}`;
    const result = truncateStepErrors(output);
    expect(result).toContain('more lines — run step directly for full output');
    expect(result).not.toContain('line 25');
  });

  it('does not truncate a body of exactly 20 content lines', () => {
    const body = Array.from({ length: 20 }, (_, i) => `line ${i}`).join('\n');
    const output = `1/1 Lint...\n${body}`;
    expect(truncateStepErrors(output)).toBe(output);
  });

  it('truncates a body of exactly 21 content lines to 20 with a note', () => {
    const body = Array.from({ length: 21 }, (_, i) => `line ${i}`).join('\n');
    const output = `1/1 Lint...\n${body}`;
    const result = truncateStepErrors(output);
    expect(result).toContain(
      '[1 more lines — run step directly for full output]',
    );
    expect(result).not.toContain('line 20');
  });

  it('leaves step bodies of fewer than 20 lines intact', () => {
    const body = Array.from({ length: 10 }, (_, i) => `line ${i}`).join('\n');
    const output = `1/1 Lint...\n${body}`;
    expect(truncateStepErrors(output)).toBe(output);
  });

  it('returns output unchanged when no step headers are present', () => {
    const output = 'just some output\nno step headers';
    expect(truncateStepErrors(output)).toBe(output);
  });
});

describe('buildCompactOutput', () => {
  it('compresses formatter output and truncates step bodies', () => {
    const prettierLines = Array.from(
      { length: 500 },
      (_, i) => `apps/web/src/file${i}.tsx ${i + 1}ms (unchanged)`,
    ).join('\n');
    const output = `1/3 Formatting...\n${prettierLines}\n2/3 Lint...\nall good`;
    const result = buildCompactOutput(output, 30_000);
    expect(result).toContain('[Formatting: 500 files checked, 0 changed]');
    expect(result.length).toBeLessThan(output.length);
  });
});

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
    // Result is materially smaller than the original.
    expect(result.length).toBeLessThan(input.length);
  });
});
