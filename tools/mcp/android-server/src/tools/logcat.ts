import { jsonResult } from '../format.js';
import { getRepoRoot, runCommand } from '../run-command.js';
import { resolveAndroidSdk } from '../android-env.js';
import type { ToolResult } from '../types.js';

export interface LogcatParams {
  tags?: string[];
  sinceClear?: boolean;
  maxLines?: number;
  serial?: string;
}

const DEFAULT_MAX_LINES = 200;

export async function androidLogcat(params: LogcatParams): Promise<ToolResult> {
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
    if (params.sinceClear) {
      await runCommand(adb, [...serialArgs, 'logcat', '-c'], getRepoRoot());
    }

    const args = [...serialArgs, 'logcat', '-d'];
    if (params.tags && params.tags.length > 0) {
      // e.g. ["AndroidRuntime:E", "ReactNativeJS:*"] — silence everything else
      // unless the caller already included a catch-all filter spec.
      args.push(...params.tags);
      if (!params.tags.some((t) => t.startsWith('*:'))) args.push('*:S');
    }

    const output = await runCommand(
      adb,
      args,
      getRepoRoot(),
      undefined,
      false,
      20 * 1024 * 1024,
    );
    const lines = output.split('\n');
    const maxLines = params.maxLines ?? DEFAULT_MAX_LINES;
    const truncated = lines.length > maxLines;
    const kept = truncated ? lines.slice(-maxLines) : lines;
    return jsonResult({ lines: kept, totalLines: lines.length, truncated });
  } catch (err) {
    return jsonResult(
      { error: err instanceof Error ? err.message : String(err) },
      true,
    );
  }
}
