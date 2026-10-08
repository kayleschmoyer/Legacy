import React from 'react';
import { render } from '@testing-library/react';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { formatPageTitle, PageMeta } from './PageMeta';
import { SITE_URL } from '../config/site';

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

// Crawlers read the static share tags in index.html without running JS, so
// they must point at the real production domain (LS-10765).
describe('static share meta (LS-10765)', () => {
  const WEB_ROOT = join(__dirname, '..', '..');
  const indexHtml = readFileSync(join(WEB_ROOT, 'index.html'), 'utf8');

  it('never references the dead legacy.sports domain', () => {
    expect(indexHtml).not.toMatch(/legacy\.sports/);
    expect(readFileSync(join(__dirname, 'PageMeta.tsx'), 'utf8')).not.toMatch(
      /legacy\.sports/,
    );
  });

  it.each([
    ['property="og:url"', '%VITE_SITE_URL%/'],
    ['property="og:image"', '%VITE_SITE_URL%/logo-512.png'],
    ['name="twitter:image"', '%VITE_SITE_URL%/logo-512.png'],
  ])('builds %s from SITE_URL', (attr, content) => {
    expect(indexHtml).toContain(`<meta ${attr} content="${content}" />`);
  });

  it('SITE_URL is the domain deploy-web.yml publishes to', () => {
    const deployWorkflow = readFileSync(
      join(WEB_ROOT, '..', '..', '.github', 'workflows', 'deploy-web.yml'),
      'utf8',
    );
    const cname = deployWorkflow.match(/echo "([^"]+)" > \S*CNAME/)?.[1];
    expect(SITE_URL).toBe(`https://${cname}`);
  });

  it('serves the shared preview image from public/', () => {
    expect(statSync(join(WEB_ROOT, 'public', 'logo-512.png')).isFile()).toBe(
      true,
    );
  });
});
