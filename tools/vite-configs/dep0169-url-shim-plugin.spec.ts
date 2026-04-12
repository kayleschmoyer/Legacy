/**
 * Tests for the DEP0169 url.parse() shim Vite plugin.
 *
 * Run with: pnpm exec jest --config tools/vite-configs/jest.config.ts tools/vite-configs/dep0169-url-shim-plugin.spec.ts
 */

import type { Plugin, UserConfig } from 'vite';
import { dep0169UrlShimPlugin } from './dep0169-url-shim-plugin';
import { safeUrlParse } from './safe-url-parse';

describe('dep0169UrlShimPlugin', () => {
  let plugin: Plugin;

  beforeEach(() => {
    plugin = dep0169UrlShimPlugin();
  });

  describe('plugin metadata', () => {
    it('has the correct name', () => {
      expect(plugin.name).toBe('dep0169-url-shim');
    });

    it('is enforced pre', () => {
      expect(plugin.enforce).toBe('pre');
    });
  });

  describe('config hook — removes url from externals', () => {
    it('removes url from array-based external', () => {
      const configHook = plugin.config as (config: UserConfig) => void;
      const config: UserConfig = {
        build: {
          rollupOptions: {
            external: ['path', 'url', 'fs', 'crypto'],
          },
        },
      };
      configHook(config);
      expect(config.build!.rollupOptions!.external).toEqual([
        'path',
        'fs',
        'crypto',
      ]);
    });

    it('wraps function-based external to exclude url', () => {
      const configHook = plugin.config as (config: UserConfig) => void;
      const origExternal = (id: string) => ['path', 'url', 'fs'].includes(id);
      const config: UserConfig = {
        build: {
          rollupOptions: {
            external: origExternal,
          },
        },
      };
      configHook(config);

      const wrappedFn = config.build!.rollupOptions!.external as (
        id: string,
        importer: string | undefined,
        isResolved: boolean,
      ) => boolean;

      // url should now return false (handled by plugin)
      expect(wrappedFn('url', undefined, false)).toBe(false);
      // Other modules should pass through to original
      expect(wrappedFn('path', undefined, false)).toBe(true);
      expect(wrappedFn('fs', undefined, false)).toBe(true);
      expect(wrappedFn('crypto', undefined, false)).toBe(false);
    });

    it('handles string-based external equal to url', () => {
      const configHook = plugin.config as (config: UserConfig) => void;
      const config: UserConfig = {
        build: {
          rollupOptions: {
            external: 'url' as unknown as string[],
          },
        },
      };
      configHook(config);
      expect(config.build!.rollupOptions!.external).toEqual([]);
    });

    it('does nothing when rollupOptions is absent', () => {
      const configHook = plugin.config as (config: UserConfig) => void;
      const config: UserConfig = { build: {} };
      configHook(config);
      expect(config.build!.rollupOptions).toBeUndefined();
    });
  });

  describe('resolveId hook', () => {
    it('resolves bare "url" to the virtual module ID', () => {
      const resolveId = plugin.resolveId as (id: string) => string | null;
      expect(resolveId('url')).toBe('\0dep0169-url-shim');
    });

    it('does not resolve node:url', () => {
      const resolveId = plugin.resolveId as (id: string) => string | null;
      expect(resolveId('node:url')).toBeNull();
    });

    it('does not resolve other modules', () => {
      const resolveId = plugin.resolveId as (id: string) => string | null;
      expect(resolveId('path')).toBeNull();
      expect(resolveId('fs')).toBeNull();
    });
  });

  describe('load hook', () => {
    it('returns code for the virtual module ID', () => {
      const load = plugin.load as (id: string) => string | null;
      const code = load('\0dep0169-url-shim');
      expect(code).toBeTruthy();
      expect(code).toContain('safeUrlParse');
      expect(code).toContain('export default');
    });

    it('returns null for other IDs', () => {
      const load = plugin.load as (id: string) => string | null;
      expect(load('something-else')).toBeNull();
    });

    it('emits ESM syntax (not CJS)', () => {
      const load = plugin.load as (id: string) => string | null;
      const code = load('\0dep0169-url-shim')!;
      // Should use ESM imports/exports
      expect(code).toContain("import * as nodeUrl from 'node:url'");
      expect(code).toContain('export const parse');
      expect(code).toContain('export default');
      // Should NOT use CJS
      expect(code).not.toContain('module.exports');
      expect(code).not.toContain("require('node:url')");
    });

    it('uses safeUrlParse from safe-url-parse.ts (single source of truth)', () => {
      const load = plugin.load as (id: string) => string | null;
      const code = load('\0dep0169-url-shim')!;
      // The virtual module should contain safeUrlParse via .toString()
      expect(code).toContain('safeUrlParse');
      // Should reference the function generated from the imported module
      expect(code).toContain('export const parse = safeUrlParse');
    });
  });
});

describe('safeUrlParse — WHATWG URL replacement for url.parse()', () => {
  describe('absolute URLs (Rollbar endpoint pattern)', () => {
    it('parses https URL with path', () => {
      const result = safeUrlParse('https://api.rollbar.com/api/1/item/');
      expect(result.protocol).toBe('https:');
      expect(result.hostname).toBe('api.rollbar.com');
      expect(result.pathname).toBe('/api/1/item/');
      expect(result.host).toBe('api.rollbar.com');
      expect(result.slashes).toBe(true);
    });

    it('parses URL with port', () => {
      const result = safeUrlParse('http://localhost:3000/api/test');
      expect(result.protocol).toBe('http:');
      expect(result.hostname).toBe('localhost');
      expect(result.port).toBe('3000');
      expect(result.pathname).toBe('/api/test');
    });

    it('parses URL with query string (no parseQueryString)', () => {
      const result = safeUrlParse('https://example.com/path?foo=bar&baz=qux');
      expect(result.search).toBe('?foo=bar&baz=qux');
      expect(result.query).toBe('foo=bar&baz=qux');
      expect(result.pathname).toBe('/path');
      expect(result.path).toBe('/path?foo=bar&baz=qux');
    });

    it('parses URL with query string (parseQueryString=true)', () => {
      const result = safeUrlParse(
        'https://example.com/path?foo=bar&baz=qux',
        true,
      );
      expect(result.query).toEqual({ foo: 'bar', baz: 'qux' });
    });

    it('parses URL with hash', () => {
      const result = safeUrlParse('https://example.com/path#section');
      expect(result.hash).toBe('#section');
    });

    it('parses URL with auth', () => {
      const result = safeUrlParse('https://user:pass@example.com/path');
      expect(result.auth).toBe('user:pass');
    });

    it('parses URL with username only (no password)', () => {
      const result = safeUrlParse('https://user@example.com/path');
      expect(result.auth).toBe('user');
    });

    it('returns null auth when no credentials', () => {
      const result = safeUrlParse('https://example.com/path');
      expect(result.auth).toBeNull();
    });

    it('returns null port when not specified', () => {
      const result = safeUrlParse('https://example.com/path');
      expect(result.port).toBeNull();
    });
  });

  describe('relative URLs (follow-redirects / request path pattern)', () => {
    it('parses root-relative path', () => {
      const result = safeUrlParse('/api/foo');
      expect(result.pathname).toBe('/api/foo');
      expect(result.protocol).toBeNull();
      expect(result.hostname).toBeNull();
    });

    it('parses relative path with query string', () => {
      const result = safeUrlParse('/api/foo?bar=1&baz=2');
      expect(result.pathname).toBe('/api/foo');
      expect(result.search).toBe('?bar=1&baz=2');
      expect(result.query).toBe('bar=1&baz=2');
      expect(result.path).toBe('/api/foo?bar=1&baz=2');
    });

    it('parses relative path with query string (parseQueryString=true)', () => {
      const result = safeUrlParse('/api/foo?bar=1&baz=2', true);
      expect(result.query).toEqual({ bar: '1', baz: '2' });
    });

    it('parses relative path with hash', () => {
      const result = safeUrlParse('/page#anchor');
      expect(result.pathname).toBe('/page');
      expect(result.hash).toBe('#anchor');
    });

    it('parses relative path with query and hash', () => {
      const result = safeUrlParse('/page?key=val#anchor');
      expect(result.pathname).toBe('/page');
      expect(result.search).toBe('?key=val');
      expect(result.hash).toBe('#anchor');
      expect(result.path).toBe('/page?key=val');
    });

    it('returns null for all network-related fields on relative URLs', () => {
      const result = safeUrlParse('/just/a/path');
      expect(result.protocol).toBeNull();
      expect(result.slashes).toBeNull();
      expect(result.auth).toBeNull();
      expect(result.host).toBeNull();
      expect(result.port).toBeNull();
      expect(result.hostname).toBeNull();
    });

    it('sets href to original input for relative URLs', () => {
      const input = '/api/foo?bar=1';
      const result = safeUrlParse(input);
      expect(result.href).toBe(input);
    });
  });

  describe('protocol-relative URLs', () => {
    it('parses //host/path with hostname and host', () => {
      const result = safeUrlParse('//example.com/path');
      expect(result.hostname).toBe('example.com');
      expect(result.host).toBe('example.com');
      expect(result.pathname).toBe('/path');
      expect(result.protocol).toBeNull();
      expect(result.slashes).toBe(true);
      expect(result.href).toBe('//example.com/path');
    });

    it('parses //host:port/path', () => {
      const result = safeUrlParse('//localhost:8080/api');
      expect(result.hostname).toBe('localhost');
      expect(result.port).toBe('8080');
      expect(result.host).toBe('localhost:8080');
      expect(result.pathname).toBe('/api');
    });

    it('parses //host/path?query#hash', () => {
      const result = safeUrlParse('//example.com/path?q=1#frag');
      expect(result.hostname).toBe('example.com');
      expect(result.search).toBe('?q=1');
      expect(result.hash).toBe('#frag');
    });

    it('parses //host/path with parseQueryString', () => {
      const result = safeUrlParse('//example.com/path?a=1&b=2', true);
      expect(result.query).toEqual({ a: '1', b: '2' });
    });
  });

  describe('edge cases', () => {
    it('coerces non-string input', () => {
      // url.parse() coerces non-strings — our shim should too
      const result = safeUrlParse(null as unknown as string);
      expect(result).toBeDefined();
      expect(result.pathname).toBeDefined();
    });

    it('handles empty string', () => {
      const result = safeUrlParse('');
      expect(result).toBeDefined();
      expect(result.pathname).toBe('');
    });

    it('handles hash before query string (/path#frag?x=1)', () => {
      // When # appears before ?, the ? is part of the fragment, not a query
      const result = safeUrlParse('/path#frag?x=1');
      expect(result.pathname).toBe('/path');
      expect(result.hash).toBe('#frag?x=1');
      expect(result.search).toBeNull();
      expect(result.query).toBeNull();
    });

    it('handles URL with empty query string', () => {
      // WHATWG URL normalises trailing `?` to no search — unlike legacy url.parse
      // which returns search: '?'.  This difference is harmless for our use case.
      const result = safeUrlParse('https://example.com/path?');
      expect(result.search).toBeNull();
      expect(result.pathname).toBe('/path');
    });
  });
});
