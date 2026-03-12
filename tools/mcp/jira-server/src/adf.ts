/** Atlassian Document Format (ADF) node type. */
type AdfNode = {
  text?: string;
  content?: AdfNode[];
  [key: string]: unknown;
};

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
