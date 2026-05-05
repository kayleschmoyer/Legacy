/**
 * AnthropicProvider — LLMProvider implementation using the Anthropic SDK.
 *
 * Review passes:              claude-sonnet-4-6
 * Severity classification:    claude-haiku-4-5-20251001
 *
 * Prompt caching (design §7.10) — all breakpoints use TTL 1h (cache_control: ephemeral):
 *   BP1: system prompt        — reviewer persona + instructions (stable across reviews)
 *   BP2: repo rules           — .github/reviewer-rules.md content (stable per repo state)
 *   BP3: cycle instructions   — per-cycle focus text (stable within a multi-pass cycle)
 *   BP4: diff + file context  — per-review; re-cached so subsequent passes reuse it
 *
 * Structured output via tool-use API (design §7.9a): the model always calls
 * submit_review, enforcing the JSON schema and eliminating free-form parse errors.
 *
 * Usage/cost tracking: every response surfaces inputTokens, outputTokens,
 * cacheCreationInputTokens, cacheReadInputTokens, and costUsd.
 */

import Anthropic from '@anthropic-ai/sdk';

const SONNET_MODEL = 'claude-sonnet-4-6';
const HAIKU_MODEL = 'claude-haiku-4-5-20251001';

// Pricing per million tokens (USD). Update when Anthropic revises published rates.
const PRICING = {
  [SONNET_MODEL]: {
    input: 3.0,
    output: 15.0,
    cacheWrite: 3.75,
    cacheRead: 0.3,
  },
  [HAIKU_MODEL]: { input: 0.8, output: 4.0, cacheWrite: 1.0, cacheRead: 0.08 },
};

function computeCostUsd(usage, model) {
  const p = PRICING[model];
  if (!p) {
    throw new Error(`computeCostUsd: no pricing entry for model "${model}"`);
  }
  const m = (n) => (n ?? 0) / 1_000_000;
  return (
    m(usage.input_tokens) * p.input +
    m(usage.output_tokens) * p.output +
    m(usage.cache_creation_input_tokens) * p.cacheWrite +
    m(usage.cache_read_input_tokens) * p.cacheRead
  );
}

/**
 * Tool definition for structured review output.
 * tool_choice forces the model to always call this — no free-form fallback.
 */
const REVIEW_TOOL = {
  name: 'submit_review',
  description:
    'Submit a structured PR code review with findings and a verdict.',
  input_schema: {
    type: 'object',
    properties: {
      summary: {
        type: 'string',
        description: 'One-to-two sentence overall review summary.',
      },
      findings: {
        type: 'array',
        description:
          'Individual review findings. Empty array means no issues found.',
        items: {
          type: 'object',
          properties: {
            severity: {
              type: 'string',
              enum: [
                'critical',
                'high',
                'medium',
                'low',
                'trivia',
                'observation',
              ],
            },
            category: {
              type: 'string',
              description: 'correctness | security | contract | style | test',
            },
            file: { type: 'string' },
            line: { type: 'integer' },
            summary: { type: 'string' },
            justification: {
              type: 'string',
              description: 'Why this finding matters.',
            },
          },
          required: ['severity', 'category', 'summary'],
        },
      },
      verdict: {
        type: 'string',
        enum: ['APPROVED', 'REQUEST_CHANGES'],
        description:
          'APPROVED when no critical/high findings; REQUEST_CHANGES otherwise.',
      },
    },
    required: ['summary', 'findings', 'verdict'],
  },
};

/**
 * Tool definition for Haiku severity classification.
 */
const CLASSIFY_TOOL = {
  name: 'classify_severity',
  description: 'Classify the severity of a single code review finding.',
  input_schema: {
    type: 'object',
    properties: {
      severity: {
        type: 'string',
        enum: ['critical', 'high', 'medium', 'low', 'trivia', 'observation'],
      },
      confidence: {
        type: 'number',
        description:
          'Confidence 0–1. Findings with confidence < 0.7 should be trivia.',
      },
    },
    required: ['severity', 'confidence'],
  },
};

export class AnthropicProvider {
  /**
   * @param {object} [opts]
   * @param {string} [opts.apiKey]          - Anthropic API key (falls back to ANTHROPIC_API_KEY env)
   * @param {string} [opts.model]           - Review model (default: claude-sonnet-4-6)
   * @param {string} [opts.classifierModel] - Severity classification model (default: claude-haiku-4-5-20251001)
   */
  constructor({ apiKey, model, classifierModel } = {}) {
    this.client = new Anthropic({
      apiKey: apiKey ?? process.env.ANTHROPIC_API_KEY,
    });
    this.model = model ?? SONNET_MODEL;
    this.classifierModel = classifierModel ?? HAIKU_MODEL;
  }

  /**
   * Review a pull request diff using the Anthropic messages API.
   *
   * Honors the LLMProvider contract ({ system, user }) and extends it with
   * optional cache-breakpoint segments and a richer return type.
   *
   * Cache breakpoints (all cache_control: { type: 'ephemeral' }):
   *   BP1 → system prompt text
   *   BP2 → repoRules (if provided)
   *   BP3 → cycleInstructions (if provided)
   *   BP4 → user (diff + file context)
   *
   * @param {object}  params
   * @param {string}  params.system              - Reviewer persona / instructions (BP1)
   * @param {string}  params.user                - Diff + fetched file context (BP4)
   * @param {string} [params.repoRules]          - .github/reviewer-rules.md content (BP2)
   * @param {string} [params.cycleInstructions]  - Per-cycle focus instructions (BP3)
   * @returns {Promise<{ text: string, usage: ReviewUsage, structured: ReviewOutput }>}
   *
   * @typedef {object} ReviewUsage
   * @property {number} inputTokens
   * @property {number} outputTokens
   * @property {number} cacheCreationInputTokens
   * @property {number} cacheReadInputTokens
   * @property {number} costUsd
   *
   * @typedef {object} ReviewOutput
   * @property {string} summary
   * @property {Array}  findings
   * @property {string} verdict  - 'APPROVED' | 'REQUEST_CHANGES'
   */
  async review({ system, user, repoRules, cycleInstructions }) {
    // BP1: system prompt — stable across all reviews of this bot instance
    const systemContent = [
      { type: 'text', text: system, cache_control: { type: 'ephemeral' } },
    ];

    const userContent = [];

    if (repoRules) {
      // BP2: repo rules — stable per repo state; same TTL window shared across PRs
      userContent.push({
        type: 'text',
        text: repoRules,
        cache_control: { type: 'ephemeral' },
      });
    }

    if (cycleInstructions) {
      // BP3: cycle role instructions — changes once per cycle, constant across multi-pass
      userContent.push({
        type: 'text',
        text: cycleInstructions,
        cache_control: { type: 'ephemeral' },
      });
    }

    // BP4: diff + context — re-cached per review so subsequent passes within the same
    // review cycle read from cache rather than re-uploading the full diff
    userContent.push({
      type: 'text',
      text: user,
      cache_control: { type: 'ephemeral' },
    });

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      system: systemContent,
      tools: [REVIEW_TOOL],
      tool_choice: { type: 'tool', name: 'submit_review' },
      messages: [{ role: 'user', content: userContent }],
    });

    const toolBlock = response.content.find(
      (b) => b.type === 'tool_use' && b.name === 'submit_review',
    );
    if (!toolBlock) {
      throw new Error(
        'AnthropicProvider: submit_review tool call missing from response',
      );
    }
    const structured = toolBlock.input;

    const usage = {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheCreationInputTokens: response.usage.cache_creation_input_tokens ?? 0,
      cacheReadInputTokens: response.usage.cache_read_input_tokens ?? 0,
      costUsd: computeCostUsd(response.usage, this.model),
    };

    return { text: JSON.stringify(structured), usage, structured };
  }

  /**
   * Classify the severity of a single finding using Haiku (cost-optimised).
   *
   * Suitable for re-classifying findings after a multi-pass consolidation, or
   * for a cheap second-opinion pass on borderline cases.
   *
   * @param {string} findingSummary
   * @param {string} [context]  - Surrounding code snippet or PR context
   * @returns {Promise<{ severity: string, confidence: number, costUsd: number }>}
   */
  async classifySeverity(findingSummary, context = '') {
    const prompt = context
      ? `Finding: ${findingSummary}\n\nContext:\n${context}`
      : `Finding: ${findingSummary}`;

    const response = await this.client.messages.create({
      model: this.classifierModel,
      max_tokens: 256,
      tools: [CLASSIFY_TOOL],
      tool_choice: { type: 'tool', name: 'classify_severity' },
      messages: [{ role: 'user', content: prompt }],
    });

    const toolBlock = response.content.find(
      (b) => b.type === 'tool_use' && b.name === 'classify_severity',
    );
    const result = toolBlock?.input ?? { severity: 'trivia', confidence: 0.5 };
    const confidence =
      typeof result.confidence === 'number' &&
      Number.isFinite(result.confidence)
        ? result.confidence
        : 0.5;
    const severity = confidence < 0.7 ? 'trivia' : result.severity;

    return {
      ...result,
      severity,
      confidence,
      costUsd: computeCostUsd(response.usage, this.classifierModel),
    };
  }
}
