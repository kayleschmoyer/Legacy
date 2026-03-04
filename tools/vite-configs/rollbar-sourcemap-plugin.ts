import { readdirSync, readFileSync, statSync, unlinkSync } from 'node:fs';
import { join, basename, resolve } from 'node:path';
import type { Plugin, ResolvedConfig } from 'vite';

export interface RollbarSourcemapPluginOptions {
  /**
   * Rollbar server-side write access token.
   * Uses ROLLBAR_ACCESS_TOKEN env var if not provided explicitly.
   */
  accessToken: string;
  /**
   * Code version string (e.g. git commit SHA, semver tag).
   * Must match the `code_version` used to initialise Rollbar at runtime.
   */
  version: string;
  /**
   * Base URL that the minified JS files are served from.
   * - Web:    'https://legacy-fantasy.com'
   * - Lambda: 'app://lambda-<name>'
   *
   * Each .map file is uploaded with minified_url = `${publicPath}/<filename.js>`.
   */
  publicPath: string;
  /**
   * When true, delete .map files from the output directory after a successful
   * upload. Recommended for the web app (avoids shipping maps to the browser);
   * leave false for lambdas so the package still contains them.
   * @default false
   */
  deleteFilesAfterUpload?: boolean;
}

const ROLLBAR_SOURCEMAP_URL = 'https://api.rollbar.com/api/1/sourcemap';

/** Recursively collect every *.map file under `dir`. */
function findMapFiles(dir: string): string[] {
  const results: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return results;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...findMapFiles(full));
    } else if (entry.endsWith('.map')) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Vite plugin that uploads sourcemaps to Rollbar after a production build.
 *
 * @example
 * // Lambda vite.config.mts
 * import { rollbarSourcemapPlugin } from '../../tools/vite-configs';
 *
 * plugins: [
 *   nxViteTsPaths(),
 *   ...(isProduction && process.env.ROLLBAR_ACCESS_TOKEN
 *     ? [rollbarSourcemapPlugin({ ... })]
 *     : []),
 * ]
 */
export function rollbarSourcemapPlugin(
  options: RollbarSourcemapPluginOptions,
): Plugin {
  let resolvedConfig: ResolvedConfig;

  return {
    name: 'rollbar-sourcemap-upload',
    apply: 'build',

    configResolved(cfg) {
      resolvedConfig = cfg;
    },

    async closeBundle() {
      const { accessToken, version, publicPath, deleteFilesAfterUpload } =
        options;

      if (!accessToken) {
        resolvedConfig.logger.warn(
          '[rollbar] Skipping sourcemap upload: accessToken is empty.',
        );
        return;
      }

      const outDir = resolve(
        resolvedConfig.root,
        resolvedConfig.build.outDir ?? 'dist',
      );

      const mapFiles = findMapFiles(outDir);

      if (mapFiles.length === 0) {
        resolvedConfig.logger.info(
          '[rollbar] No .map files found — skipping upload.',
        );
        return;
      }

      resolvedConfig.logger.info(
        `[rollbar] Uploading ${mapFiles.length} sourcemap(s) to Rollbar (version: ${version})...`,
      );

      let uploaded = 0;
      let failed = 0;

      for (const mapFile of mapFiles) {
        // Derive the minified JS filename from the map filename
        // e.g. "index.js.map" → "index.js", "assets/app-abc123.js.map" → "assets/app-abc123.js"
        const relPath = mapFile
          .slice(outDir.length)
          .replace(/\\/g, '/')
          .replace(/^\//, '');
        const jsRelPath = relPath.endsWith('.map')
          ? relPath.slice(0, -4)
          : relPath;
        const minifiedUrl = `${publicPath.replace(/\/$/, '')}/${jsRelPath}`;

        const formData = new FormData();
        formData.append('access_token', accessToken);
        formData.append('version', version);
        formData.append('minified_url', minifiedUrl);
        formData.append(
          'source_map',
          new Blob([readFileSync(mapFile)], { type: 'application/json' }),
          basename(mapFile),
        );

        try {
          const response = await fetch(ROLLBAR_SOURCEMAP_URL, {
            method: 'POST',
            body: formData,
          });

          if (!response.ok) {
            const body = await response.text().catch(() => '');
            resolvedConfig.logger.warn(
              `[rollbar] ✗ Failed to upload ${relPath}: HTTP ${response.status} ${body}`,
            );
            failed++;
          } else {
            resolvedConfig.logger.info(
              `[rollbar] ✓ Uploaded ${relPath} → ${minifiedUrl}`,
            );
            uploaded++;

            if (deleteFilesAfterUpload) {
              try {
                unlinkSync(mapFile);
              } catch {
                resolvedConfig.logger.warn(
                  `[rollbar] Could not delete ${mapFile} after upload.`,
                );
              }
            }
          }
        } catch (err) {
          resolvedConfig.logger.warn(
            `[rollbar] ✗ Network error uploading ${relPath}: ${String(err)}`,
          );
          failed++;
        }
      }

      resolvedConfig.logger.info(
        `[rollbar] Done — ${uploaded} uploaded, ${failed} failed.`,
      );
    },
  };
}
