/**
 * MCP tool-definition budget — the CI ratchet for epic LS-9701 (LS-9704).
 *
 * A tool definition (name + description + input schema) is advertised to the
 * model up front, so every registered tool bills every session whether or not
 * it is called. Before this, `--check` only verified that the generated docs
 * matched the sources; unbudgeted growth passed CI silently, and the surface
 * went 81 tools (April 2026) -> 173 (June) -> 219 (August) with no net removal.
 *
 * The budget file (docs/mcp/tool-budget.json) holds a per-server ceiling for
 * tool count and definition tokens. `--check` fails in BOTH directions:
 *
 *   - over ceiling   -> growth that nobody signed off on
 *   - far under      -> a consolidation landed without lowering the ceiling,
 *                       leaving headroom the next tool addition spends silently
 *
 * The second direction is the point. A ceiling that is only ever compared
 * upward is not a ratchet — it is a one-time cap that erodes.
 *
 * Token counts come from the same offline estimator the measurement harness
 * uses (scripts/mcp-token-measure). It is an approximation of BPE
 * tokenization, but it is deterministic and needs no network or API key, which
 * is what a CI gate requires. It ranks and trends reliably; exact counts for a
 * PR write-up come from `measure.mjs --backend=anthropic`.
 *
 * @see .agents/skills/create/references/mcp-tool-consolidation.md
 */
import { estimateTokens } from '../mcp-token-measure/lib/tokenize.mjs';

/**
 * Token slack allowed below a ceiling before `--check` demands the ceiling be
 * lowered. Sized so routine description edits don't force a budget commit,
 * while a real consolidation does: 2% of the ceiling, floored at 200 tokens so
 * small servers aren't held to an impractically tight band.
 */
export function tokenTolerance(ceiling) {
  return Math.max(200, Math.round(ceiling * 0.02));
}

/**
 * Serialize a tool the way it is advertised to the model, so the estimate
 * tracks what a session actually pays for.
 */
function renderToolDefinition(tool) {
  return JSON.stringify({
    name: tool.name,
    description: tool.description ?? '',
    input_schema: tool.inputs ?? {},
  });
}

/** Measure definition tokens per server plus the repo-wide total. */
export function measureDefinitionTokens(model) {
  const servers = {};
  let total = 0;
  for (const server of model.servers) {
    const tokens = server.tools.reduce(
      (sum, tool) => sum + estimateTokens(renderToolDefinition(tool)),
      0,
    );
    servers[server.id] = { tools: server.tools.length, tokens };
    total += tokens;
  }
  return { servers, total, toolCount: model.toolCount };
}

function formatDelta(measured, ceiling) {
  const delta = measured - ceiling;
  return delta > 0 ? `+${delta}` : String(delta);
}

/**
 * Compare measured usage against the committed ceilings.
 *
 * @param {*} measured Working-tree measurement from `measureDefinitionTokens`.
 * @param {*} budget Parsed `docs/mcp/tool-budget.json`.
 * @param {{ ref: string, measured: * } | undefined} base When provided (see
 *   `--baseRef`), a TOTAL violation is attributed to whichever side —
 *   the base ref or this branch — actually owns the overage, instead of
 *   unconditionally telling the caller to trim their own branch (LS-10149).
 * @returns {{ violations: string[], lines: string[] }} `violations` is empty
 *   when the budget holds; `lines` is the always-printed per-server report.
 */
export function checkBudget(measured, budget, base) {
  const violations = [];
  const lines = [];

  const ids = new Set([
    ...Object.keys(measured.servers),
    ...Object.keys(budget.servers ?? {}),
  ]);

  for (const id of [...ids].sort()) {
    const actual = measured.servers[id];
    const ceiling = budget.servers?.[id];

    if (!actual) {
      violations.push(
        `${id}: has a budget entry but no longer exists. Remove it from docs/mcp/tool-budget.json.`,
      );
      continue;
    }

    if (!ceiling) {
      violations.push(
        `${id}: new server with no budget entry. Add one to docs/mcp/tool-budget.json:\n` +
          `      "${id}": { "tools": ${actual.tools}, "tokens": ${actual.tokens} }`,
      );
      continue;
    }

    const slack = tokenTolerance(ceiling.tokens);
    const headroom = ceiling.tokens - actual.tokens;

    if (actual.tools > ceiling.tools) {
      violations.push(
        `${id}: ${actual.tools} tools exceeds the ceiling of ${ceiling.tools} (${formatDelta(actual.tools, ceiling.tools)}).\n` +
          `      Prefer an \`action\` param on an existing tool. If a new tool is genuinely warranted,\n` +
          `      raise the ceiling in docs/mcp/tool-budget.json in this PR and say why.`,
      );
    } else if (actual.tools < ceiling.tools) {
      violations.push(
        `${id}: ${actual.tools} tools is below the ceiling of ${ceiling.tools}. Lower it to ${actual.tools}\n` +
          `      in this PR so the saving is locked in rather than spent by the next addition.`,
      );
    }

    if (actual.tokens > ceiling.tokens) {
      violations.push(
        `${id}: ${actual.tokens} definition tokens exceeds the ceiling of ${ceiling.tokens} (${formatDelta(actual.tokens, ceiling.tokens)}).\n` +
          `      Trim schemas first — they cost roughly 2x descriptions. If the growth is justified,\n` +
          `      raise the ceiling in docs/mcp/tool-budget.json in this PR and say why.`,
      );
    } else if (headroom > slack) {
      violations.push(
        `${id}: ${actual.tokens} definition tokens is ${headroom} under the ceiling of ${ceiling.tokens}\n` +
          `      (tolerance ${slack}). Lower it to ${actual.tokens} in this PR — an un-ratcheted ceiling\n` +
          `      lets the next tool addition spend the saving silently.`,
      );
    }

    lines.push(
      `  ${id.padEnd(26)} ${String(actual.tools).padStart(3)}/${String(ceiling.tools).padEnd(3)} tools   ` +
        `${String(actual.tokens).padStart(6)}/${String(ceiling.tokens).padEnd(6)} tokens  ` +
        `(${headroom >= 0 ? `${headroom} headroom` : `${-headroom} OVER`})`,
    );
  }

  const totalCeiling = budget.total?.tokens;
  if (typeof totalCeiling === 'number' && measured.total > totalCeiling) {
    if (base) {
      const branchDelta = formatDelta(measured.total, base.measured.total);
      const baseOverage = base.measured.total - totalCeiling;
      const verdict =
        baseOverage > 0
          ? `base is already ${formatDelta(base.measured.total, totalCeiling)} OVER`
          : `this branch added ${branchDelta}, pushing TOTAL ${formatDelta(measured.total, totalCeiling)} over the ceiling`;
      violations.push(
        `TOTAL: ${measured.total} (base ${base.ref}: ${base.measured.total}, this branch: ${branchDelta}) — ` +
          `ceiling ${totalCeiling} (${verdict})`,
      );
    } else {
      violations.push(
        `TOTAL: ${measured.total} definition tokens exceeds the ceiling of ${totalCeiling} ` +
          `(${formatDelta(measured.total, totalCeiling)}).`,
      );
    }
  }

  return { violations, lines };
}

/**
 * Raise a single server's ceiling to its current measurement, recomputing
 * `total` to match, and leaving every other server's ceiling untouched.
 *
 * This is the narrow counterpart to `budgetFromMeasurement`'s full re-seed:
 * a justified single-server raise shouldn't also silently absorb whatever
 * headroom the other servers happen to be carrying (LS-10180).
 */
export function updateSingleServerBudget(measured, budget, serverId) {
  const actual = measured.servers[serverId];
  if (!actual) {
    throw new Error(
      `${serverId}: not found in the current measurement. Known servers: ` +
        `${Object.keys(measured.servers).sort().join(', ')}`,
    );
  }

  const existing = budget.servers?.[serverId];
  const prevTools = existing?.tools ?? 0;
  const prevTokens = existing?.tokens ?? 0;

  return {
    ...budget,
    total: {
      tools: (budget.total?.tools ?? 0) - prevTools + actual.tools,
      tokens: (budget.total?.tokens ?? 0) - prevTokens + actual.tokens,
    },
    servers: {
      ...budget.servers,
      [serverId]: { tools: actual.tools, tokens: actual.tokens },
    },
  };
}

/** Build a budget file body from the current measurement (for seeding/updating). */
export function budgetFromMeasurement(measured) {
  const servers = {};
  for (const id of Object.keys(measured.servers).sort()) {
    servers[id] = {
      tools: measured.servers[id].tools,
      tokens: measured.servers[id].tokens,
    };
  }
  return {
    _comment:
      'Per-server ceilings for MCP tool count and definition tokens (name + description + input schema). ' +
      'Enforced by `make lint-mcp-api-reference`. This is a RATCHET: when a consolidation lowers the ' +
      'measured value, lower the ceiling in the same PR. Raising a ceiling requires a justification in ' +
      'the PR description. See .agents/skills/create/references/mcp-tool-consolidation.md.',
    _regenerate:
      'node scripts/generate-mcp-api-reference.mjs --update-budget ' +
      '(or --update-budget=<server-id> to raise just one ceiling)',
    total: { tools: measured.toolCount, tokens: measured.total },
    servers,
  };
}
