import React from 'react';
import { render } from '@testing-library/react';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { formatPageTitle, PageMeta } from './PageMeta';

describe('formatPageTitle (LS-10711)', () => {
  it('appends the brand suffix once', () => {
    expect(formatPageTitle('Standings – QA Test Sluggers')).toBe(
      'Standings – QA Test Sluggers | Legacy Sports',
    );
  });

  it.each([
    ['Minigames — Legacy Sports', 'Minigames | Legacy Sports'],
    ['QA Test Sluggers · Legacy Sports', 'QA Test Sluggers | Legacy Sports'],
    ['Sign In | Legacy Sports', 'Sign In | Legacy Sports'],
    ['Legacy Sports', 'Legacy Sports'],
  ])(
    'does not duplicate a brand the caller already added: %s',
    (input, out) => {
      expect(formatPageTitle(input)).toBe(out);
    },
  );
});

describe('PageMeta', () => {
  it('sets document.title with a single brand suffix', () => {
    render(<PageMeta title="Minigames" />);
    expect(document.title).toBe('Minigames | Legacy Sports');
  });
});

// PageMeta owns the " | Legacy Sports" suffix, so no caller may pass a title
// literal that already contains the brand (LS-10711).
describe('PageMeta callers', () => {
  const SRC_ROOT = join(__dirname, '..');

  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return sourceFiles(path);
      return /\.tsx$/.test(name) && !/\.spec\.tsx$/.test(name) ? [path] : [];
    });
  }

  it('never hard-code "Legacy Sports" in a PageMeta title', () => {
    const offenders = sourceFiles(SRC_ROOT).flatMap((file) => {
      const elements = readFileSync(file, 'utf8').match(
        /<PageMeta\b[\s\S]*?\/>/g,
      );
      return (elements ?? [])
        .filter((el) => /title=\{?\s*[`'"][^`'"]*Legacy Sports/.test(el))
        .map((el) => `${file}: ${el}`);
    });
    expect(offenders).toEqual([]);
  });
});
