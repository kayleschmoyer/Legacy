/**
 * LS-10639: `expo/src/winter` (loaded by jest-expo's setup) installs these
 * globals as lazy getters that `require()` their implementation on first
 * read. Jest 30's environment teardown walks every global to clear mocks,
 * which trips the getters after the module registry is closed and fails the
 * suite with "You are trying to `require` a file outside of the scope of the
 * test code". Reading them here, while requires are still allowed, replaces
 * each getter with its value.
 */
for (const name of [
  'TextDecoder',
  'TextDecoderStream',
  'TextEncoderStream',
  'URL',
  'URLSearchParams',
  'DOMException',
  '__ExpoImportMetaRegistry',
  'structuredClone',
  'fetch',
]) {
  void globalThis[name];
}
