import { afterAll, describe, expect, it } from '@jest/globals';
import { launchChromium } from './launch-chromium.js';

describe('launchChromium', () => {
  let browser: Awaited<ReturnType<typeof launchChromium>> | undefined;

  afterAll(async () => {
    await browser?.close();
  });

  it('launches against whatever chromium build is baked under /opt/pw-browsers, regardless of the pinned revision', async () => {
    browser = await launchChromium();
    expect(browser.isConnected()).toBe(true);
  }, 30_000);
});
