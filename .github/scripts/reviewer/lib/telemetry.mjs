import { spawn } from 'node:child_process';

/**
 * @typedef {object} Finding
 * @property {'critical'|'high'|'medium'|'low'|'info'} severity
 * @property {string} category  - e.g. 'correctness' | 'security' | 'contract'
 * @property {string} file      - File path relative to repo root
 * @property {number|null} line - Line number, or null when not line-specific
 * @property {string} summary   - One-line description of the finding
 */

/**
 * @typedef {object} CycleCounterExclusions
 * @property {number}  infra_failure  - Bot reviews excluded because they are infra-error reviews
 * @property {number}  dismissed      - Bot reviews excluded because their state is DISMISSED
 * @property {boolean} admin_reset    - True when an admin applied bot:reset-cycle-counter this run
 */

/**
 * @typedef {object} TelemetryRecord
 * @property {string}    ts                  - ISO 8601 timestamp (UTC)
 * @property {number}    pr                  - Pull request number
 * @property {string}    sha                 - Head commit SHA
 * @property {string}    model               - Model identifier string
 * @property {string}    provider            - 'github-models' | 'copilot-cli' | 'anthropic'
 * @property {1|2|3}     cycle               - Review cycle number
 * @property {string}    verdict             - 'APPROVED' | 'REQUEST_CHANGES' | 'ESCALATE' | string
 * @property {Finding[]} findings            - Structured findings from the review
 * @property {Finding[]} stripped_findings   - Findings removed by the cycle validator (non-empty for cycles 2 and 3 only)
 * @property {number}    input_tokens        - Total input tokens consumed
 * @property {number}    cached_input_tokens - Tokens served from prompt cache
 * @property {number}    output_tokens       - Total output tokens produced
 * @property {number}    cost_usd            - Total cost in USD
 * @property {number}    latency_ms          - Wall-clock latency of the review call in ms
 * @property {boolean}   shadow              - True when running in shadow (non-blocking) mode
 * @property {string}    author_login        - GitHub login of the PR author (informational)
 * @property {'bot'|'human'} author_type     - Derived author type for observability
 * @property {number}    format_errors       - Count of MALFORMED author reply tokens detected
 * @property {CycleCounterExclusions} cycle_counter_exclusions - Breakdown of reviews excluded from the cycle count
 */

/**
 * Emit one JSONL record per review to the configured S3 telemetry bucket.
 *
 * Gracefully no-ops when:
 *  - REVIEWER_TELEMETRY_BUCKET env var is not set
 *  - AWS CLI is unavailable or credentials are missing (error logged to stderr)
 *
 * @param {TelemetryRecord} record
 * @returns {Promise<void>}
 */
export async function emitTelemetry(record) {
  const bucket = process.env.REVIEWER_TELEMETRY_BUCKET;
  if (!bucket) return;

  const line = JSON.stringify(record);
  const safeTs = record.ts.replace(/[:.]/g, '-');
  const key = `reviews/${record.pr}/${record.sha}/${safeTs}-cycle${record.cycle}.jsonl`;

  try {
    await uploadLineToS3(bucket, key, line);
  } catch (err) {
    // Best-effort: telemetry failures must not block the review workflow
    process.stderr.write(
      `[telemetry] S3 upload failed (s3://${bucket}/${key}): ${err.message}\n`,
    );
  }
}

/**
 * Build a TelemetryRecord from review call parameters and results.
 *
 * @param {object} params
 * @param {number}    params.pr
 * @param {string}    params.sha
 * @param {string}    params.model
 * @param {string}    params.provider
 * @param {number}    params.cycle
 * @param {string}    params.verdict
 * @param {Finding[]} params.findings
 * @param {Finding[]} [params.strippedFindings]
 * @param {import('./providers/provider.mjs').ProviderUsage} params.usage
 * @param {number}    params.latencyMs
 * @param {boolean}   params.shadow
 * @param {string}    [params.authorLogin]
 * @param {'bot'|'human'} [params.authorType]
 * @param {number}    [params.formatErrors]
 * @param {CycleCounterExclusions} [params.cycleCounterExclusions]
 * @returns {TelemetryRecord}
 */
export function buildRecord({
  pr,
  sha,
  model,
  provider,
  cycle,
  verdict,
  findings,
  strippedFindings,
  usage,
  latencyMs,
  shadow,
  authorLogin = '',
  authorType = 'human',
  formatErrors = 0,
  cycleCounterExclusions = {
    infra_failure: 0,
    dismissed: 0,
    admin_reset: false,
  },
}) {
  return {
    ts: new Date().toISOString(),
    pr,
    sha,
    model,
    provider,
    cycle,
    verdict,
    findings: findings ?? [],
    stripped_findings: strippedFindings ?? [],
    input_tokens: usage?.inputTokens ?? 0,
    cached_input_tokens: usage?.cachedInputTokens ?? 0,
    output_tokens: usage?.outputTokens ?? 0,
    cost_usd: usage?.costUsd ?? 0,
    latency_ms: latencyMs,
    shadow: Boolean(shadow),
    author_login: authorLogin,
    author_type: authorType,
    format_errors: formatErrors,
    cycle_counter_exclusions: cycleCounterExclusions,
  };
}

/**
 * Stream a single JSONL line to S3 using the AWS CLI.
 * Pipes the line via stdin to `aws s3 cp - s3://bucket/key` to avoid temp files.
 *
 * @param {string} bucket - S3 bucket name
 * @param {string} key    - S3 object key
 * @param {string} line   - JSONL line to upload (no trailing newline needed)
 * @returns {Promise<void>}
 */
function uploadLineToS3(bucket, key, line) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'aws',
      [
        's3',
        'cp',
        '-',
        `s3://${bucket}/${key}`,
        '--content-type',
        'application/x-ndjson',
      ],
      { stdio: ['pipe', 'ignore', 'pipe'] },
    );

    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `aws s3 cp exited with code ${code}${stderr ? `: ${stderr.trim()}` : ''}`,
          ),
        );
      } else {
        resolve();
      }
    });

    child.on('error', (err) => {
      reject(new Error(`Failed to spawn aws CLI: ${err.message}`));
    });

    child.stdin.end(line + '\n');
  });
}
