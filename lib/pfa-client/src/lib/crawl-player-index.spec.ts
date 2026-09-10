import {
  buildPlayerIndexUrls,
  crawlPlayerIndex,
  PFA_BASE_URL,
} from './crawl-player-index';
import { PfaRateLimiter } from './RateLimiter';

describe('buildPlayerIndexUrls', () => {
  it('builds all 78 player-index page URLs (3 leagues x 26 letters)', () => {
    const urls = buildPlayerIndexUrls();
    expect(urls).toHaveLength(78);
    expect(urls[0]).toBe(`${PFA_BASE_URL}/nflplayers-a.html`);
    expect(urls).toContain(`${PFA_BASE_URL}/aflplayers-z.html`);
    expect(urls).toContain(`${PFA_BASE_URL}/aafcplayers-m.html`);
    expect(new Set(urls).size).toBe(78);
  });
});

function fakePlayerIndexHtml(name: string, pfaId: string, college: string) {
  return `<table><tr><td><a href="/players/${name[0].toLowerCase()}/${pfaId}.html">${name}</a> - ${college}</td></tr></table>`;
}

// No live network calls — fetch is fully mocked, per the package's
// established convention (RateLimiter.spec.ts).
describe('crawlPlayerIndex', () => {
  it('aggregates entries across every page and never calls the network without rate-limiting', async () => {
    const urls = [
      `${PFA_BASE_URL}/nflplayers-a.html`,
      `${PFA_BASE_URL}/nflplayers-b.html`,
    ];
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: () =>
          Promise.resolve(
            fakePlayerIndexHtml('Adam Anderson', 'ande00100', 'Auburn'),
          ),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: () =>
          Promise.resolve(
            fakePlayerIndexHtml('Bob Baker', 'bake00100', 'Baylor'),
          ),
      });

    const waitForTurn = jest.fn().mockResolvedValue(undefined);
    const rateLimiter = { waitForTurn } as unknown as PfaRateLimiter;

    const result = await crawlPlayerIndex({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      rateLimiter,
      urls,
    });

    expect(result.entries).toHaveLength(2);
    expect(result.entries.map((e) => e.pfaId)).toEqual([
      'ande00100',
      'bake00100',
    ]);
    expect(result.errors).toHaveLength(0);
    expect(waitForTurn).toHaveBeenCalledTimes(2);
  });

  it('records a page error and continues crawling the rest on a non-ok response', async () => {
    const urls = [
      `${PFA_BASE_URL}/nflplayers-a.html`,
      `${PFA_BASE_URL}/nflplayers-b.html`,
    ];
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({
        ok: true,
        text: () =>
          Promise.resolve(
            fakePlayerIndexHtml('Bob Baker', 'bake00100', 'Baylor'),
          ),
      });

    const result = await crawlPlayerIndex({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      rateLimiter: {
        waitForTurn: jest.fn().mockResolvedValue(undefined),
      } as unknown as PfaRateLimiter,
      urls,
    });

    expect(result.entries).toHaveLength(1);
    expect(result.errors).toEqual([{ url: urls[0], message: 'HTTP 500' }]);
  });

  it('records a page error and continues crawling when fetch throws', async () => {
    const urls = [`${PFA_BASE_URL}/nflplayers-a.html`];
    const fetchImpl = jest.fn().mockRejectedValue(new Error('network down'));

    const result = await crawlPlayerIndex({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      rateLimiter: {
        waitForTurn: jest.fn().mockResolvedValue(undefined),
      } as unknown as PfaRateLimiter,
      urls,
    });

    expect(result.entries).toHaveLength(0);
    expect(result.errors).toEqual([{ url: urls[0], message: 'network down' }]);
  });

  it('records a page error when a page parses to zero entries', async () => {
    const urls = [`${PFA_BASE_URL}/nflplayers-a.html`];
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('<table></table>'),
    });

    const result = await crawlPlayerIndex({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      rateLimiter: {
        waitForTurn: jest.fn().mockResolvedValue(undefined),
      } as unknown as PfaRateLimiter,
      urls,
    });

    expect(result.entries).toHaveLength(0);
    expect(result.errors).toEqual([
      { url: urls[0], message: 'parsed zero entries' },
    ]);
  });
});
