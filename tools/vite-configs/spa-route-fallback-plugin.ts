import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { Plugin, ResolvedConfig } from 'vite';

export interface SpaRouteFallbackPluginOptions {
  /**
   * Path to the React Router source file containing the `<Route path="..." />`
   * declarations to enumerate. Resolved relative to the workspace root.
   */
  routesFile: string;
  /**
   * Additional static routes to pre-render that aren't declared in `routesFile`
   * (e.g. pages served by external systems but linked from the app).
   */
  extraRoutes?: string[];
}

/**
 * Extract static (non-parameterized) route paths from a React Router source
 * file by scanning for `path="..."` attributes. Paths containing `:` (dynamic
 * segments) and the root `/` are excluded.
 *
 * Exported for unit testing.
 */
export function extractStaticRoutes(source: string): string[] {
  const seen = new Set<string>();
  const re = /path=(?:"([^"]+)"|'([^']+)')/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const raw = m[1] ?? m[2];
    if (!raw) continue;
    if (!raw.startsWith('/')) continue;
    if (raw === '/') continue;
    if (raw.includes(':')) continue;
    if (raw.includes('*')) continue;
    seen.add(raw.replace(/\/+$/, ''));
  }
  return [...seen].sort();
}

/**
 * Vite plugin that emits per-route `<route>/index.html` copies of the built
 * `index.html` for every static top-level route. Lets GitHub Pages return
 * HTTP 200 for deep links (instead of the 404 status that the `404.html`
 * fallback returns) so refreshes, bookmarks, link previews, and crawlers
 * don't treat valid SPA pages as broken (LS-4841).
 *
 * Only runs during `vite build` — dev server is unaffected.
 */
export function spaRouteFallbackPlugin(
  options: SpaRouteFallbackPluginOptions,
): Plugin {
  let resolved: ResolvedConfig;
  return {
    name: 'spa-route-fallback',
    apply: 'build',
    configResolved(config) {
      resolved = config;
    },
    closeBundle() {
      const outDir = resolve(resolved.root, resolved.build.outDir);
      const indexPath = join(outDir, 'index.html');
      let indexHtml: string;
      try {
        indexHtml = readFileSync(indexPath, 'utf8');
      } catch {
        resolved.logger.warn(
          `[spa-route-fallback] no index.html at ${indexPath}; skipping`,
        );
        return;
      }
      const routesPath = resolve(resolved.root, options.routesFile);
      let routesSource: string;
      try {
        routesSource = readFileSync(routesPath, 'utf8');
      } catch {
        resolved.logger.warn(
          `[spa-route-fallback] cannot read ${routesPath}; skipping`,
        );
        return;
      }
      const routes = new Set([
        ...extractStaticRoutes(routesSource),
        ...(options.extraRoutes ?? []),
      ]);
      let written = 0;
      for (const route of routes) {
        const dest = join(outDir, route.replace(/^\//, ''), 'index.html');
        mkdirSync(dirname(dest), { recursive: true });
        writeFileSync(dest, indexHtml);
        written += 1;
      }
      resolved.logger.info(
        `[spa-route-fallback] emitted ${written} per-route index.html fallbacks`,
      );
    },
  };
}
