// Audio assets are bundled by Vite (web) and Metro (native) as an asset URL /
// module id. `@nx/react/typings/image.d.ts` covers images only, so declare the
// audio formats the shared components import (LS-10195). apps/web already gets
// these from `vite/client`; apps/app declares the same in its own types dir
// because TypeScript resolves the web `.tsx` of a platform pair in every
// compilation.
declare module '*.wav' {
  const src: string;
  export default src;
}
