import { continueRender, delayRender, staticFile } from 'remotion';

// The BigShoulders/Literata/RobotoMono families below are variable fonts, so
// a single woff2 per family covers every weight we use (see the font-weight
// ranges below) — no need to vendor one file per weight.
//
// Vendored locally instead of fetching from fonts.gstatic.com at render time
// via @remotion/google-fonts: in a Claude Code Remote (cloud-agent) session,
// Remotion's headless Chromium doesn't trust the CCR egress proxy's TLS
// interception CA, so that live fetch fails with net::ERR_CERT_AUTHORITY_INVALID
// (LS-8751). Vendoring removes the network dependency at build time entirely,
// in every environment, rather than special-casing CCR's proxy trust.
const LOCAL_FONTS: Array<{
  family: string;
  file: string;
  weightRange: string;
}> = [
  {
    family: 'Big Shoulders',
    file: 'fonts/big-shoulders.woff2',
    weightRange: '100 900',
  },
  {
    family: 'Literata',
    file: 'fonts/literata.woff2',
    weightRange: '200 900',
  },
  {
    family: 'Roboto Mono',
    file: 'fonts/roboto-mono.woff2',
    weightRange: '100 700',
  },
];

export const loadLocalFonts = (): void => {
  // Headless-shell page contexts under render concurrency can be slow to
  // service the local static-file request for a font under load; the
  // default 30s delayRender timeout is occasionally too tight here.
  const waitForFonts = delayRender('Loading vendored local fonts', {
    timeoutInMilliseconds: 120_000,
    retries: 2,
  });

  Promise.all(
    LOCAL_FONTS.map(({ family, file, weightRange }) => {
      const fontFace = new FontFace(family, `url(${staticFile(file)})`, {
        weight: weightRange,
      });
      return fontFace.load().then((loaded) => {
        document.fonts.add(loaded);
      });
    }),
  )
    .then(() => continueRender(waitForFonts))
    .catch((err) => {
      throw err;
    });
};
