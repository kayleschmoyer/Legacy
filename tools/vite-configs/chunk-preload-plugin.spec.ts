/**
 * Tests for the chunk-preload Vite plugin.
 *
 * Run with: pnpm exec jest --config tools/vite-configs/jest.config.ts tools/vite-configs/chunk-preload-plugin.spec.ts
 */

import type { OutputBundle } from 'rollup';
import type { ResolvedConfig } from 'vite';
import { chunkPreloadPlugin } from './chunk-preload-plugin';

function resolveConfig(
  plugin: ReturnType<typeof chunkPreloadPlugin>,
  base = '/',
) {
  const config = {
    base,
    logger: { warn: jest.fn() },
  } as unknown as ResolvedConfig;
  const configResolved = plugin.configResolved as (
    config: ResolvedConfig,
  ) => void;
  configResolved(config);
  return config;
}

function getHandler(plugin: ReturnType<typeof chunkPreloadPlugin>) {
  const hook = plugin.transformIndexHtml as {
    order: string;
    handler: (
      html: string,
      ctx: { bundle?: OutputBundle },
    ) => string | { html: string; tags: unknown[] };
  };
  return hook.handler;
}

describe('chunkPreloadPlugin', () => {
  it('declares the expected plugin shape', () => {
    const plugin = chunkPreloadPlugin({
      moduleIdIncludes: 'pages/home/HomePage',
    });
    expect(plugin.name).toBe('chunk-preload');
    expect(plugin.apply).toBe('build');
    expect(typeof plugin.configResolved).toBe('function');
    const hook = plugin.transformIndexHtml as { order: string };
    expect(hook.order).toBe('post');
  });

  it('injects a modulepreload link for the matching chunk', () => {
    const plugin = chunkPreloadPlugin({
      moduleIdIncludes: 'pages/home/HomePage',
    });
    resolveConfig(plugin);
    const handler = getHandler(plugin);
    const bundle = {
      'assets/HomePage-C56NurPT.js': {
        type: 'chunk',
        facadeModuleId: '/repo/apps/web/src/pages/home/HomePage.tsx',
        fileName: 'assets/HomePage-C56NurPT.js',
      },
      'assets/AboutPage-xyz.js': {
        type: 'chunk',
        facadeModuleId: '/repo/apps/web/src/pages/about/AboutPage.tsx',
        fileName: 'assets/AboutPage-xyz.js',
      },
    } as unknown as OutputBundle;

    const result = handler('<html></html>', { bundle });
    expect(result).toEqual({
      html: '<html></html>',
      tags: [
        {
          tag: 'link',
          attrs: {
            rel: 'modulepreload',
            crossorigin: true,
            href: '/assets/HomePage-C56NurPT.js',
          },
          injectTo: 'head',
        },
      ],
    });
  });

  it('respects a non-root base path', () => {
    const plugin = chunkPreloadPlugin({
      moduleIdIncludes: 'pages/home/HomePage',
    });
    resolveConfig(plugin, '/pr-1234/');
    const handler = getHandler(plugin);
    const bundle = {
      'assets/HomePage-abc.js': {
        type: 'chunk',
        facadeModuleId: '/repo/apps/web/src/pages/home/HomePage.tsx',
        fileName: 'assets/HomePage-abc.js',
      },
    } as unknown as OutputBundle;

    const result = handler('<html></html>', { bundle }) as {
      tags: { attrs: { href: string } }[];
    };
    expect(result.tags[0].attrs.href).toBe('/pr-1234/assets/HomePage-abc.js');
  });

  it('leaves html unchanged and warns when no chunk matches', () => {
    const plugin = chunkPreloadPlugin({
      moduleIdIncludes: 'pages/home/HomePage',
    });
    const config = resolveConfig(plugin);
    const handler = getHandler(plugin);
    const bundle = {
      'assets/AboutPage-xyz.js': {
        type: 'chunk',
        facadeModuleId: '/repo/apps/web/src/pages/about/AboutPage.tsx',
        fileName: 'assets/AboutPage-xyz.js',
      },
    } as unknown as OutputBundle;

    const result = handler('<html></html>', { bundle });
    expect(result).toBe('<html></html>');
    expect(config.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('pages/home/HomePage'),
    );
  });

  it('leaves html unchanged when no bundle is present (dev/serve context)', () => {
    const plugin = chunkPreloadPlugin({
      moduleIdIncludes: 'pages/home/HomePage',
    });
    resolveConfig(plugin);
    const handler = getHandler(plugin);
    expect(handler('<html></html>', {})).toBe('<html></html>');
  });
});
