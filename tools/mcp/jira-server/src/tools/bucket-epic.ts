import { jiraRequest } from '../jira-api.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

// 5-minute module-scope cache per bucket
const cache = new Map<string, { key: string; expiresAt: number }>();
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
    cache.set(bucket, { key, expiresAt: now + TTL_MS });
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
