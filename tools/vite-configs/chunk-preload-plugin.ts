import type { OutputChunk } from 'rollup';
import type { Plugin, ResolvedConfig } from 'vite';

export interface ChunkPreloadPluginOptions {
  /**
   * Substring matched against each emitted chunk's Rollup `facadeModuleId`
   * (the source file whose dynamic `import()` produced that chunk).
   */
  moduleIdIncludes: string;
}

/**
 * Vite plugin that adds a `<link rel="modulepreload">` hint to the built
 * `index.html` for a content-hashed chunk produced by a dynamic `import()`
 * (e.g. a route-level lazy page). Without this, the browser only discovers
 * the chunk after the eager bundle has parsed, executed, and reached the
 * `import()` call — this plugin lets the fetch start in parallel with the
 * eager bundle instead (LS-9424).
 *
 * Does not touch `build.modulePreload` — that setting only controls Vite's
 * automatic polyfill/preload injection for *static* imports of the entry
 * chunk's own dependency graph; this plugin manually preloads a chunk that
 * Vite has no static knowledge is needed at load time.
 *
 * Only runs during `vite build` — dev server serves the chunk on demand.
 */
export function chunkPreloadPlugin(options: ChunkPreloadPluginOptions): Plugin {
  let resolved: ResolvedConfig;
  return {
    name: 'chunk-preload',
    apply: 'build',
    configResolved(config) {
      resolved = config;
    },
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const bundle = ctx.bundle;
        if (!bundle) return html;
        const chunk = Object.values(bundle).find(
          (item): item is OutputChunk =>
            item.type === 'chunk' &&
            !!item.facadeModuleId &&
            item.facadeModuleId.includes(options.moduleIdIncludes),
        );
        if (!chunk) {
          resolved.logger.warn(
            `[chunk-preload] no emitted chunk's facadeModuleId includes "${options.moduleIdIncludes}"; skipping preload hint`,
          );
          return html;
        }
        return {
          html,
          tags: [
            {
              tag: 'link',
              attrs: {
                rel: 'modulepreload',
                crossorigin: true,
                href: `${resolved.base}${chunk.fileName}`,
              },
              injectTo: 'head',
            },
          ],
        };
      },
    },
  };
}
