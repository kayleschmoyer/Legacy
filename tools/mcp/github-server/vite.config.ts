import { defineConfig, type Plugin } from 'vite';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { cjsPackageJsonPlugin, dep0169UrlShimPlugin } from '../../vite-configs';

// undici (pulled in via @octokit/request) statically references `node:sqlite`
// for its optional SqliteCacheStore. Rollup hoists the require to module init
// in the CJS bundle, which crashes Lambda cold start on Node 20 (node:sqlite
// is Node 22+ only). Redirect resolution to a virtual stub that only throws
// if a code path actually constructs SqliteCacheStore — Octokit's default
// flow never does.
function nodeSqliteStubPlugin(): Plugin {
  const VIRTUAL_ID = '\0node-sqlite-stub';
  return {
    name: 'node-sqlite-stub',
    enforce: 'pre',
    resolveId(id) {
      if (id === 'node:sqlite' || id === 'sqlite') return VIRTUAL_ID;
      return null;
    },
    load(id) {
      if (id !== VIRTUAL_ID) return null;
      return `
const unsupported = () => {
  throw new Error('node:sqlite is unavailable on this Node runtime (requires Node 22+). undici SqliteCacheStore is not supported in this bundle.');
};
class DatabaseSync { constructor() { unsupported(); } }
class StatementSync { constructor() { unsupported(); } }
export { DatabaseSync, StatementSync };
export default { DatabaseSync, StatementSync };
`;
    },
  };
}

export default defineConfig({
  cacheDir: '../../../node_modules/.vite/tools/mcp/github-server',

  plugins: [
    nodeSqliteStubPlugin(),
    dep0169UrlShimPlugin(),
    nxViteTsPaths(),
    cjsPackageJsonPlugin(),
  ],

  ssr: {
    target: 'node',
    noExternal: true,
  },

  build: {
    outDir: 'dist',
    emptyOutDir: true,
    ssr: true,
    sourcemap: false,
    rollupOptions: {
      input: 'src/lambda.ts',
      output: {
        entryFileNames: 'index.js',
        format: 'cjs',
      },
      external: [
        'path',
        'fs',
        'crypto',
        'http',
        'https',
        'os',
        'util',
        'events',
        'stream',
        'buffer',
        'url',
        'querystring',
        'zlib',
        '@aws-sdk/client-secrets-manager',
        'libsodium-wrappers',
      ],
    },
    target: 'node20',
  },
});
