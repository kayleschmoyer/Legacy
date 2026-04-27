import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DEFAULT_TIMEOUT_MS = 8 * 60 * 1000; // 8 minutes
const SIGKILL_GRACE_MS = 5_000;
const DEFAULT_MODEL = 'codex';
const DEFAULT_BINARY = 'copilot';

/**
 * LLMProvider implementation that delegates to the GitHub Copilot CLI.
 *
 * Spawns: copilot -p <prompt-file> --model <model> --deny-tool write --deny-tool shell
 *
 * Auth: this provider forwards process.env to the Copilot CLI unchanged; CI/callers
 * must export COPILOT_GITHUB_TOKEN before invoking it because no PAT env remapping is
 * performed here.
 */
export class CopilotCLIProvider {
  /**
   * @param {object} [opts]
   * @param {string} [opts.model]     - Model name passed to --model (default: REVIEWER_MODEL env or 'codex')
   * @param {string} [opts.binary]    - Path/name of the copilot CLI binary (default: 'copilot')
   * @param {number} [opts.timeoutMs] - Process timeout in ms (default: REVIEWER_TIMEOUT_MS env or 8 min)
   */
  constructor({ model, binary, timeoutMs } = {}) {
    this.model = model ?? process.env.REVIEWER_MODEL ?? DEFAULT_MODEL;
    this.binary = binary ?? DEFAULT_BINARY;

    const envTimeout = Number(process.env.REVIEWER_TIMEOUT_MS);
    this.timeoutMs =
      timeoutMs ??
      (Number.isFinite(envTimeout) && envTimeout > 0
        ? envTimeout
        : DEFAULT_TIMEOUT_MS);
  }

  /**
   * @param {object} params
   * @param {string} params.system
   * @param {string} params.user
   * @returns {Promise<import('./provider.mjs').ReviewResult>}
   */
  async review({ system, user }) {
    const prompt = `${system}\n\n${user}`;

    // Write prompt to a temp file to avoid OS argument-length limits on large diffs.
    const tmpDir = await mkdtemp(join(tmpdir(), 'copilot-reviewer-'));
    const promptFile = join(tmpDir, 'prompt.txt');
    await writeFile(promptFile, prompt, 'utf8');

    try {
      const text = await this._spawn(promptFile);
      return {
        text,
        usage: {
          inputTokens: 0,
          cachedInputTokens: 0,
          outputTokens: 0,
          costUsd: 0,
        },
      };
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  }

  /**
   * @param {string} promptFile - Path to the file containing the review prompt
   * @returns {Promise<string>} Raw stdout from the Copilot CLI
   */
  _spawn(promptFile) {
    const args = [
      '-p',
      promptFile,
      '--model',
      this.model,
      '--deny-tool',
      'write',
      '--deny-tool',
      'shell',
    ];

    return new Promise((resolve, reject) => {
      let settled = false;
      const settle = (fn, value) => {
        if (settled) return;
        settled = true;
        fn(value);
      };

      const child = spawn(this.binary, args, {
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (chunk) => {
        stdout += chunk;
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk;
      });

      const killTimer = setTimeout(() => {
        child.kill('SIGTERM');
        // Escalate to SIGKILL if process doesn't exit within grace period.
        setTimeout(() => child.kill('SIGKILL'), SIGKILL_GRACE_MS);
        settle(
          reject,
          new Error(`CopilotCLIProvider timed out after ${this.timeoutMs}ms`),
        );
      }, this.timeoutMs);

      child.on('close', (code) => {
        clearTimeout(killTimer);
        if (code !== 0) {
          settle(
            reject,
            new Error(
              `copilot CLI exited with code ${code}${stderr ? `\n${stderr}` : ''}`,
            ),
          );
        } else {
          settle(resolve, stdout);
        }
      });

      child.on('error', (err) => {
        clearTimeout(killTimer);
        settle(
          reject,
          new Error(`Failed to spawn copilot CLI: ${err.message}`),
        );
      });
    });
  }
}
