import { defineConfig } from 'vite';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { dep0169UrlShimPlugin } from '../../vite-configs';

export default defineConfig({
  cacheDir: '../../../node_modules/.vite/tools/mcp/github-server',

  plugins: [dep0169UrlShimPlugin(), nxViteTsPaths()],

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
