import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { resolve } from 'path';

export default defineConfig(({ mode }) => {
  const platform = process.env.BUILD_PLATFORM || 'web';

  return {
    cacheDir: '../../node_modules/.vite/lib/shared-components',
    root: __dirname,

    plugins: [react(), nxViteTsPaths()],

    // Modern cross-platform configuration
    define: {
      __DEV__: JSON.stringify(process.env.NODE_ENV !== 'production'),
      'process.env.PLATFORM': JSON.stringify(platform),
    },

    resolve: {
      alias: {
        // Platform-specific component resolution at build time
        // Single alias pointing to platform directory index
        __PLATFORM_COMPONENTS__: resolve(
          __dirname,
          `src/platform-components/${platform}/index.ts`
        ),

        // React Native Web compatibility
        'react-native$':
          platform === 'web' ? 'react-native-web' : 'react-native',
        'react-native/Libraries/Components/View/ViewStylePropTypes$':
          'react-native-web/dist/exports/View/ViewStylePropTypes',
        'react-native/Libraries/EventEmitter/RCTDeviceEventEmitter$':
          'react-native-web/dist/vendor/react-native/NativeEventEmitter/RCTDeviceEventEmitter',
        'react-native/Libraries/vendor/emitter/EventEmitter$':
          'react-native-web/dist/vendor/react-native/emitter/EventEmitter',
        'react-native/Libraries/EventEmitter/NativeEventEmitter$':
          'react-native-web/dist/vendor/react-native/NativeEventEmitter',
      },
      extensions: [
        `.${platform}.tsx`,
        `.${platform}.ts`,
        `.${platform}.jsx`,
        `.${platform}.js`,
        '.tsx',
        '.ts',
        '.jsx',
        '.js',
      ],
    },

    // Handle JSX in dependencies based on platform
    optimizeDeps: {
      exclude:
        platform === 'mobile'
          ? ['react-native-table-component', '@expo/vector-icons']
          : [
              'react-native',
              'react-native-table-component',
              '@expo/vector-icons',
            ],
      esbuildOptions: {
        loader: {
          '.js': 'jsx',
        },
        jsx: 'automatic',
      },
    },

    esbuild: {
      jsx: 'automatic',
      jsxImportSource: 'react',
    },

    // Build as a library
    build: {
      emptyOutDir: true,
      outDir: `dist/${platform}`,
      lib: {
        entry: platform === 'web' ? 'src/index.web.ts' : 'src/index.ts',
        name: 'SharedComponents',
        fileName: (format) => `index.${format}.js`,
        formats: ['es', 'cjs'],
      },
      rollupOptions: {
        external: [
          'react',
          'react-dom',
          'react/jsx-runtime',
          ...(platform === 'web'
            ? ['react-native-web']
            : [
                'react-native',
                '@expo/vector-icons',
                'react-native-table-component',
              ]),
          '@tamagui/core',
          '@tamagui/config',
          '@tamagui/animations-react-native',
          '@react-navigation/native',
          '@react-navigation/stack',
          '@react-navigation/drawer',
          '@apollo/client',
          '@react-native-picker/picker',
          'react-router-dom',
          'tamagui',
          // Node.js built-ins that should still be externalized
          'path',
          'fs',
          'os',
          'crypto',
          'url',
          'util',
          'stream',
          'buffer',
          'events',
          'querystring',
          'assert',
          'child_process',
          'cluster',
          'dgram',
          'dns',
          'domain',
          'http',
          'https',
          'net',
          'punycode',
          'readline',
          'repl',
          'string_decoder',
          'sys',
          'timers',
          'tty',
          'vm',
          'zlib',
          // Keep pino external for backward compatibility
          'pino',
        ],
        output: {
          globals: {
            react: 'React',
            'react-dom': 'ReactDOM',
            'react-native': 'ReactNative',
            'react-native-web': 'ReactNativeWeb',
          },
        },
      },
      target: 'es2015',
    },

    test: {
      globals: true,
      cache: {
        dir: '../../node_modules/.vitest',
      },
      environment: 'jsdom',
      include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    },
  };
});
