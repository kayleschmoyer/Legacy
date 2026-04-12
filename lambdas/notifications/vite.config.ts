import { defineConfig, loadEnv } from 'vite';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { resolve } from 'path';
import { dep0169UrlShimPlugin } from '../../tools/vite-configs';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, resolve(__dirname, '../../'), '');
  Object.assign(process.env, env);

  return {
    cacheDir: '../../node_modules/.vite/lambdas/notifications',
    root: __dirname,
    envDir: resolve(__dirname, '../../'),

    plugins: [dep0169UrlShimPlugin(), nxViteTsPaths()],

    build: {
      emptyOutDir: true,
      sourcemap: false,
      lib: {
        entry: 'src/index.ts',
        fileName: 'index',
        formats: ['cjs'],
      },
      outDir: 'dist',
      rollupOptions: {
        external: (id) => {
          const builtins = [
            'assert',
            'buffer',
            'child_process',
            'cluster',
            'crypto',
            'dgram',
            'dns',
            'domain',
            'events',
            'fs',
            'http',
            'https',
            'net',
            'os',
            'path',
            'punycode',
            'querystring',
            'readline',
            'stream',
            'string_decoder',
            'tls',
            'tty',
            'url',
            'util',
            'v8',
            'vm',
            'zlib',
          ];
          return (
            builtins.includes(id) || builtins.some((b) => id === `node:${b}`)
          );
        },
      },
      ssr: true,
      target: 'node20',
    },
    ssr: {
      noExternal: true,
    },
  };
});
