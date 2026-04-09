/** Atlassian Document Format (ADF) node type. */
type AdfNode = {
  text?: string;
  content?: AdfNode[];
  [key: string]: unknown;
};

/** ADF heading node (h2 by default). */
function adfHeading(text: string, level: number = 2): AdfNode {
  return {
    type: 'heading',
    attrs: { level },
    content: [{ type: 'text', text }],
  };
}

/** ADF paragraph node. */
function adfParagraph(text: string): AdfNode {
  return {
    type: 'paragraph',
    content: [{ type: 'text', text }],
  };
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
 * When only `description` is provided (no structured fields), returns the
 * same single-paragraph ADF that the tool has always produced — backward
 * compatible. When structured fields are present, appends headed sections
 * (Context, Risk Assessment, Planning Notes) after the description body.
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
    content.push(adfParagraph(description));
  }

  if (context) {
    content.push(adfHeading('Context'));
    content.push(adfParagraph(context));
  }

  if (risk) {
    content.push(adfHeading('Risk Assessment'));
    content.push(adfParagraph(risk));
  }

  if (planningNotes) {
    content.push(adfHeading('Planning Notes'));
    content.push(adfParagraph(planningNotes));
  }

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
