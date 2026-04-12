import type { Plugin, UserConfig } from 'vite';
import { safeUrlParse } from './safe-url-parse';

/**
 * DEP0169 url.parse() shim — Vite plugin
 *
 * Node 22+ emits [DEP0169] when `url.parse()` is called.  Several bundled
 * dependencies (Rollbar, follow-redirects, etc.) still use `url.parse()`
 * internally, so the deprecation warning surfaces in CI Build Validation
 * logs and at Lambda runtime.
 *
 * This plugin replaces the `url` module in the bundle with a thin shim
 * that delegates `url.parse()` to the WHATWG `URL` constructor, avoiding
 * the deprecation entirely.  All other `url` exports (`format`, `resolve`,
 * `URL`, `URLSearchParams`, `fileURLToPath`, etc.) pass through unchanged.
 *
 * The shim is only injected into the **bundle output** — Node.js built-in
 * `node:url` remains external and untouched at runtime.
 *
 * @see https://nodejs.org/api/deprecations.html#DEP0169
 */
export function dep0169UrlShimPlugin(): Plugin {
  const VIRTUAL_ID = '\0dep0169-url-shim';

  // Generate the virtual module from the same safeUrlParse function that
  // tests exercise — single source of truth, no inline duplication.
  const safeUrlParseFn = safeUrlParse.toString();

  return {
    name: 'dep0169-url-shim',
    enforce: 'pre',

    // ── 1. Remove bare `url` from the external list so Rollup resolves it
    //       through us instead of leaving a raw `require('url')`.
    config(config: UserConfig) {
      const rollup = config.build?.rollupOptions;
      if (!rollup) return;

      const original = rollup.external;

      if (typeof original === 'function') {
        const origFn = original;
        rollup.external = (
          id: string,
          importer: string | undefined,
          isResolved: boolean,
        ) => {
          if (id === 'url') return false; // we handle it
          return origFn(id, importer, isResolved);
        };
      } else if (Array.isArray(original)) {
        rollup.external = original.filter((e) => e !== 'url');
      } else if (typeof original === 'string' && original === 'url') {
        rollup.external = [];
      }
      // RegExp / other forms: leave as-is (unlikely to match bare `url`)
    },

    // ── 2. Intercept `require('url')` / `import 'url'` and resolve to
    //       our virtual module.
    resolveId(id: string) {
      if (id === 'url') return VIRTUAL_ID;
      return null;
    },

    // ── 3. Provide the shim code as ESM (Rollup treats virtual modules as ESM).
    //       `node:url` remains external — Rollup will emit a `require('node:url')`
    //       in the final CJS output automatically.
    //       The safeUrlParse function is injected via .toString() from the
    //       imported module — single source of truth with the test suite.
    load(id: string) {
      if (id !== VIRTUAL_ID) return null;

      return `
import * as nodeUrl from 'node:url';

${safeUrlParseFn}

// Re-export everything from node:url, overriding parse with our shim
export const parse = safeUrlParse;
export const {
  format,
  resolve,
  resolveObject,
  URL: _URL,
  URLSearchParams: _URLSearchParams,
  fileURLToPath,
  pathToFileURL,
  urlToHttpOptions,
  Url,
  domainToASCII,
  domainToUnicode,
} = nodeUrl;

// Re-export URL and URLSearchParams under their original names
export { _URL as URL, _URLSearchParams as URLSearchParams };

// Default export: full module object with parse replaced
const shimmed = { ...nodeUrl, parse: safeUrlParse };
export default shimmed;
`;
    },
  };
}
