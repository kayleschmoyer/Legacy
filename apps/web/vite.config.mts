/// <reference types='vitest' />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';
import { resolve } from 'path';
import { tamaguiPlugin } from '@tamagui/vite-plugin';
import reactNativeWeb from 'vite-plugin-react-native-web';
import { execSync } from 'child_process';
import { rollbarSourcemapPlugin } from '../../tools/vite-configs';

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

  console.log(`🔧 Build Configuration:
    - Mode: ${mode}
    - Is Deploy Build: ${isDeployBuild}
    - Is Production: ${isProduction}
    - App Version: ${appVersion}
    - Commit SHA: ${commitSha}
  `);

  // Always use root path since we have a custom domain
  const basePath = '/';

  console.log(`📍 Base Path: ${basePath}`);

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
    },
    preview: {
      port: 4200,
      host: 'localhost',
      strictPort: true,
    },
    plugins: [
      // Load TS paths first to ensure proper resolution
      nxViteTsPaths(),
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
      // Report compressed size for deploy builds to track bundle growth
      reportCompressedSize:
        isDeployBuild || process.env.NX_VERBOSE_LOGGING === 'true',
      // Enable minification for production and deploy builds
      minify: isProduction ? 'esbuild' : false,
      // Generate sourcemaps for deploy builds to aid debugging
      sourcemap: isDeployBuild ? true : false,
      commonjsOptions: {
        transformMixedEsModules: true,
      },
      rollupOptions: {
        output: {
          // Better chunk splitting for deploy builds
          manualChunks: isDeployBuild
            ? {
                'react-vendor': ['react', 'react-dom'],
                'apollo-vendor': ['@apollo/client'],
                'tamagui-vendor': ['tamagui', '@tamagui/core'],
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

      // Define environment variables for browser access
      'import.meta.env.VITE_OAUTH_PROXY_URL': JSON.stringify(
        env.VITE_OAUTH_PROXY_URL || 'http://localhost:5001',
      ),
      'import.meta.env.VITE_GOOGLE_CLIENT_ID': JSON.stringify(
        env.VITE_GOOGLE_CLIENT_ID || 'placeholder-google-client-id',
      ),
      'import.meta.env.VITE_GRAPHQL_HOST': JSON.stringify(
        env.VITE_GRAPHQL_HOST || 'http://localhost:5000/graphql',
      ),
      'import.meta.env.VITE_WEBSOCKET_URL': JSON.stringify(
        env.VITE_WEBSOCKET_URL || '',
      ),
      // Build information for About page
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
      'import.meta.env.VITE_COMMIT_SHA': JSON.stringify(commitSha),
      'import.meta.env.VITE_BUILD_DATE': JSON.stringify(buildDate),
    },
  };
});
