import { existsSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { runCommand, getRepoRoot } from '../run-command.js';
import type { ToolResult } from '../types.js';

export interface ScreenshotUploadParams {
  screenshotPath: string;
}

const RELEASE_TAG = 'agent-screenshots';

/** Allowed file extensions for screenshot uploads. */
const ALLOWED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

/** Directories that must never be uploaded from. */
const BLOCKED_PATH_SEGMENTS = [
  '.env',
  '.ssh',
  '.aws',
  'credentials',
  '.gnupg',
  'secrets',
];

/** Ensure the draft release exists, creating it if needed. */
async function ensureDraftRelease(repoRoot: string): Promise<void> {
  try {
    await runCommand('gh', ['release', 'view', RELEASE_TAG], repoRoot);
  } catch {
    // Release doesn't exist — create it
    await runCommand(
      'gh',
      [
        'release',
        'create',
        RELEASE_TAG,
        '--draft',
        '--title',
        'Agent Screenshots',
        '--notes',
        'Automated screenshots captured by AI agents during PR workflows.',
      ],
      repoRoot,
    );
  }
}

export async function screenshotUpload(
  params: ScreenshotUploadParams,
): Promise<ToolResult> {
  const { screenshotPath } = params;

  if (!existsSync(screenshotPath)) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            error: `File not found: ${screenshotPath}`,
          }),
        },
      ],
      isError: true,
    };
  }

  // Validate file extension — only allow image files
  const ext = screenshotPath
    .slice(screenshotPath.lastIndexOf('.'))
    .toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            error: `Disallowed file type "${ext}". Only image files are permitted: ${[...ALLOWED_EXTENSIONS].join(', ')}`,
          }),
        },
      ],
      isError: true,
    };
  }

  // Validate path — block uploads from sensitive directories
  const normalized = resolve(screenshotPath).replace(/\\/g, '/').toLowerCase();
  const blockedSegment = BLOCKED_PATH_SEGMENTS.find((seg) =>
    normalized.includes(`/${seg}`),
  );
  if (blockedSegment) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            error: `Refusing to upload from sensitive path containing "${blockedSegment}".`,
          }),
        },
      ],
      isError: true,
    };
  }

  const repoRoot = getRepoRoot();
  const filename = basename(screenshotPath);

  try {
    // Ensure draft release exists
    await ensureDraftRelease(repoRoot);

    // Upload the screenshot (--clobber overwrites if same name exists)
    await runCommand(
      'gh',
      ['release', 'upload', RELEASE_TAG, screenshotPath, '--clobber'],
      repoRoot,
    );

    // Get the asset URL from the release
    const releaseJson = await runCommand(
      'gh',
      ['release', 'view', RELEASE_TAG, '--json', 'assets'],
      repoRoot,
    );

    const release = JSON.parse(releaseJson) as {
      assets: Array<{ name: string; url: string }>;
    };
    const asset = release.assets.find((a) => a.name === filename);

    if (!asset) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              ok: false,
              error: `Upload succeeded but could not find asset URL for ${filename}`,
              remedy:
                'The file was uploaded. Try browser_screenshot_upload again or check gh release view agent-screenshots.',
            }),
          },
        ],
        isError: true,
      };
    }

    const markdownImage = `![${filename.replace('.png', '')}](${asset.url})`;

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: true,
            filename,
            url: asset.url,
            markdown: markdownImage,
          }),
        },
      ],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            error: `Upload failed: ${message}`,
            remedy:
              'Ensure gh CLI is authenticated (gh auth status) and has repo scope.',
          }),
        },
      ],
      isError: true,
    };
  }
}
