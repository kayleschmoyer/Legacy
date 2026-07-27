import { minifiedJson } from '@legacy-sports/mcp-format';
import {
  type GraphqlEnv,
  postGraphql,
  resolveGraphqlEndpoint,
} from '../graphql-api.js';
import type { ToolResult } from '../types.js';

export interface GraphqlIntrospectTypeParams {
  env: GraphqlEnv;
  typeName: string;
  compareEnv?: GraphqlEnv;
}

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
  try {
    const primary = await introspect(params.env, params.typeName);

    if (!params.compareEnv || params.compareEnv === params.env) {
      const note =
        primary.type === null && !primary.errors
          ? `Type "${params.typeName}" was not found on the ${params.env} deployed schema.`
          : undefined;
      return {
        content: [{ type: 'text', text: minifiedJson({ ...primary, note }) }],
      };
    }

    const compare = await introspect(params.compareEnv, params.typeName);
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
          text: `Failed to introspect type "${params.typeName}": ${
            error instanceof Error ? error.message : String(error)
          }`,
        },
      ],
    };
  }
}
