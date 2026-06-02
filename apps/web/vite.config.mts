/// <reference types='vitest' />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';
import { resolve } from 'path';
import { tamaguiPlugin } from '@tamagui/vite-plugin';
import reactNativeWeb from 'vite-plugin-react-native-web';
import { execSync } from 'child_process';
import {
  rollbarSourcemapPlugin,
  spaRouteFallbackPlugin,
} from '../../tools/vite-configs';
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig(({ mode }) => {
  // Load environment variables from workspace root and merge with process.env
  const env = loadEnv(mode, resolve(__dirname, '../../'), '');

  // Merge environment variables into process.env so Vite can pick them up
  Object.assign(process.env, env);

  // Determine if this is a deploy build (uses deploy configuration)
  const isDeployBuild = process.env.NX_TASK_TARGET_CONFIGURATION === 'deploy';
  const isProduction = mode === 'production' || isDeployBuild;

  // Get build information - fallback to local git if not in CI
  // Avoid execSync during Nx graph creation (no build underway)
  const commitSha =
    process.env.VITE_COMMIT_SHA ||
    process.env.GITHUB_SHA ||
    (process.env.NX_TASK_HASH
      ? (() => {
          try {
            return execSync('git rev-parse --short HEAD').toString().trim();
          } catch {
            return 'dev';
          }
        })()
      : 'dev');

  const appVersion = process.env.VITE_APP_VERSION || '0.0.0';
  const buildDate = new Date().toISOString();

  console.log(`ðŸ”§ Build Configuration:
    - Mode: ${mode}
    - Is Deploy Build: ${isDeployBuild}
    - Is Production: ${isProduction}
    - App Version: ${appVersion}
    - Commit SHA: ${commitSha}
  `);

  // Use VITE_BASE_PATH for PR preview deploys, otherwise root path for custom domain
  const basePath = process.env.VITE_BASE_PATH || '/';

  console.log(`ðŸ“ Base Path: ${basePath}`);

  const analyzeBundle = process.env.ANALYZE === 'true';
  if (analyzeBundle) {
    console.log(
      `ðŸ“Š Bundle analysis enabled â€” report: scratch/bundle-report.html`,
    );
  }

  return {
    root: __dirname,
    cacheDir: '../../node_modules/.vite/web',
    base: basePath,
    // Read environment variables from workspace root
    envDir: resolve(__dirname, '../../'),
    // Help Tamagui find the correct paths
    publicDir: 'public',
    // Define environment variables explicitly

    server: {
      port: 4200,
      host: 'localhost',
      strictPort: true,
      proxy: env.VITE_JIRA_PROXY_URL
        ? {
            // Proxy jira-proxy requests through the dev server so the HttpOnly
            // ls_jwt cookie (set on localhost) is forwarded to the API Gateway.
            // Without this, cross-origin requests to the raw API Gateway URL
            // never include the cookie and the lambda returns 401.
            '/__jira-proxy': {
              target: env.VITE_JIRA_PROXY_URL,
              changeOrigin: true,
              rewrite: (path) => path.replace(/^\/__jira-proxy(\/|$)/, ''),
            },
          }
        : undefined,
    },
    preview: {
      port: 4200,
      host: 'localhost',
      strictPort: true,
      // Vite 6 changed cors default to false. Enable it so that Vite's
      // module-preload polyfill can successfully fetch lazy-chunk CSS
      // files via `<link rel="preload" as="style" crossOrigin="">` during
      // E2E tests (playwright webServer uses `vite preview`). Without CORS
      // headers the browser rejects the preload despite a 200 response,
      // causing lazyWithRetry to crash with "Unable to preload CSS for …".
      cors: true,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
    },
    plugins: [
      // Ensure CORS headers are set on ALL preview-server responses so that
      // Vite's module-preload polyfill can fetch lazy-chunk CSS via
      // `<link rel="preload" as="style" crossOrigin="">` without a CORS error.
      // Vite 6 changed `cors` default to false and the `cors: true` option
      // does not reliably apply to sirv-served static files, so this plugin
      // injects the header unconditionally via the connect middleware chain.
      {
        name: 'cors-preview-headers',
        configurePreviewServer(server) {
          server.middlewares.use((_req, res, next) => {
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', '*');
            next();
          });
        },
      },
      // Load TS paths first to ensure proper resolution
      nxViteTsPaths({ debug: false }),
      reactNativeWeb(),
      tamaguiPlugin({
        config: resolve(
          __dirname,
          '../../lib/tamagui-config/src/lib/tamagui-config.ts',
        ),
        platform: 'web',
        // Disable extraction in development to avoid issues
        disableExtraction: process.env.NODE_ENV === 'development',
        // Enable tree shaking
        useReactNativeWebLite: false,
      }),
      react(),
      nxCopyAssetsPlugin(['*.md']),
      // SPA route fallback: emit per-route index.html copies so GitHub Pages
      // returns 200 for deep-linked routes instead of 404. LS-4841.
      ...(isProduction
        ? [
            spaRouteFallbackPlugin({
              routesFile: 'src/app/app.tsx',
            }),
          ]
        : []),
      ...(isDeployBuild && process.env.ROLLBAR_ACCESS_TOKEN
        ? [
            rollbarSourcemapPlugin({
              accessToken: process.env.ROLLBAR_ACCESS_TOKEN,
              version: commitSha,
              publicPath: 'https://legacy-fantasy.com',
              deleteFilesAfterUpload: true,
            }),
          ]
        : []),
      ...(analyzeBundle
        ? [
            visualizer({
              filename: resolve(__dirname, '../../scratch/bundle-report.html'),
              open: !process.env.CI,
              gzipSize: true,
              brotliSize: true,
              template: 'treemap',
            }),
          ]
        : []),
    ],

    // Optimize dependency scanning and exclude React Native completely
    optimizeDeps: {
      include: ['react', 'react-dom', '@apollo/client'],
      exclude: [],
      esbuildOptions: {
        jsx: 'automatic' as const,
        // Define to prevent React Native code processing
        define: {
          'process.env.REACT_NATIVE_VERSION': 'undefined',
          global: 'globalThis',
        },
      },
    },

    esbuild: {
      jsx: 'automatic' as const,
      jsxImportSource: 'react',
    },

    build: {
      outDir: '../../dist/web',
      emptyOutDir: true,
      // Disable Vite's modulePreload polyfill so lazy-chunk CSS is NOT preloaded
      // via `<link rel="preload" as="style" crossOrigin="">`. The polyfill's
      // anonymous-CORS preload links fire onerror in Playwright's Chromium even
      // when the server sends Access-Control-Allow-Origin: * (a known quirk in
      // Chromium's preload implementation vs. same-origin static servers).
      // All browsers that can run this app support native ES-module preloading,
      // so the polyfill is redundant in production as well.
      modulePreload: { polyfill: false },
      // Report compressed size for deploy builds to track bundle growth
      reportCompressedSize:
        isDeployBuild || process.env.NX_VERBOSE_LOGGING === 'true',
      // Enable minification for production and deploy builds
      minify: isProduction ? 'esbuild' : false,
      // Generate sourcemaps for deploy builds to aid debugging.
      // Use 'hidden' for deploys: .map files are generated so Rollbar can
      // upload them, but the //# sourceMappingURL= comment is omitted from
      // the JS bundles so browsers never request the deleted map files
      // (preventing the "Failed to load resource: 404" console errors).
      sourcemap: isDeployBuild ? 'hidden' : false,
      // Vite's chunk size warning is generated independently from Rollup's
      // onwarn — it can only be controlled via this limit. The tamagui-vendor
      // chunk (~1.6 MB: Tamagui + react-native-web + lucide-react) has
      // circular internal deps preventing further splitting. All other
      // chunks are under 500 kB.
      chunkSizeWarningLimit: 1700,
      commonjsOptions: {
        transformMixedEsModules: true,
      },
      rollupOptions: {
        output: {
          manualChunks: isProduction
            ? (id: string) => {
                if (!id.includes('node_modules')) return undefined;
                // React core + Apollo + GraphQL + router (co-located to
                // avoid circular chunk deps between React and Apollo)
                if (
                  /[\\/](react-dom|react[\\/]|scheduler|react-router|@apollo[\\/]client|graphql|zen-observable|optimism|ts-invariant)/.test(
                    id,
                  )
                )
                  return 'react-vendor';
                // Tamagui UI framework + react-native-web shims.
                // lucide-react is included because @tamagui/lucide-icons
                // wraps it — without this, those modules land in the main
                // index chunk instead of the vendor bundle.
                if (
                  /[\\/](tamagui|@tamagui|react-native-web|lucide-react)/.test(
                    id,
                  )
                )
                  return 'tamagui-vendor';
                return undefined;
              }
            : undefined,
        },
      },
    },
    resolve: {
      alias: {
        // Platform-specific component resolution at build time
        __PLATFORM_COMPONENTS__: resolve(
          __dirname,
          '../../lib/shared-components/src/platform-components/web/index.ts',
        ),
        // Add explicit alias for platform components to avoid resolution issues in CI
        'platform-components': resolve(
          __dirname,
          '../../lib/shared-components/src/platform-components/index.ts',
        ),
        // Deduplicate Tamagui packages â€” defense-in-depth alongside the
        // pnpm.overrides in the root package.json. Without this, sub-packages
        // under lib/ could resolve different versions of @tamagui/web and
        // @tamagui/core, causing the Tamagui config set by createTamagui() in
        // one copy to be invisible to getSetting() in another, crashing with
        // "Cannot read properties of null (reading 'settings')".
        '@tamagui/web': resolve(__dirname, '../../node_modules/@tamagui/web'),
        '@tamagui/core': resolve(__dirname, '../../node_modules/@tamagui/core'),
      },
      extensions: [
        '.web.tsx',
        '.web.ts',
        '.web.jsx',
        '.web.js',
        '.tsx',
        '.ts',
        '.jsx',
        '.js',
      ],
    },
    define: {
      // Define globals that Tamagui expects
      'process.env.TAMAGUI_TARGET': JSON.stringify('web'),
      'process.env.NODE_ENV': JSON.stringify(
        process.env.NODE_ENV || 'development',
      ),
      'process.env.PLATFORM': JSON.stringify('web'),
      __DEV__: process.env.NODE_ENV === 'development',

      // Computed build-time values not sourced from .env files — injected via
      // import.meta.env so @legacy-sports/app-config/web can read them statically.
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
      'import.meta.env.VITE_COMMIT_SHA': JSON.stringify(commitSha),
      'import.meta.env.VITE_BUILD_DATE': JSON.stringify(buildDate),
    },
  };
});
