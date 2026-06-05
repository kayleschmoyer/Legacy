import { describe, expect, it } from '@jest/globals';

import {
  parseSteps,
  extractErrors,
  truncateOutput,
  parseAndValidateVariables,
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
