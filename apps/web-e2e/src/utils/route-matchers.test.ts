/**
 * Parity tests for the RegExp route matchers (LS-11043).
 *
 * Each RegExp replaced a `(url: URL) => boolean` predicate passed to
 * `page.route`. The originals are reproduced verbatim below and both are
 * evaluated over the same URL table, so a matcher that drifts — letting a
 * request escape API isolation or skip a mock — fails in `pc-test`.
 * Run via the web-e2e `test` target (`tsx --test`).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  apiIsolationMatcher,
  GRAPHQL_ENDPOINT,
  hostMatcher,
  pathEndsWithMatcher,
  pathIncludesMatcher,
} from './route-matchers';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

const URLS = [
  // GraphQL API (baked-in :5000) + variants
  'http://localhost:5000/graphql',
  'http://localhost:5000/graphql?op=GetLeague',
  'http://127.0.0.1:5000/graphql',
  'https://api.legacysports.dev/dev/graphql',
  'http://localhost:4280/graphql',
  // OAuth proxy :5001
  'http://localhost:5001/google',
  'http://localhost:5001/refresh-jwt',
  'http://localhost:5001/dev/oauth/refresh-jwt',
  'http://localhost:5001/refresh-jwt?x=1',
  'http://localhost:5001/refresh-jwt/extra',
  'http://localhost:5001/forgot-password',
  'http://refresh-jwt/',
  // CDNs / third parties
  'https://accounts.google.com/gsi/client',
  'https://api.giphy.com/v1/gifs/search?q=cat',
  'https://media.giphy.com/media/abc/giphy.gif',
  'https://media.giphy.com.evil.test/x',
  'https://notmedia.giphy.com/x',
  'https://user@media.giphy.com:8443/x',
  'https://example.com/logo.png',
  'https://cdn.example.com/a/b.png',
  'https://www.example.com/logo.png',
  'https://fonts.gstatic.com/s/inter/v1/font.woff2',
  'https://s3.amazonaws.com/bucket/images/upload',
  'http://localhost:5000/images/upload',
  'http://localhost:5000/api/images/upload?sig=1',
  'http://localhost:5000/Images/Upload',
  'http://localhost:5000/?next=/images/upload',
  'http://images/upload',
  // Static assets from the preview server (:4280) and look-alikes
  'http://localhost:4280/',
  'http://localhost:4280/leagues/1?tab=draft',
  'http://localhost:4280/assets/index-abc123.js',
  'http://localhost:4280/assets/index-abc123.css',
  'http://localhost:4280/assets/graphql.generated-abc123.js',
  'http://localhost:4280/assets/inter.woff2',
  'http://localhost:4280#hash',
  'http://127.0.0.1:4280/assets/index.js',
  'http://[::1]:4280/assets/index.js',
  'http://user:pw@localhost:4280/x',
  'http://localhost:42800/x',
  'http://localhost:428/x',
  'http://localhost:4281/x',
  'http://localhost/x',
  'http://localhost.evil.test:4280/x',
  'https://localhost:4280/x',
  'ws://localhost:4280/ws',
  'ws://localhost:5000/graphql',
  // Vite /@fs/ and source paths containing /graphql
  'http://localhost:4280/@fs/home/user/lib/graphql/index.ts',
  'http://localhost:4280/src/graphql/client.ts',
  'http://localhost:4280/src/graphql/client.js',
  'http://localhost:5000/graphql.json',
];

/** Assert `matcher.test(href)` agrees with `predicate(url)` for every URL. */
function assertParity(
  matcher: RegExp,
  predicate: (url: URL) => boolean,
  port?: string,
): void {
  const mismatches = URLS.filter((raw) => {
    const url = new URL(raw);
    return matcher.test(url.href) !== predicate(url);
  });
  assert.deepEqual(mismatches, [], `matcher ${matcher} (port ${port ?? '-'})`);
}

void test('GRAPHQL_ENDPOINT matches the original isGraphQLEndpoint predicate', () => {
  assertParity(GRAPHQL_ENDPOINT, (url) => {
    const s = url.toString();
    return (
      s.includes('/graphql') &&
      !s.includes('/@fs/') &&
      !s.includes('.ts') &&
      !s.includes('.js')
    );
  });
  assert.equal(isGraphQLEndpoint, GRAPHQL_ENDPOINT);
  assert.equal(GRAPHQL_ENDPOINT.test('http://localhost:5000/graphql'), true);
  assert.equal(
    GRAPHQL_ENDPOINT.test('http://localhost:4280/@fs/x/graphql/a'),
    false,
  );
});

void test('apiIsolationMatcher matches the original !isStaticServerRequest predicate', () => {
  for (const port of ['4280', '4200', '80']) {
    const isStaticServerRequest = (url: URL): boolean => {
      const host = url.hostname;
      const isLocalhost =
        host === 'localhost' || host === '127.0.0.1' || host === '::1';
      return isLocalhost && url.port === port;
    };
    assertParity(
      apiIsolationMatcher(port),
      (url) => !isStaticServerRequest(url),
      port,
    );
  }
  const matcher = apiIsolationMatcher('4280');
  // Static assets bypass interception; every API call is still caught.
  assert.equal(matcher.test('http://localhost:4280/assets/index.js'), false);
  assert.equal(matcher.test('http://localhost:5000/graphql'), true);
  assert.equal(matcher.test('http://localhost:5001/refresh-jwt'), true);
  assert.equal(matcher.test('https://accounts.google.com/gsi/client'), true);
});

void test('hostMatcher matches url.hostname equality', () => {
  assertParity(
    hostMatcher('media.giphy.com'),
    (url) => url.hostname === 'media.giphy.com',
  );
  assertParity(
    hostMatcher('api.giphy.com'),
    (url) => url.hostname === 'api.giphy.com',
  );
  assertParity(
    hostMatcher('example.com', 'cdn.example.com'),
    (url) =>
      url.hostname === 'example.com' || url.hostname === 'cdn.example.com',
  );
});

void test('pathIncludesMatcher matches url.pathname.includes', () => {
  assertParity(pathIncludesMatcher('/images/upload'), (url) =>
    url.pathname.includes('/images/upload'),
  );
});

void test('pathEndsWithMatcher matches url.pathname.endsWith', () => {
  assertParity(pathEndsWithMatcher('/refresh-jwt'), (url) =>
    url.pathname.endsWith('/refresh-jwt'),
  );
});

void test('inline GraphQL variants match their original predicates', () => {
  assertParity(/^(?!.*\/@fs\/).*\/graphql/, (url) => {
    return (
      url.toString().includes('/graphql') && !url.toString().includes('/@fs/')
    );
  });
  assertParity(/\/graphql/, (url) => url.toString().includes('/graphql'));
});
