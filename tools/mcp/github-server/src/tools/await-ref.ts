import { minifiedJson } from '@legacy-sports/mcp-format';
import { getRepoOwnerName } from '../auth.js';
import { githubRest } from '../github-api.js';
import type { ToolResult } from '../types.js';

// Hard per-call ceiling: cloud sessions kill any MCP call at ~60s (transport
// timeout). Longer waits are re-armed by the caller re-invoking this tool.
const MAX_WAIT_SECONDS = 55;
const POLL_INTERVAL_MS = 5000;

export interface AwaitRefParams {
  ref: string;
  changedFrom?: string;
  deleted?: boolean;
  maxWaitSeconds?: number;
}

interface GitRefResponse {
  object: { sha: string };
}

/** Accepts "refs/heads/main", "heads/main", or bare "main"; defaults to a branch ref. */
function normalizeRef(ref: string): string {
  let normalized = ref.trim();
  if (normalized.startsWith('refs/')) {
    normalized = normalized.slice('refs/'.length);
  }
  if (!normalized.startsWith('heads/') && !normalized.startsWith('tags/')) {
    normalized = `heads/${normalized}`;
  }
  return normalized;
}

/** A ref is at its awaited terminal state once deleted, or once its SHA has moved off the baseline. */
function isTerminal(sha: string | null, params: AwaitRefParams): boolean {
  if (sha === null) return true;
  if (params.deleted) return false;
  if (params.changedFrom !== undefined) return sha !== params.changedFrom;
  return false;
}

export function awaitRefHint(
  normalizedRef: string,
  params: AwaitRefParams,
): string {
  return (
    `Ref "${normalizedRef}" has not reached the awaited state yet. Call ` +
    `github_await_ref(${minifiedJson({
      ref: params.ref,
      changedFrom: params.changedFrom,
      deleted: params.deleted,
    })}) to continue waiting (each call waits up to ${MAX_WAIT_SECONDS}s and ` +
    'returns a status snapshot — never an error while the condition is unmet).'
  );
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Resolves the ref's current SHA, or null if the ref does not exist (404). */
async function getRefSha(
  owner: string,
  name: string,
  normalizedRef: string,
): Promise<string | null> {
  try {
    const data = await githubRest<GitRefResponse>({
      method: 'GET',
      path: `/repos/${owner}/${name}/git/ref/${normalizedRef}`,
    });
    return data.object.sha;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/\b404\b/.test(msg)) return null;
    throw err;
  }
}

/**
 * Bounded wait for a git ref to change SHA or be deleted. Transport-safe
 * replacement for `git ls-remote | sleep` polling loops: each call blocks at
 * most MAX_WAIT_SECONDS and returns a { status: "unchanged" } snapshot (not an
 * error) if the awaited condition hasn't occurred, so the caller re-arms with
 * another call instead of losing an in-flight wait to the MCP transport
 * timeout.
 */
export async function awaitRef(params: AwaitRefParams): Promise<ToolResult> {
  const maxWaitSeconds = Math.min(
    params.maxWaitSeconds ?? MAX_WAIT_SECONDS,
    MAX_WAIT_SECONDS,
  );
  const deadlineMs = Date.now() + maxWaitSeconds * 1000;
  const normalizedRef = normalizeRef(params.ref);

  try {
    const repo = await getRepoOwnerName();
    let sha = await getRefSha(repo.owner, repo.name, normalizedRef);

    while (!isTerminal(sha, params) && Date.now() < deadlineMs) {
      await sleep(
        Math.min(POLL_INTERVAL_MS, Math.max(deadlineMs - Date.now(), 1)),
      );
      try {
        sha = await getRefSha(repo.owner, repo.name, normalizedRef);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // 401/403 are fatal (bad token, no access) — propagate immediately.
        if (/\b(401|403)\b/.test(msg)) throw err;
        process.stderr.write(
          `[github_await_ref] transient error polling ${normalizedRef}: ${msg}\n`,
        );
      }
    }

    if (sha === null) {
      return {
        content: [
          {
            type: 'text',
            text: minifiedJson({
              status: 'deleted',
              sha: null,
              ref: normalizedRef,
            }),
          },
        ],
      };
    }

    if (params.changedFrom !== undefined && sha !== params.changedFrom) {
      return {
        content: [
          {
            type: 'text',
            text: minifiedJson({ status: 'changed', sha, ref: normalizedRef }),
          },
        ],
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: minifiedJson({
            status: 'unchanged',
            sha,
            ref: normalizedRef,
            hint: awaitRefHint(normalizedRef, params),
          }),
        },
      ],
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      isError: true,
      content: [
        { type: 'text', text: `Failed to await ref "${params.ref}": ${msg}` },
      ],
    };
  }
}
