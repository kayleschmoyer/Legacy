/**
 * Renders one Markdown skill-reference file per MCP server, generated from the
 * same Zod-derived model `render.mjs` uses for the HTML/JSON API reference.
 *
 * Why this exists (LS-9701 Tier 2): tool descriptions and skill docs drift from
 * the actual schema — agents have been caught routing to a deleted tool
 * (`github_create_pr`, removed in LS-9294) or citing a dead alias
 * (`jira_claim_ticket`, removed in LS-9705) because a skill's prose was never
 * updated when the source changed. Generating the reference from the schema
 * itself, with a drift check in CI, makes that class of bug impossible instead
 * of relying on someone remembering to update prose by hand.
 *
 * One known gap, deliberately not papered over: Zod's `.regex()` constraint
 * text is unreliable across this extractor's stdio/hosted merge for a small
 * number of tools (confirmed 4 of 897 param nodes, e.g. jira_transition's
 * `keys`/`key` — the extracted text is a stray import-statement fragment, not
 * the pattern). Rendering that garbage into a skill doc would be worse than
 * omitting it, so the 'regex' constraint kind is dropped here entirely rather
 * than reproduced. Tracked as a follow-up on the extractor itself.
 */

const ESCAPE_PIPE = (s) => String(s ?? '').replace(/\|/g, '\\|');

/** Collapse a Zod-derived param descriptor into one readable type string. */
function formatType(node, depth = 0) {
  if (!node || depth > 4) return 'unknown';
  switch (node.type) {
    case 'string':
    case 'number':
    case 'boolean':
      return node.type;
    case 'literal':
      return JSON.stringify(node.value ?? node.description ?? '');
    case 'enum':
      return node.values
        ? node.values.map((v) => JSON.stringify(v)).join(' \\| ')
        : 'enum';
    case 'array':
      return `${formatType(node.items, depth + 1)}[]`;
    case 'tuple':
      return `[${(node.items ?? []).map((i) => formatType(i, depth + 1)).join(', ')}]`;
    case 'object':
      return 'object';
    case 'record':
      return 'object (key-value)';
    case 'union':
      return (node.variants ?? [])
        .map((v) => formatType(v, depth + 1))
        .join(' \\| ');
    default:
      return node.type ?? 'unknown';
  }
}

/** Constraints minus the unreliable 'matches <regex>' kind — see file header. */
function formatConstraints(node) {
  const own = (node.constraints ?? []).filter((c) => !c.startsWith('matches '));
  const nested =
    node.type === 'union'
      ? (node.variants ?? []).flatMap((v) => formatConstraints(v))
      : node.type === 'array'
        ? formatConstraints(node.items ?? {})
        : [];
  return [...new Set([...own, ...nested])];
}

function paramRow(name, node) {
  const required = node.optional ? '' : '**required**';
  const constraints = formatConstraints(node);
  const constraintText = constraints.length ? constraints.join(', ') : '—';
  const desc = ESCAPE_PIPE(node.description ?? '—');
  return `| \`${name}\` | ${formatType(node)} | ${required} | ${constraintText} | ${desc} |`;
}

function renderTool(tool) {
  const params = Object.entries(tool.inputs ?? {});
  const lines = [
    `### \`${tool.name}\``,
    '',
    tool.description || '_No description._',
    '',
  ];

  if (params.length === 0) {
    lines.push('_No parameters._', '');
    return lines.join('\n');
  }

  lines.push(
    '| Param | Type | Required | Constraints | Description |',
    '| --- | --- | --- | --- | --- |',
    ...params.map(([name, node]) => paramRow(name, node)),
    '',
  );
  return lines.join('\n');
}

/**
 * Render one server's catalog as a self-contained Markdown file.
 * @param {object} server - one entry from `collect()`'s `model.servers`
 */
export function renderCatalog(server) {
  const transportNote =
    server.transports.length > 1
      ? `Available both locally (stdio) and via the hosted connector.`
      : server.transports.includes('hosted')
        ? `Hosted connector only — no local stdio process.`
        : `Local stdio process only — not exposed as a hosted connector.`;

  return [
    `# ${server.label} MCP Tool Catalog`,
    '',
    '> GENERATED FILE — DO NOT EDIT.',
    '>',
    `> Source: \`${server.packageDir}/src/{index,lambda}.ts\`. Regenerate with `,
    '> `make mcp-api-reference`; CI fails on drift (LS-9701 Tier 2, review pattern #48).',
    '>',
    '> For the interactive, filterable version of this same data across every',
    '> server: [`docs/mcp/api-reference.html`](../../../../../docs/mcp/api-reference.html).',
    '',
    server.summary,
    '',
    `${transportNote} ${server.toolCount} tool${server.toolCount === 1 ? '' : 's'}.`,
    '',
    '---',
    '',
    ...server.tools.map(renderTool),
  ].join('\n');
}
