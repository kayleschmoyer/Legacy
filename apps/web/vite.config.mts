/// <reference types='vitest' />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';
import { resolve } from 'path';
import { tamaguiPlugin } from '@tamagui/vite-plugin';
import reactNativeWeb from 'vite-plugin-react-native-web';
import { execSync } from 'child_process';

export default defineConfig(async ({ mode }) => {
  // Load environment variables from workspace root and merge with process.env
  const env = loadEnv(mode, resolve(__dirname, '../../'), '');

  // Merge environment variables into process.env so Vite can pick them up
  Object.assign(process.env, env);

  // Get build information - fallback to local git if not in CI
  const commitSha = process.env.VITE_COMMIT_SHA || 
    process.env.GITHUB_SHA ||
    (() => {
      try {
        return execSync('git rev-parse --short HEAD').toString().trim();
      } catch {
        return 'dev';
      }
    })();
  
  const appVersion = process.env.VITE_APP_VERSION || '0.0.0';
  const buildDate = new Date().toISOString();
  return {
    root: __dirname,
    cacheDir: '../../node_modules/.vite/web',
    base: process.env.NODE_ENV === 'production' ? '/legacy-sports/' : '/',
    // Read environment variables from workspace root
    envDir: resolve(__dirname, '../../'),
    // Help Tamagui find the correct paths
    publicDir: 'public',
    // Define environment variables explicitly

    server: {
      port: 4200,
      host: 'localhost',
    },
    preview: {
      port: 4200,
      host: 'localhost',
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
      reportCompressedSize: process.env.NX_VERBOSE_LOGGING === 'true',
      commonjsOptions: {
        transformMixedEsModules: true,
      },
      rollupOptions: {},
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
      // Build information for About page
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
      'import.meta.env.VITE_COMMIT_SHA': JSON.stringify(commitSha),
      'import.meta.env.VITE_BUILD_DATE': JSON.stringify(buildDate),
    },
  };
});
