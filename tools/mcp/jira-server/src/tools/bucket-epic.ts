import { jiraRequest } from '../jira-api.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

// 5-minute module-scope cache per bucket
const cache = new Map<string, { key: string; expiresAt: number }>();
const TTL_MS = 5 * 60 * 1000;

interface BucketEpicValue {
  key: string;
  updatedAt?: string;
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
      path: `/rest/api/3/project/LS/properties/bucket.${bucket}`,
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
    await jiraRequest({
      method: 'PUT',
      path: `/rest/api/3/project/LS/properties/bucket.${bucket}`,
      body: {
        key: trimmedKey,
        updatedAt: new Date().toISOString(),
      },
    });
    cache.delete(bucket); // clear cache so next read reflects the new value
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
