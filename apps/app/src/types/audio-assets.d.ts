// Mirrors lib/shared-components/src/types/audio-assets.d.ts: TypeScript resolves
// the web `.tsx` of a platform pair (TouchdownHorn, LS-10195) in the app
// compilation, and it imports a `.wav`.
declare module '*.wav' {
  const src: string;
  export default src;
}
