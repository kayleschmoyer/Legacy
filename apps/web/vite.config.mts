/// <reference types='vitest' />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';
import { resolve } from 'path';
import { tamaguiPlugin } from '@tamagui/vite-plugin';
import reactNativeWeb from 'vite-plugin-react-native-web';

export default defineConfig(async () => {
  return {
    root: __dirname,
    cacheDir: '../../node_modules/.vite/web',
    base: process.env.NODE_ENV === 'production' ? '/legacy-sports/' : '/',
    // Help Tamagui find the correct paths
    publicDir: 'public',
    server: {
      port: 4200,
      host: 'localhost',
    },
    preview: {
      port: 4200,
      host: 'localhost',
    },
    plugins: [
      reactNativeWeb(),
      tamaguiPlugin({
        config: '../../lib/shared-components/src/tamagui.config.web.ts',
        platform: 'web',
        // Disable extraction in development to avoid issues
        disableExtraction: process.env.NODE_ENV === 'development',
        // Enable tree shaking
        useReactNativeWebLite: false,
      }),
      react(),
      nxViteTsPaths(),
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
      reportCompressedSize: true,
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
    },
  };
});
