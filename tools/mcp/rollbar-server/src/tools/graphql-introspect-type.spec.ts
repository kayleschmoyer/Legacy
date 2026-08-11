import { graphqlIntrospectType } from './graphql-introspect-type';
import type { ToolResult } from '../types';

interface ParsedResult {
  env?: string;
  type?: { fields?: { name: string }[] } | null;
  note?: string;
  errors?: { message: string }[];
  fieldsOnlyIn?: { prod?: string[]; dev?: string[] };
}

describe('graphqlIntrospectType', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function mockFetch(
    impl: (url: string, init: RequestInit) => Response,
  ): jest.Mock {
    const fn = jest.fn((url: string, init: RequestInit) => impl(url, init));
    global.fetch = fn as unknown as typeof fetch;
    return fn;
  }

  function parseResult(result: ToolResult): ParsedResult {
    return JSON.parse(
      (result.content[0] as { text: string }).text,
    ) as ParsedResult;
  }

  it('introspects a type and returns its fields for a single environment', async () => {
    const fn = mockFetch(
      () =>
        new Response(
          JSON.stringify({
            data: {
              __type: {
                name: 'TradeOfferPlayer',
                kind: 'OBJECT',
                fields: [{ name: 'id' }, { name: 'salary' }],
                inputFields: null,
                enumValues: null,
              },
            },
          }),
          { status: 200 },
        ),
    );

    const result = await graphqlIntrospectType({
      env: 'prod',
      typeName: 'TradeOfferPlayer',
    });

    expect(result.isError).toBeUndefined();
    const [calledUrl, calledInit] = fn.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe('https://api.legacy-fantasy.com/graphql');
    const sentBody = JSON.parse(calledInit.body as string) as {
      variables: { name: string };
    };
    expect(sentBody.variables.name).toBe('TradeOfferPlayer');

    const parsed = parseResult(result);
    expect(parsed.env).toBe('prod');
    expect(parsed.type?.fields).toEqual([{ name: 'id' }, { name: 'salary' }]);
    expect(parsed.note).toBeUndefined();
  });

  it('reports a clear note when the type does not exist on the deployed schema', async () => {
    mockFetch(
      () =>
        new Response(JSON.stringify({ data: { __type: null } }), {
          status: 200,
        }),
    );

    const result = await graphqlIntrospectType({
      env: 'dev',
      typeName: 'DoesNotExist',
    });

    expect(result.isError).toBeUndefined();
    const parsed = parseResult(result);
    expect(parsed.type).toBeNull();
    expect(parsed.note).toMatch(/was not found on the dev deployed schema/);
  });

  it('surfaces GraphQL application errors (e.g. introspection disabled) without throwing', async () => {
    mockFetch(
      () =>
        new Response(
          JSON.stringify({
            errors: [
              {
                message: 'GraphQL introspection is not allowed',
                extensions: { code: 'GRAPHQL_VALIDATION_FAILED' },
              },
            ],
          }),
          { status: 200 },
        ),
    );

    const result = await graphqlIntrospectType({
      env: 'prod',
      typeName: 'TradeOfferPlayer',
    });

    expect(result.isError).toBeUndefined();
    const parsed = parseResult(result);
    expect(parsed.type).toBeNull();
    expect(parsed.errors?.[0]?.message).toMatch(/introspection is not allowed/);
  });

  it('diffs field names between two environments when compareEnv is provided', async () => {
    mockFetch((url) => {
      const isProd = url === 'https://api.legacy-fantasy.com/graphql';
      const fields = isProd
        ? [{ name: 'id' }, { name: 'name' }]
        : [{ name: 'id' }, { name: 'name' }, { name: 'salary' }];
      return new Response(
        JSON.stringify({
          data: {
            __type: {
              name: 'TradeOfferPlayer',
              kind: 'OBJECT',
              fields,
              inputFields: null,
              enumValues: null,
            },
          },
        }),
        { status: 200 },
      );
    });

    const result = await graphqlIntrospectType({
      env: 'prod',
      compareEnv: 'dev',
      typeName: 'TradeOfferPlayer',
    });

    expect(result.isError).toBeUndefined();
    const parsed = parseResult(result);
    expect(parsed.fieldsOnlyIn?.prod).toEqual([]);
    expect(parsed.fieldsOnlyIn?.dev).toEqual(['salary']);
  });

  it('returns an error result on a non-OK HTTP response', async () => {
    mockFetch(() => new Response('Bad Gateway', { status: 502 }));

    const result = await graphqlIntrospectType({
      env: 'prod',
      typeName: 'TradeOfferPlayer',
    });

    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toMatch(
      /Failed to introspect type "TradeOfferPlayer"/,
    );
  });

  it('rejects providing both typeName and typeNames', async () => {
    const result = await graphqlIntrospectType({
      env: 'prod',
      typeName: 'TradeOfferPlayer',
      typeNames: ['KeeperDesignation'],
    });

    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toMatch(
      /Provide either `typeName`.*or `typeNames`/,
    );
  });

  it('rejects a call with neither typeName nor typeNames', async () => {
    const result = await graphqlIntrospectType({ env: 'prod' });

    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toMatch(
      /Either `typeName` or `typeNames` must be provided/,
    );
  });
});

interface ParsedBatchResult {
  env?: string;
  compareEnv?: string;
  types?: Array<{
    type: string;
    present: boolean;
    fields: string[] | null;
    fieldsOnlyIn?: { prod?: string[]; dev?: string[] };
  }>;
  truncated?: boolean;
  note?: string;
}

describe('graphqlIntrospectType batch mode (typeNames)', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function mockFetch(
    impl: (url: string, init: RequestInit) => Response,
  ): jest.Mock {
    const fn = jest.fn((url: string, init: RequestInit) => impl(url, init));
    global.fetch = fn as unknown as typeof fetch;
    return fn;
  }

  function parseResult(result: ToolResult): ParsedBatchResult {
    return JSON.parse(
      (result.content[0] as { text: string }).text,
    ) as ParsedBatchResult;
  }

  it('introspects multiple types concurrently and reports each as present/absent', async () => {
    const fn = mockFetch((_url, init) => {
      const body = JSON.parse(init.body as string) as {
        variables: { name: string };
      };
      const name = body.variables.name;
      if (name === 'KeeperDesignation') {
        return new Response(
          JSON.stringify({
            data: {
              __type: {
                name,
                kind: 'OBJECT',
                fields: [{ name: 'id' }, { name: 'playerId' }],
                inputFields: null,
                enumValues: null,
              },
            },
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ data: { __type: null } }), {
        status: 200,
      });
    });

    const result = await graphqlIntrospectType({
      env: 'prod',
      typeNames: ['KeeperDesignation', 'DoesNotExist'],
    });

    expect(result.isError).toBeUndefined();
    expect(fn).toHaveBeenCalledTimes(2);

    const parsed = parseResult(result);
    expect(parsed.env).toBe('prod');
    expect(parsed.types).toHaveLength(2);
    const byName = Object.fromEntries(
      (parsed.types ?? []).map((t) => [t.type, t]),
    );
    expect(byName.KeeperDesignation.present).toBe(true);
    expect(byName.KeeperDesignation.fields).toEqual(['id', 'playerId']);
    expect(byName.DoesNotExist.present).toBe(false);
    expect(byName.DoesNotExist.fields).toBeNull();
  });

  it('diffs each type between env and compareEnv in batch mode', async () => {
    mockFetch((url) => {
      const isProd = url === 'https://api.legacy-fantasy.com/graphql';
      const fields = isProd
        ? [{ name: 'id' }]
        : [{ name: 'id' }, { name: 'salary' }];
      return new Response(
        JSON.stringify({
          data: {
            __type: {
              name: 'TradeOfferPlayer',
              kind: 'OBJECT',
              fields,
              inputFields: null,
              enumValues: null,
            },
          },
        }),
        { status: 200 },
      );
    });

    const result = await graphqlIntrospectType({
      env: 'prod',
      compareEnv: 'dev',
      typeNames: ['TradeOfferPlayer'],
    });

    expect(result.isError).toBeUndefined();
    const parsed = parseResult(result);
    expect(parsed.types?.[0]?.fieldsOnlyIn?.prod).toEqual([]);
    expect(parsed.types?.[0]?.fieldsOnlyIn?.dev).toEqual(['salary']);
  });

  it('rejects a batch larger than the max size', async () => {
    const result = await graphqlIntrospectType({
      env: 'prod',
      typeNames: Array.from({ length: 21 }, (_, i) => `Type${i}`),
    });

    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toMatch(
      /at most 20 type names/,
    );
  });
});
