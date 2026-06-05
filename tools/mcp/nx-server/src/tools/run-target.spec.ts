import { describe, expect, it, jest } from '@jest/globals';

jest.mock('../run-command.js', () => ({
  getRepoRoot: jest.fn(() => '/repo'),
  runNx: jest.fn(),
}));

import { coalesceWindowsTestPathPatterns } from './run-target.js';

describe('coalesceWindowsTestPathPatterns', () => {
  it('coalesces two separate values into a single pipe-separated token', () => {
    expect(
      coalesceWindowsTestPathPatterns([
        '--testPathPatterns',
        'expo-public-env',
        'statsApiUrl',
      ]),
    ).toEqual(['--testPathPatterns', 'expo-public-env|statsApiUrl']);
  });

  it('coalesces three values into a single pipe-separated token', () => {
    expect(
      coalesceWindowsTestPathPatterns([
        '--testPathPatterns',
        'FileA',
        'FileB',
        'FileC',
      ]),
    ).toEqual(['--testPathPatterns', 'FileA|FileB|FileC']);
  });

  it('leaves a single value unchanged (no coalescing needed)', () => {
    expect(
      coalesceWindowsTestPathPatterns(['--testPathPatterns', 'FileA']),
    ).toEqual(['--testPathPatterns', 'FileA']);
  });

  it('leaves a single already-pipe-separated value unchanged', () => {
    expect(
      coalesceWindowsTestPathPatterns([
        '--testPathPatterns',
        'expo-public-env|statsApiUrl',
      ]),
    ).toEqual(['--testPathPatterns', 'expo-public-env|statsApiUrl']);
  });

  it('stops coalescing at flag boundaries (does not absorb --all)', () => {
    expect(
      coalesceWindowsTestPathPatterns([
        '--testPathPatterns',
        'FileA',
        'FileB',
        '--all',
      ]),
    ).toEqual(['--testPathPatterns', 'FileA|FileB', '--all']);
  });

  it('handles equals-form with one trailing value', () => {
    expect(
      coalesceWindowsTestPathPatterns([
        '--testPathPatterns=expo-public-env',
        'statsApiUrl',
      ]),
    ).toEqual(['--testPathPatterns=expo-public-env|statsApiUrl']);
  });

  it('handles equals-form with two trailing values', () => {
    expect(
      coalesceWindowsTestPathPatterns([
        '--testPathPatterns=FileA',
        'FileB',
        'FileC',
      ]),
    ).toEqual(['--testPathPatterns=FileA|FileB|FileC']);
  });

  it('returns tokens unchanged when no --testPathPatterns flag is present', () => {
    expect(coalesceWindowsTestPathPatterns(['--all', '--verbose'])).toEqual([
      '--all',
      '--verbose',
    ]);
  });

  it('does not mutate the input array', () => {
    const input = ['--testPathPatterns', 'FileA', 'FileB'];
    const original = [...input];
    coalesceWindowsTestPathPatterns(input);
    expect(input).toEqual(original);
  });
});
