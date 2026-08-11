// libsodium-wrappers is an optional runtime fallback (see secret-set.ts) —
// not a package.json dependency, so its real types are never installed.
// This ambient declaration only lets `import('libsodium-wrappers')` resolve
// for tsc; secret-set.ts casts the awaited value to the concrete shape it
// actually uses.
declare module 'libsodium-wrappers';
