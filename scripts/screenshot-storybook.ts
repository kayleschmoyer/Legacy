import { chromium } from 'playwright';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

type CliOptions = {
  storybookUrl: string;
  outDir: string;
  width: number;
  height: number;
  stories: string[];
};

const DEFAULT_STORIES = [
  'design-system-theme-gallery--explorer',
  'design-system-theme-gallery--palette-grid-light',
  'design-system-theme-gallery--palette-grid-dark',
];

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    storybookUrl: 'http://localhost:6009',
    outDir: path.resolve(process.cwd(), 'tmp/ui-previews'),
    width: 1200,
    height: 800,
    stories: [...DEFAULT_STORIES],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--storybookUrl' && argv[index + 1]) {
      options.storybookUrl = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--outDir' && argv[index + 1]) {
      options.outDir = path.resolve(process.cwd(), argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === '--width' && argv[index + 1]) {
      options.width = Number(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === '--height' && argv[index + 1]) {
      options.height = Number(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === '--story' && argv[index + 1]) {
      options.stories.push(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === '--stories' && argv[index + 1]) {
      options.stories = argv[index + 1]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      index += 1;
      continue;
    }
  }

  if (!Number.isFinite(options.width) || options.width <= 0) {
    throw new Error('Invalid --width');
  }

  if (!Number.isFinite(options.height) || options.height <= 0) {
    throw new Error('Invalid --height');
  }

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  await fs.mkdir(options.outDir, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: options.width, height: options.height },
  });

  const results: Array<{ storyId: string; file: string }> = [];

  try {
    for (const storyId of options.stories) {
      const url = new URL('/iframe.html', options.storybookUrl);
      url.searchParams.set('id', storyId);
      url.searchParams.set('viewMode', 'story');

      const file = path.join(options.outDir, `${storyId}.png`);

      // Storybook iframes can take a beat for fonts/layout.
      await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#storybook-root', { timeout: 30_000 });
      await page.waitForTimeout(300);

      await page.screenshot({ path: file, fullPage: true });
      results.push({ storyId, file });

      // eslint-disable-next-line no-console
      console.log(`✔ ${storyId} -> ${file}`);
    }
  } finally {
    await page.close();
    await browser.close();
  }

  // eslint-disable-next-line no-console
  console.log(
    `\nDone. Wrote ${results.length} screenshot(s) to ${options.outDir}`,
  );
}

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});
