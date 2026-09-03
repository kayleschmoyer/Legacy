import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { jsonResult, minifiedJson } from '../format.js';
import { getRepoRoot, runCommandBuffer, TimeoutError } from '../run-command.js';
import { resolveAndroidSdk } from '../android-env.js';
import type { ToolResult } from '../types.js';

export interface ScreenshotParams {
  outputPath?: string;
  serial?: string;
}

/** Format a TimeoutError's message, including any captured partial stderr output. */
export function formatTimeoutError(err: TimeoutError): string {
  return `${err.message}${err.partialOutput ? `. Partial output: ${err.partialOutput}` : ''}`;
}

export async function androidScreenshot(
  params: ScreenshotParams,
): Promise<ToolResult> {
  let adb: string;
  try {
    ({ adb } = resolveAndroidSdk());
  } catch (err) {
    return jsonResult(
      { error: err instanceof Error ? err.message : String(err) },
      true,
    );
  }
  const serialArgs = params.serial ? ['-s', params.serial] : [];

  try {
    const buffer = await runCommandBuffer(
      adb,
      [...serialArgs, 'exec-out', 'screencap', '-p'],
      getRepoRoot(),
    );
    if (buffer.length === 0) {
      return jsonResult(
        {
          error:
            'adb exec-out screencap -p returned no data — is a device connected? Call android_device({ action: "list" }) first.',
        },
        true,
      );
    }

    const filePath =
      params.outputPath ??
      join(getRepoRoot(), '.screenshots', `android-${Date.now()}.png`);
    const dir = dirname(filePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(filePath, buffer);

    return {
      content: [
        { type: 'text', text: minifiedJson({ ok: true, path: filePath }) },
        {
          type: 'image',
          data: buffer.toString('base64'),
          mimeType: 'image/png',
        },
      ],
    };
  } catch (err) {
    if (err instanceof TimeoutError) {
      return jsonResult({ error: formatTimeoutError(err) }, true);
    }
    return jsonResult(
      { error: err instanceof Error ? err.message : String(err) },
      true,
    );
  }
}
