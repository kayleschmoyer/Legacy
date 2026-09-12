import { minifiedJson } from '@legacy-sports/mcp-format';
import {
  type GraphqlEnv,
  postGraphql,
  resolveGraphqlEndpoint,
} from '../graphql-api.js';
import type { ToolResult } from '../types.js';

export interface GraphqlIntrospectTypeParams {
  env: GraphqlEnv;
  typeName?: string;
  typeNames?: string[];
  compareEnv?: GraphqlEnv;
}

/** Maximum number of type names accepted in a single batch call. */
export const MAX_BATCH_TYPES = 20;
/** Maximum number of concurrent introspection requests in batch mode. */
export const BATCH_CONCURRENCY = 5;
/** Hard cap on serialized batch output (LS-8778, LS-5211: unbounded output overflows context). */
export const MAX_BATCH_OUTPUT_CHARS = 20_000;

interface IntrospectedField {
  name: string;
}

interface IntrospectedType {
  name: string;
  kind: string;
  fields: IntrospectedField[] | null;
  inputFields: IntrospectedField[] | null;
  enumValues: IntrospectedField[] | null;
}

interface IntrospectTypeQueryResult {
  __type: IntrospectedType | null;
}

const INTROSPECT_TYPE_QUERY = `
  query IntrospectType($name: String!) {
    __type(name: $name) {
      name
      kind
      fields { name }
      inputFields { name }
      enumValues { name }
    }
  }
`;

interface EnvIntrospection {
  env: GraphqlEnv;
  endpoint: string;
  type: IntrospectedType | null;
  errors?: unknown;
}

/**
 * Pick whichever member list applies to the type's kind — OBJECT/INTERFACE
 * expose `fields`, INPUT_OBJECT exposes `inputFields`, ENUM exposes
 * `enumValues`. Exactly one is non-null for any given kind.
 */
function memberNames(type: IntrospectedType | null): string[] | null {
  if (!type) return null;
  const members = type.fields ?? type.inputFields ?? type.enumValues ?? [];
  return members.map((m) => m.name).sort();
}

function diffNames(
  a: string[] | null,
  b: string[] | null,
): { onlyInFirst: string[]; onlyInSecond: string[] } {
  const setA = new Set(a ?? []);
  const setB = new Set(b ?? []);
  return {
    onlyInFirst: [...setA].filter((n) => !setB.has(n)).sort(),
    onlyInSecond: [...setB].filter((n) => !setA.has(n)).sort(),
  };
}

async function introspect(
  env: GraphqlEnv,
  typeName: string,
): Promise<EnvIntrospection> {
  const endpoint = resolveGraphqlEndpoint(env);
  const result = await postGraphql<IntrospectTypeQueryResult>(
    endpoint,
    INTROSPECT_TYPE_QUERY,
    { name: typeName },
  );
  return {
    env,
    endpoint,
    type: result.data?.__type ?? null,
    ...(result.errors ? { errors: result.errors } : {}),
  };
}

function toolError(message: string): ToolResult {
  return {
    isError: true,
    content: [
      { type: 'text', text: minifiedJson({ ok: false, error: message }) },
    ],
  };
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

interface BatchTypeEntry {
  type: string;
  present: boolean;
  fields: string[] | null;
  errors?: unknown;
  fieldsOnlyIn?: { [env: string]: string[] };
}

async function introspectOneForBatch(
  typeName: string,
  env: GraphqlEnv,
  compareEnv: GraphqlEnv | undefined,
): Promise<BatchTypeEntry> {
  const primary = await introspect(env, typeName);

  if (!compareEnv || compareEnv === env) {
    return {
      type: typeName,
      present: primary.type !== null,
      fields: memberNames(primary.type),
      ...(primary.errors ? { errors: primary.errors } : {}),
    };
  }

  const compare = await introspect(compareEnv, typeName);
  const { onlyInFirst, onlyInSecond } = diffNames(
    memberNames(primary.type),
    memberNames(compare.type),
  );

  return {
    type: typeName,
    present: primary.type !== null,
    fields: memberNames(primary.type),
    ...(primary.errors || compare.errors
      ? { errors: { [env]: primary.errors, [compareEnv]: compare.errors } }
      : {}),
    fieldsOnlyIn: { [env]: onlyInFirst, [compareEnv]: onlyInSecond },
  };
}

/**
 * Batch counterpart of `graphqlIntrospectType` — introspects several type
 * names against the same environment(s) in one call (bounded concurrency,
 * `MAX_BATCH_TYPES` cap). Truncates the `types` array (not individual
 * entries) to stay under `MAX_BATCH_OUTPUT_CHARS` rather than silently
 * returning an unbounded payload.
 */
async function graphqlIntrospectTypeBatch(
  typeNames: string[],
  env: GraphqlEnv,
  compareEnv: GraphqlEnv | undefined,
): Promise<ToolResult> {
  if (typeNames.length > MAX_BATCH_TYPES) {
    return toolError(
      `Batch mode accepts at most ${MAX_BATCH_TYPES} type names; received ${typeNames.length}.`,
    );
  }

  try {
    const results = await runWithConcurrency(
      typeNames,
      BATCH_CONCURRENCY,
      (name) => introspectOneForBatch(name, env, compareEnv),
    );

    let truncated = false;
    let charCount = 0;
    const types: BatchTypeEntry[] = [];
    for (const entry of results) {
      const entryChars = JSON.stringify(entry).length;
      if (charCount + entryChars > MAX_BATCH_OUTPUT_CHARS) {
        truncated = true;
        break;
      }
      charCount += entryChars;
      types.push(entry);
    }

    return {
      content: [
        {
          type: 'text',
          text: minifiedJson({
            env,
            ...(compareEnv ? { compareEnv } : {}),
            types,
            ...(truncated
              ? {
                  truncated: true,
                  note: `Output truncated at ${MAX_BATCH_OUTPUT_CHARS} chars — ${types.length}/${typeNames.length} types shown.`,
                }
              : {}),
          }),
        },
      ],
    };
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Failed to introspect types [${typeNames.join(', ')}]: ${
            error instanceof Error ? error.message : String(error)
          }`,
        },
      ],
    };
  }
}

/**
 * Introspect a single type's fields on a deployed GraphQL endpoint's schema —
 * the MCP-native replacement for hand-rolling
 * `curl -X POST <endpoint> -d '{"query":"{__type(name:\"X\"){fields{name}}}"}'`
 * during schema-mismatch RCA (LS-8575, born from the LS-8505 investigation).
 * Pass `compareEnv` to also introspect a second environment and return the
 * field-name differences between them — the fast path for confirming
 * deploy-lag ("Cannot query field X on type Y") bugs in one call. READ-ONLY.
 */
export async function graphqlIntrospectType(
  params: GraphqlIntrospectTypeParams,
): Promise<ToolResult> {
  const { typeName, typeNames } = params;

  if (typeNames && typeNames.length > 0) {
    if (typeName) {
      return toolError(
        'Provide either `typeName` (singular) or `typeNames` (batch), not both.',
      );
    }
    return graphqlIntrospectTypeBatch(typeNames, params.env, params.compareEnv);
  }

  if (!typeName) {
    return toolError('Either `typeName` or `typeNames` must be provided.');
  }

  try {
    const primary = await introspect(params.env, typeName);

    if (!params.compareEnv || params.compareEnv === params.env) {
      const note =
        primary.type === null && !primary.errors
          ? `Type "${typeName}" was not found on the ${params.env} deployed schema.`
          : undefined;
      return {
        content: [{ type: 'text', text: minifiedJson({ ...primary, note }) }],
      };
    }

    const compare = await introspect(params.compareEnv, typeName);
    const { onlyInFirst, onlyInSecond } = diffNames(
      memberNames(primary.type),
      memberNames(compare.type),
    );

    return {
      content: [
        {
          type: 'text',
          text: minifiedJson({
            [params.env]: primary,
            [params.compareEnv]: compare,
            fieldsOnlyIn: {
              [params.env]: onlyInFirst,
              [params.compareEnv]: onlyInSecond,
            },
          }),
        },
      ],
    };
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Failed to introspect type "${typeName}": ${
            error instanceof Error ? error.message : String(error)
          }`,
        },
      ],
    };
  }
}
