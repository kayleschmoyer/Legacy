import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { jiraRequest } from '../jira-api.js';
import { searchJql } from '../jql-search.js';

// 5-minute module-scope cache per bucket
const cache = new Map<
  string,
  { key: string; warning: string | null; expiresAt: number }
>();
const TTL_MS = 5 * 60 * 1000;

interface BucketEpicValue {
  key: string;
  updatedAt?: string;
}

/** Jira project-property path for a bucket's current epic pointer. */
function bucketPropertyPath(bucket: string): string {
  return `/rest/api/3/project/LS/properties/bucket.${bucket}`;
}

/**
 * Read a bucket's current epic key directly from the Jira project property.
 * Returns `null` when the property is unset (404) or empty. Uncached — callers
 * that need to react to a freshly-written value (e.g. rollover sync) get the
 * live value, while the cached `getBucketEpic` MCP tool keeps its 5-minute TTL.
 */
export async function readBucketEpicKey(
  bucket: string,
): Promise<string | null> {
  try {
    const result = await jiraRequest<{ value: BucketEpicValue }>({
      method: 'GET',
      path: bucketPropertyPath(bucket),
    });
    return result?.value?.key?.trim() || null;
  } catch (error) {
    // 404 means the property has never been set for this bucket.
    if (error instanceof Error && error.message.includes('(404)')) return null;
    throw error;
  }
}

/**
 * Write a bucket's current epic key to the Jira project property and invalidate
 * the in-process cache so the next `getBucketEpic` read reflects the new value.
 */
export async function writeBucketEpicKey(
  bucket: string,
  epicKey: string,
): Promise<void> {
  await jiraRequest({
    method: 'PUT',
    path: bucketPropertyPath(bucket),
    body: {
      key: epicKey,
      updatedAt: new Date().toISOString(),
    },
  });
  cache.delete(bucket);
}

/**
 * Compare the stored property against the open epics carrying the bucket's
 * `bucket:<name>` label (newest first). Returns a warning when the property
 * points at anything but the newest labelled epic, or when several open epics
 * share the label, so a stale pointer cannot silently misroute tickets
 * (LS-10240). Best-effort: a failed lookup never breaks the read.
 */
async function detectBucketDrift(
  bucket: string,
  key: string,
): Promise<string | null> {
  try {
    const { issues } = await searchJql<Record<string, never>>({
      jql: `project = LS AND issuetype = Epic AND labels = "bucket:${bucket}" AND statusCategory != Done ORDER BY created DESC`,
      fields: ['summary'],
      maxResults: 10,
    });
    const newest = issues?.[0];
    if (!newest) return null;
    if (newest.key !== key) {
      return `Property bucket.${bucket} points to ${key} but the newest open epic labelled bucket:${bucket} is ${newest.key}. Run jira_rollover_sync (mode "sync") to repair.`;
    }
    if (issues.length > 1) {
      return `${issues.length} open epics carry the bucket:${bucket} label (${issues.map((i) => i.key).join(', ')}); only ${key} is current. Run jira_rollover_sync (mode "sync") to close the older ones.`;
    }
    return null;
  } catch {
    return null;
  }
}

export async function getBucketEpic(params: {
  bucket: string;
}): Promise<CallToolResult> {
  const { bucket } = params;
  const now = Date.now();
  const cached = cache.get(bucket);
  if (cached && cached.expiresAt > now) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            bucket,
            key: cached.key,
            cached: true,
            updatedAt: null,
            ...(cached.warning ? { warning: cached.warning } : {}),
          }),
        },
      ],
    };
  }
  try {
    const result = await jiraRequest<{ value: BucketEpicValue }>({
      method: 'GET',
      path: bucketPropertyPath(bucket),
    });
    const key = result?.value?.key?.trim();
    if (!key) throw new Error('Property exists but has no key value');
    const warning = await detectBucketDrift(bucket, key);
    cache.set(bucket, { key, warning, expiresAt: now + TTL_MS });
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            bucket,
            key,
            cached: false,
            updatedAt: result.value.updatedAt ?? null,
            ...(warning ? { warning } : {}),
          }),
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: `Failed to get bucket epic for "${bucket}": ${message}`,
          }),
        },
      ],
    };
  }
}

export async function setBucketEpic(params: {
  bucket: string;
  epicKey: string;
}): Promise<CallToolResult> {
  const { bucket, epicKey } = params;
  const trimmedKey = epicKey.trim();
  if (!trimmedKey) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: `epicKey must be a non-empty string (received: ${JSON.stringify(epicKey)})`,
          }),
        },
      ],
    };
  }
  try {
    await writeBucketEpicKey(bucket, trimmedKey);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ success: true, bucket, key: trimmedKey }),
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: `Failed to set bucket epic for "${bucket}": ${message}`,
          }),
        },
      ],
    };
  }
}
