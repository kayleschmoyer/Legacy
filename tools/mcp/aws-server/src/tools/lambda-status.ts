import { getRepoRoot, runCommand } from '../run-command.js';
import type { ToolResult } from '../types.js';

interface LambdaConfig {
  FunctionName?: string;
  Runtime?: string;
  State?: string;
  LastModified?: string;
  MemorySize?: number;
  Timeout?: number;
  Handler?: string;
  CodeSize?: number;
  Description?: string;
  Environment?: { Variables?: Record<string, string> };
}

interface LambdaStatusCommonParams {
  environment: string;
  includeEnv?: boolean;
  includeEnvValues?: boolean;
}

export interface LambdaStatusParams extends LambdaStatusCommonParams {
  function?: string;
  functions?: string[];
}

/** Placeholder substituted for the value of any secret-named variable. */
export const REDACTED = '[REDACTED]';

/**
 * Name-shaped heuristics for variables whose values are assumed to be
 * credential material. Matching variables are never returned verbatim, even
 * under `includeEnvValues` — see `.agents/skills/secrets-handling/SKILL.md`.
 */
const SECRET_NAME_PATTERNS = [/_SECRET/, /_TOKEN/, /PASSWORD/, /_KEY/];

/** True when `name` looks like it holds credential material. */
export function isSecretName(name: string): boolean {
  const upper = name.toUpperCase();
  return SECRET_NAME_PATTERNS.some((re) => re.test(upper));
}

export interface LambdaEnvironmentReport {
  /** Every variable name set on the function, sorted. Always present. */
  variableNames: string[];
  /**
   * Values, present only under `includeEnvValues`. Secret-named variables map
   * to `REDACTED` rather than their real value.
   */
  variables?: Record<string, string>;
  /** Names whose values were redacted. Present only under `includeEnvValues`. */
  redactedNames?: string[];
}

export interface LambdaStatusSuccess {
  exists: true;
  functionName: string | undefined;
  state: string;
  runtime: string | undefined;
  lastModified: string | undefined;
  memorySize: number | undefined;
  timeout: number | undefined;
  handler: string | undefined;
  codeSize: number | undefined;
  description: string | null;
  environment?: LambdaEnvironmentReport;
}

export interface LambdaStatusNotFound {
  exists: false;
  functionName: string;
  error: string;
}

export type LambdaStatusEntry = LambdaStatusSuccess | LambdaStatusNotFound;

export type CommandRunner = (
  command: string,
  args: string[],
  cwd: string,
) => Promise<string>;

const defaultRunner: CommandRunner = (cmd, args, cwd) =>
  runCommand(cmd, args, cwd);

/** Maximum number of functions accepted in a single batch call. */
export const MAX_BATCH_FUNCTIONS = 25;
/** Maximum number of concurrent Lambda describes in batch mode. */
export const BATCH_CONCURRENCY = 5;

function normalizeFunctionName(name: string): string {
  // Strip trailing '-lambda' to match deployed names (e.g. 'stats-lambda' → 'stats').
  return name.endsWith('-lambda') ? name.slice(0, -'-lambda'.length) : name;
}

function toFullName(name: string, environment: string): string {
  return `legacy-sports-${environment}-${normalizeFunctionName(name)}`;
}

/**
 * Build the `environment` block for a function's config. Names are always
 * listed; values appear only when `includeValues` is set, and secret-named
 * variables are redacted even then.
 */
export function buildEnvironmentReport(
  variables: Record<string, string> | undefined,
  includeValues: boolean,
): LambdaEnvironmentReport {
  const names = Object.keys(variables ?? {}).sort();
  if (!includeValues) return { variableNames: names };

  const values: Record<string, string> = {};
  const redactedNames: string[] = [];
  for (const name of names) {
    if (isSecretName(name)) {
      values[name] = REDACTED;
      redactedNames.push(name);
    } else {
      values[name] = variables?.[name] ?? '';
    }
  }
  return { variableNames: names, variables: values, redactedNames };
}

function classifyRemedy(message: string): string | undefined {
  const isSsoError =
    /sso session.*expired|sso.*expired|credentials.*expired|InvalidClientTokenId|ExpiredToken/i.test(
      message,
    );
  return isSsoError
    ? 'Run `aws sso login` to re-authenticate, then retry.'
    : undefined;
}

interface EnvOptions {
  /** Include the `environment` block at all. */
  includeEnv: boolean;
  /** Include (redacted) values inside it. Implies `includeEnv`. */
  includeEnvValues: boolean;
}

async function fetchOne(
  fn: string,
  environment: string,
  runner: CommandRunner,
  envOptions: EnvOptions,
): Promise<
  | { ok: true; entry: LambdaStatusEntry }
  | { ok: false; error: string; remedy: string | undefined; fullName: string }
> {
  const repoRoot = getRepoRoot();
  const fullName = toFullName(fn, environment);

  try {
    const output = await runner(
      'aws',
      [
        'lambda',
        'get-function-configuration',
        '--function-name',
        fullName,
        '--output',
        'json',
      ],
      repoRoot,
    );

    const config = JSON.parse(output) as LambdaConfig;

    return {
      ok: true,
      entry: {
        exists: true,
        functionName: config.FunctionName,
        state: config.State ?? 'Active',
        runtime: config.Runtime,
        lastModified: config.LastModified,
        memorySize: config.MemorySize,
        timeout: config.Timeout,
        handler: config.Handler,
        codeSize: config.CodeSize,
        description: config.Description || null,
        ...(envOptions.includeEnv
          ? {
              environment: buildEnvironmentReport(
                config.Environment?.Variables,
                envOptions.includeEnvValues,
              ),
            }
          : {}),
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    if (/ResourceNotFoundException|Function not found/i.test(message)) {
      return {
        ok: true,
        entry: {
          exists: false,
          functionName: fullName,
          error: `Lambda function "${fullName}" does not exist.`,
        },
      };
    }

    return {
      ok: false,
      error: message,
      remedy: classifyRemedy(message),
      fullName,
    };
  }
}

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let idx = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (true) {
        const i = idx++;
        if (i >= items.length) return;
        results[i] = await worker(items[i]);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

function toolError(message: string): ToolResult {
  return {
    content: [
      { type: 'text', text: JSON.stringify({ ok: false, error: message }) },
    ],
    isError: true,
  };
}

export async function lambdaStatus(
  params: LambdaStatusParams,
  runner: CommandRunner = defaultRunner,
): Promise<ToolResult> {
  const fns = params.functions;
  // `includeEnvValues` is the explicit values opt-in; asking for values without
  // also asking for the block would otherwise silently return nothing.
  const includeEnvValues = params.includeEnvValues === true;
  const envOptions: EnvOptions = {
    includeEnv: params.includeEnv === true || includeEnvValues,
    includeEnvValues,
  };

  if (fns && fns.length > 0) {
    if (params.function) {
      return toolError(
        'Provide either `function` (singular) or `functions` (batch), not both.',
      );
    }
    if (fns.length > MAX_BATCH_FUNCTIONS) {
      return toolError(
        `Batch mode accepts at most ${MAX_BATCH_FUNCTIONS} functions; received ${fns.length}.`,
      );
    }

    const results = await runWithConcurrency(fns, BATCH_CONCURRENCY, (fn) =>
      fetchOne(fn, params.environment, runner, envOptions),
    );
    const statuses: Record<string, LambdaStatusEntry> = {};
    const missing: Array<{
      function: string;
      functionName: string;
      error: string;
      remedy?: string;
    }> = [];
    fns.forEach((fn, i) => {
      const r = results[i];
      if (r.ok) {
        statuses[fn] = r.entry;
      } else {
        missing.push({
          function: fn,
          functionName: r.fullName,
          error: r.error,
          ...(r.remedy ? { remedy: r.remedy } : {}),
        });
      }
    });
    return {
      content: [{ type: 'text', text: JSON.stringify({ statuses, missing }) }],
      ...(missing.length > 0 ? { isError: true } : {}),
    };
  }

  if (!params.function) {
    return toolError('Either `function` or `functions` must be provided.');
  }

  const result = await fetchOne(
    params.function,
    params.environment,
    runner,
    envOptions,
  );
  if (result.ok) {
    return {
      content: [{ type: 'text', text: JSON.stringify(result.entry) }],
    };
  }
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          ok: false,
          functionName: result.fullName,
          error: result.error,
          remedy: result.remedy,
        }),
      },
    ],
    isError: true,
  };
}
