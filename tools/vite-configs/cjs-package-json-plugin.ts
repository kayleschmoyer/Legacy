import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

/**
 * When Vite SSR-builds a workspace package whose source `package.json` contains
 * `"type": "module"`, it copies that file into the output `dist/` as-is.
 * Combined with a `format: 'cjs'` Rollup output (which emits `exports.x = ...`),
 * Node's loader on the Lambda runtime sees `dist/package.json` declare ESM and
 * refuses to load `index.js` as CJS — the cold start crashes with
 * `ReferenceError: exports is not defined in ES module scope`.
 *
 * This plugin overwrites the copied `dist/package.json` with one that declares
 * `"type": "commonjs"`, so the deployed bundle is internally consistent. The
 * source `package.json` is left untouched so the local stdio servers (which
 * import the same source via tsx) keep their ESM behavior.
 */
export function cjsPackageJsonPlugin(outDir = 'dist'): Plugin {
  return {
    name: 'legacy-sports:cjs-package-json',
    apply: 'build',
    writeBundle() {
      const target = resolve(process.cwd(), outDir, 'package.json');
      writeFileSync(
        target,
        `${JSON.stringify({ type: 'commonjs' }, null, 2)}\n`,
      );
    },
  };
}
