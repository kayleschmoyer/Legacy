import { prefetchHomePage } from './prefetchHomePage';

jest.mock('../pages/home/HomePage', () => () => null);

describe('prefetchHomePage', () => {
  it('resolves the Home page module without throwing or rejecting', async () => {
    await expect(prefetchHomePage()).resolves.toBeDefined();
  });
});
