// Token-efficient formatting for make-server's list-shaped tool responses. The
// cross-server standard and shared helper live in `@legacy-sports/mcp-format`
// (epic LS-8018 / LS-8019); most make-server tools return single objects and
// just use that package's `minifiedJson`. This module holds the one list-shaped
// formatter (terraform_state_list) so it can be unit-tested without pulling in
// the server's runtime dependencies (run-command's `import.meta`).

/**
 * Format a list of Terraform resource addresses as the token-efficient
 * `terraform_state_list` response.
 *
 * This is a list-shaped response, but the rows are plain address strings with no
 * per-row keys to repeat — so the cheapest encoding is a newline-delimited list,
 * not a JSON array or Markdown table (both of which spend tokens on punctuation:
 * `["…","…"]` quotes/commas, or a header + `---` separator). The count is kept
 * in the header line so an agent still sees it; success is signalled by the
 * absence of `isError` on the tool result.
 */
export function formatResourceList(resources: readonly string[]): string {
  if (resources.length === 0) return 'No resources in state.';
  const noun = resources.length === 1 ? 'resource' : 'resources';
  return `${resources.length} ${noun}:\n${resources.join('\n')}`;
}
