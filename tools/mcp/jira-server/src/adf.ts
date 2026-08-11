/** Atlassian Document Format (ADF) node type. */
type AdfNode = {
  text?: string;
  content?: AdfNode[];
  [key: string]: unknown;
};

/** ADF heading node. */
function adfHeading(text: string, level = 2): AdfNode {
  return {
    type: 'heading',
    attrs: { level },
    content: [{ type: 'text', text }],
  };
}

/**
 * Parse inline Markdown marks (bold, italic, inline code) into ADF text nodes.
 * Handles: **bold**, __bold__, *italic*, _italic_, `code`.
 */
function parseInlineMarkdown(text: string): AdfNode[] {
  const nodes: AdfNode[] = [];
  // Order matters: `**` before `*`, `__` before `_`; inline code first to skip marks inside
  const tokenRegex =
    /`([^`]+)`|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*|_([^_]+)_/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push({ type: 'text', text: text.slice(lastIndex, match.index) });
    }

    if (match[1] !== undefined) {
      nodes.push({ type: 'text', text: match[1], marks: [{ type: 'code' }] });
    } else if (match[2] !== undefined) {
      nodes.push({
        type: 'text',
        text: match[2],
        marks: [{ type: 'strong' }],
      });
    } else if (match[3] !== undefined) {
      nodes.push({
        type: 'text',
        text: match[3],
        marks: [{ type: 'strong' }],
      });
    } else if (match[4] !== undefined) {
      nodes.push({ type: 'text', text: match[4], marks: [{ type: 'em' }] });
    } else if (match[5] !== undefined) {
      nodes.push({ type: 'text', text: match[5], marks: [{ type: 'em' }] });
    }

    lastIndex = tokenRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push({ type: 'text', text: text.slice(lastIndex) });
  }

  return nodes.filter((n) => n.text !== '');
}

/**
 * Convert a Markdown string into an array of ADF block nodes.
 *
 * Handles block-level syntax: fenced code blocks (```), ATX headings (#–######),
 * bullet lists (-, *, +), ordered lists (1.), and paragraphs. Consecutive blank
 * lines are ignored. Single-newline-separated lines within a paragraph are joined
 * with a space (standard Markdown soft-wrap behavior).
 *
 * Inline: **bold**, __bold__, *italic*, _italic_, `code`.
 */
function markdownToAdfNodes(markdown: string): AdfNode[] {
  if (!markdown.trim()) return [];

  const blocks: AdfNode[] = [];
  const lines = markdown.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === '') {
      i++;
      continue;
    }

    // Fenced code block
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      blocks.push({
        type: 'codeBlock',
        attrs: lang ? { language: lang } : {},
        content: [{ type: 'text', text: codeLines.join('\n') }],
      });
      continue;
    }

    // ATX heading (# through ######)
    const headingMatch = line.match(/^(#{1,6})\s+(.*)/);
    if (headingMatch) {
      const level = Math.min(headingMatch[1].length, 6);
      blocks.push({
        type: 'heading',
        attrs: { level },
        content: parseInlineMarkdown(headingMatch[2]),
      });
      i++;
      continue;
    }

    // Bullet list — collect consecutive bullet lines
    if (/^[ \t]*[-*+]\s/.test(line)) {
      const items: AdfNode[] = [];
      while (i < lines.length && /^[ \t]*[-*+]\s/.test(lines[i])) {
        const itemText = lines[i].replace(/^[ \t]*[-*+]\s+/, '');
        items.push({
          type: 'listItem',
          content: [
            { type: 'paragraph', content: parseInlineMarkdown(itemText) },
          ],
        });
        i++;
      }
      blocks.push({ type: 'bulletList', content: items });
      continue;
    }

    // Ordered list — collect consecutive numbered lines
    if (/^[ \t]*\d+[.)]\s/.test(line)) {
      const items: AdfNode[] = [];
      while (i < lines.length && /^[ \t]*\d+[.)]\s/.test(lines[i])) {
        const itemText = lines[i].replace(/^[ \t]*\d+[.)]\s+/, '');
        items.push({
          type: 'listItem',
          content: [
            { type: 'paragraph', content: parseInlineMarkdown(itemText) },
          ],
        });
        i++;
      }
      blocks.push({ type: 'orderedList', content: items });
      continue;
    }

    // Paragraph — collect consecutive non-special lines, join with space
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].startsWith('```') &&
      !/^#{1,6}\s/.test(lines[i]) &&
      !/^[ \t]*[-*+]\s/.test(lines[i]) &&
      !/^[ \t]*\d+[.)]\s/.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }

    if (paraLines.length > 0) {
      const inlineContent = parseInlineMarkdown(paraLines.join(' '));
      if (inlineContent.length > 0) {
        blocks.push({ type: 'paragraph', content: inlineContent });
      }
    }
  }

  return blocks;
}

/** Parameters for building a structured Jira description. */
export interface StructuredDescriptionParams {
  description?: string;
  context?: string;
  risk?: string;
  planningNotes?: string;
}

/**
 * Build an ADF document from structured description fields.
 *
 * Each text field is parsed as Markdown so that bullets, bold, italic, code
 * blocks, and headings render properly in Jira rather than appearing as raw
 * syntax characters.
 *
 * When only `description` is provided (no structured fields), returns an ADF
 * doc with the description content only — backward compatible. When structured
 * fields are present, appends headed sections (Context, Risk Assessment,
 * Planning Notes) after the description body.
 *
 * Returns `undefined` when all params are absent so callers can omit the
 * `description` field entirely.
 */
export function buildStructuredDescription(
  params: StructuredDescriptionParams,
): Record<string, unknown> | undefined {
  const { description, context, risk, planningNotes } = params;

  const hasStructuredFields = !!(context || risk || planningNotes);

  if (!description && !hasStructuredFields) return undefined;

  const content: AdfNode[] = [];

  if (description) {
    content.push(...markdownToAdfNodes(description));
  }

  if (context) {
    content.push(adfHeading('Context'));
    content.push(...markdownToAdfNodes(context));
  }

  if (risk) {
    content.push(adfHeading('Risk Assessment'));
    content.push(...markdownToAdfNodes(risk));
  }

  if (planningNotes) {
    content.push(adfHeading('Planning Notes'));
    content.push(...markdownToAdfNodes(planningNotes));
  }

  if (content.length === 0) return undefined;

  return {
    type: 'doc',
    version: 1,
    content,
  };
}

/** Extract plain text from Atlassian Document Format (ADF) recursively. */
export function extractAdfText(adf: unknown): string {
  if (!adf || typeof adf !== 'object') return '';
  const doc = adf as { content?: AdfNode[] };
  if (!Array.isArray(doc.content)) return '';

  const parts: string[] = [];

  const collectText = (node: AdfNode): void => {
    if (typeof node.text === 'string') {
      parts.push(node.text);
    }
    if (Array.isArray(node.content)) {
      for (const child of node.content) {
        collectText(child);
      }
    }
  };

  const topLevel = doc.content;
  topLevel.forEach((block, index) => {
    const beforeLength = parts.length;
    collectText(block);
    if (parts.length > beforeLength && index < topLevel.length - 1) {
      parts.push('\n\n');
    }
  });

  return parts
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
