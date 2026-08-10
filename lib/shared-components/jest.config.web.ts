module.exports = {
  coverageDirectory: '../../coverage/lib/shared-components/web',
  displayName: 'shared-components:web',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  moduleNameMapper: {
    '\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$':
      'identity-obj-proxy',
    '^__PLATFORM_COMPONENTS__$': '<rootDir>/src/platform-components/web',
    '^@legacy-sports/logging$': '<rootDir>/../../lib/logging/src',
    '^@legacy-sports/(.*)$': '<rootDir>/../../lib/$1/src',
    // Apollo Client 4.x exports @apollo/client/react with nested export conditions
    // that Jest's resolver does not recurse into, causing it to fall through to the
    // ESM bundle which cannot load in Jest's CJS context. Map directly to the CJS build.
    '^@apollo/client/react$':
      '<rootDir>/../../node_modules/@apollo/client/__cjs/react/index.cjs',
    '^@apollo/client/testing/react$':
      '<rootDir>/../../node_modules/@apollo/client/__cjs/testing/react/index.cjs',
    '^@apollo/client/testing$':
      '<rootDir>/../../node_modules/@apollo/client/__cjs/testing/index.cjs',
    // Apollo Client 4.x: root package resolves to core only in CJS; merge
    // react hooks so generated files (`import * as Apollo from '@apollo/client'`)
    // can find Apollo.useQuery, Apollo.useLazyQuery, etc.
    '^@apollo/client$': '<rootDir>/jest-apollo-shim.cjs',
  },
  setupFilesAfterEnv: ['<rootDir>/jest-setup-web.js'],
  testEnvironment: 'jsdom',
  testEnvironmentOptions: {
    // Apollo Client 4.x ships as "type":"module". jest's jsdom defaults to the
    // 'browser' export condition, which resolves @apollo/client subpath exports
    // to ESM files that can't be required in jest's CJS context. Adding 'require'
    // ensures jest selects the CJS bundles (e.g. __cjs/react/index.cjs).
    customExportConditions: ['browser', 'require', 'default', 'node'],
  },
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': [
      'babel-jest',
      {
        configFile: __dirname + '/.babelrc',
      },
    ],
  },
  transformIgnorePatterns: [
    'node_modules/(?!(@tamagui|tamagui|react-native-svg|@react-native-google-signin)/)',
  ],
  // Mobile-only regression test (LS-8852) — asserts native Modal-mount
  // behavior that is only true when Platform.OS !== 'web'; this web project
  // resolves the real 'web' platform-components module, so the assertion is
  // correctly false here. Belongs to shared-components:mobile only.
  testPathIgnorePatterns: [
    '/node_modules/',
    '/src/features/leagues/ProposeTradeDialogNativeModal.spec.tsx',
    // Mobile-only regression test (LS-9180) — asserts that a bare
    // `@legacy-sports/utils` import resolves through `index.native.ts`
    // (`getDbOptions`, which the web barrel doesn't export at all). This web
    // project's `moduleFileExtensions` has no native.ts entry, so the
    // assertion is correctly false here. Belongs to
    // shared-components:mobile only.
    '/src/nativeModuleResolution.native.spec.ts',
  ],
  testRegex: '/src/.*\\.spec\\.(ts|tsx|js)$',
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts', '!src/index.ts'],
};
