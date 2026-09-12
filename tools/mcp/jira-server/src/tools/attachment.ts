import { minifiedJson } from '@legacy-sports/mcp-format';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { jiraRequest, jiraRequestBinary } from '../jira-api.js';

/** Attachment metadata as surfaced to agents (a pruned Jira attachment record). */
export interface AttachmentMeta {
  [field: string]: unknown;
  id: string;
  filename: string;
  mimeType: string;
  /** Size in bytes, as reported by Jira. */
  size: number;
  created: string;
  author: string;
}

/** Columns rendered for the attachment table in the markdown card. */
export const ATTACHMENT_COLUMNS = [
  'id',
  'filename',
  'mimeType',
  'size',
  'created',
] as const;

/**
 * Largest payload returned inline as a base64 image block. Base64 inflates
 * bytes by ~4/3, so 4 MiB of PNG is ~5.5 MiB of transport — already a very
 * large single tool response. Oversized images fall back to Jira's thumbnail.
 */
const MAX_INLINE_BYTES = 4 * 1024 * 1024;

/** Text attachments are decoded, but truncated so one file can't blow the budget. */
const MAX_TEXT_CHARS = 20_000;

const IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
]);

const TEXT_MIME_TYPES = new Set([
  'text/plain',
  'text/csv',
  'text/markdown',
  'text/html',
  'text/xml',
  'application/json',
  'application/xml',
  'application/x-yaml',
  'text/yaml',
]);

interface JiraAttachmentRecord {
  id: string | number;
  filename: string;
  mimeType?: string;
  size?: number;
  created: string;
  author?: { displayName?: string };
}

/** Fetch the attachment metadata attached to one issue. */
export async function fetchAttachments(key: string): Promise<AttachmentMeta[]> {
  const issue = await jiraRequest<{
    fields: { attachment?: JiraAttachmentRecord[] };
  }>({
    method: 'GET',
    path: `/rest/api/3/issue/${key}`,
    query: { fields: 'attachment' },
  });

  return (issue.fields.attachment ?? []).map((a) => ({
    id: String(a.id),
    filename: a.filename,
    mimeType: a.mimeType ?? 'application/octet-stream',
    size: a.size ?? 0,
    created: a.created,
    author: a.author?.displayName ?? '',
  }));
}

/**
 * Resolve a caller-supplied selector to one attachment on the issue.
 *
 * Accepted forms, in order: exact attachment id, exact filename, `"latest"`
 * (most recently created attachment), case-insensitive filename match.
 */
export function resolveAttachment(
  attachments: AttachmentMeta[],
  selector: string,
): AttachmentMeta | undefined {
  const wanted = selector.trim();
  if (attachments.length === 0) return undefined;

  const byId = attachments.find((a) => a.id === wanted);
  if (byId) return byId;

  const byName = attachments.find((a) => a.filename === wanted);
  if (byName) return byName;

  if (wanted.toLowerCase() === 'latest') {
    return [...attachments].sort((a, b) =>
      a.created < b.created ? 1 : a.created > b.created ? -1 : 0,
    )[0];
  }

  const lowered = wanted.toLowerCase();
  return attachments.find((a) => a.filename.toLowerCase() === lowered);
}

function errorResult(text: string): CallToolResult {
  return { isError: true, content: [{ type: 'text', text }] };
}

/**
 * Fetch one attachment's bytes and return them in a form the agent can read.
 *
 * - Images come back as an inline `image` content block (base64), preceded by a
 *   text block carrying the attachment metadata. Images above
 *   `MAX_INLINE_BYTES` are downgraded to Jira's own thumbnail, and the metadata
 *   block says so.
 * - Text-ish attachments are decoded to UTF-8 and truncated.
 * - Anything else returns metadata plus an explicit "not renderable" error
 *   rather than a useless base64 blob.
 *
 * Fetching the bytes through this server's credentials is the whole point: the
 * `api.atlassian.com` / media-CDN URLs in attachment metadata are unreachable
 * from agent sessions behind an egress proxy (LS-10016).
 */
export async function viewAttachment(
  key: string,
  selector: string,
): Promise<CallToolResult> {
  let attachments: AttachmentMeta[];
  try {
    attachments = await fetchAttachments(key);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return errorResult(`Failed to fetch attachments for ${key}: ${message}`);
  }

  if (attachments.length === 0) {
    return errorResult(`${key} has no attachments.`);
  }

  const match = resolveAttachment(attachments, selector);
  if (!match) {
    return errorResult(
      `No attachment matching ${JSON.stringify(selector)} on ${key}. Available: ${minifiedJson(
        attachments.map((a) => ({ id: a.id, filename: a.filename })),
      )}`,
    );
  }

  const isImage = IMAGE_MIME_TYPES.has(match.mimeType.toLowerCase());
  const useThumbnail = isImage && match.size > MAX_INLINE_BYTES;
  const path = useThumbnail
    ? `/rest/api/3/attachment/thumbnail/${match.id}`
    : `/rest/api/3/attachment/content/${match.id}`;

  let bytes: Uint8Array;
  let contentType: string;
  try {
    ({ bytes, contentType } = await jiraRequestBinary(path));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return errorResult(
      `Failed to download attachment ${match.id} (${match.filename}) from ${key}: ${message}`,
    );
  }

  const meta = {
    key,
    id: match.id,
    filename: match.filename,
    mimeType: match.mimeType,
    size: match.size,
    created: match.created,
    author: match.author,
    ...(useThumbnail
      ? {
          thumbnail: true,
          note: `Original is ${match.size} bytes (over the ${MAX_INLINE_BYTES}-byte inline limit); Jira's thumbnail was returned instead.`,
        }
      : {}),
  };

  if (isImage) {
    if (bytes.byteLength > MAX_INLINE_BYTES) {
      return errorResult(
        `Attachment ${match.filename} on ${key} is ${bytes.byteLength} bytes, over the ${MAX_INLINE_BYTES}-byte inline limit, and no smaller thumbnail is available.`,
      );
    }
    return {
      content: [
        { type: 'text', text: minifiedJson(meta) },
        {
          type: 'image',
          data: Buffer.from(bytes).toString('base64'),
          // Trust the transfer's own content type for the rendered bytes: a
          // thumbnail is not necessarily the original's format.
          mimeType: IMAGE_MIME_TYPES.has(contentType)
            ? contentType
            : match.mimeType,
        },
      ],
    };
  }

  if (TEXT_MIME_TYPES.has(match.mimeType.toLowerCase())) {
    const decoded = Buffer.from(bytes).toString('utf8');
    const truncated = decoded.length > MAX_TEXT_CHARS;
    const body = truncated ? decoded.slice(0, MAX_TEXT_CHARS) : decoded;
    return {
      content: [
        { type: 'text', text: minifiedJson({ ...meta, truncated }) },
        {
          type: 'text',
          text: truncated ? `${body}\n… (truncated)` : body,
        },
      ],
    };
  }

  return errorResult(
    `Attachment ${match.filename} on ${key} is ${match.mimeType}, which cannot be rendered inline. ${minifiedJson(meta)}`,
  );
}
