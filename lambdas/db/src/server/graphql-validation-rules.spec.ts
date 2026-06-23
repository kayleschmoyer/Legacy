import {
  type GraphQLError,
  Kind,
  type OperationDefinitionNode,
  parse,
  type ValidationContext,
} from 'graphql';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  MAX_QUERY_COMPLEXITY,
  MAX_QUERY_DEPTH,
  queryComplexityLimitRule,
  queryDepthLimitRule,
} from './graphql-validation-rules';

/**
 * Run a validation-rule factory against a parsed document using a minimal fake
 * ValidationContext (the rules only use `getFragment` + `reportError`). Returns
 * the errors the rule reported for the first operation in the document.
 */
type RuleFactory = (max: number) => (ctx: ValidationContext) => {
  OperationDefinition: (op: OperationDefinitionNode) => void;
};

function runRule(
  ruleFactory: RuleFactory,
  max: number,
  source: string,
): GraphQLError[] {
  const doc = parse(source);
  const fragments = new Map(
    doc.definitions
      .filter((d) => d.kind === Kind.FRAGMENT_DEFINITION)
      .map((d) => [(d as { name: { value: string } }).name.value, d]),
  );
  const operation = doc.definitions.find(
    (d): d is OperationDefinitionNode => d.kind === Kind.OPERATION_DEFINITION,
  );
  if (!operation) throw new Error('no operation in source');

  const errors: GraphQLError[] = [];
  // Minimal fake ValidationContext — the rules only use getFragment +
  // reportError. Cast through unknown since we deliberately stub the rest.
  const context = {
    getFragment: (name: string) => fragments.get(name) ?? null,
    reportError: (e: GraphQLError) => errors.push(e),
  } as unknown as ValidationContext;
  ruleFactory(max)(context).OperationDefinition(operation);
  return errors;
}

describe('queryDepthLimitRule', () => {
  it('allows a query within the depth limit', () => {
    const errors = runRule(queryDepthLimitRule, 3, `query Q { a { b { c } } }`);
    expect(errors).toHaveLength(0);
  });

  it('rejects a query that exceeds the depth limit', () => {
    const errors = runRule(queryDepthLimitRule, 2, `query Q { a { b { c } } }`);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/depth 3 exceeds maximum allowed depth/);
  });
});

describe('queryComplexityLimitRule', () => {
  it('allows a query within the complexity limit', () => {
    const errors = runRule(queryComplexityLimitRule, 5, `query Q { a b c }`);
    expect(errors).toHaveLength(0);
  });

  it('rejects a flat query that exceeds the complexity limit', () => {
    const errors = runRule(
      queryComplexityLimitRule,
      3,
      `query Q { a b c d e }`,
    );
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(
      /complexity 5 exceeds maximum allowed complexity of 3/,
    );
  });

  // Regression for LS-8246: a query that spreads two overlapping fragments on
  // the same type must be counted by its MERGED selection (true execution cost),
  // not the sum of both fragments. Summed = thing(1)+F1{a,b,c}+F2{b,c,d} = 7;
  // merged = thing(1)+{a,b,c,d} = 5.
  const overlappingFragments = `
    query Q { thing { ...F1 ...F2 } }
    fragment F1 on T { a b c }
    fragment F2 on T { b c d }
  `;

  it('merges overlapping fragments instead of double-counting shared fields', () => {
    // Merged count is 5, so a limit of 5 must pass even though the summed
    // count (7) would have tripped it.
    expect(
      runRule(queryComplexityLimitRule, 5, overlappingFragments),
    ).toHaveLength(0);
  });

  it('still rejects when even the merged field count exceeds the limit', () => {
    const errors = runRule(queryComplexityLimitRule, 4, overlappingFragments);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/complexity 5 exceeds/);
  });

  // The concrete LS-8246 case: the shared cross-platform getMatchupPlayers query
  // spreads both MatchupPlayer + AppMatchupPlayer (GraphQL consolidation,
  // LS-8009). Summed, that is 284 fields and tripped the 200 limit, blanking the
  // entire matchup detail page. Merged it resolves ~141 source fields and must
  // pass the production MAX_QUERY_COMPLEXITY.
  it('accepts the real getMatchupPlayers query under MAX_QUERY_COMPLEXITY', () => {
    const graphqlSrc = join(__dirname, '../../../../lib/graphql/src');
    const source = [
      readFileSync(join(graphqlSrc, 'getMatchupPlayers.query.graphql'), 'utf8'),
      readFileSync(join(graphqlSrc, 'matchupPlayer.fragment.graphql'), 'utf8'),
      readFileSync(join(graphqlSrc, '_added/Matchups.added.graphql'), 'utf8'),
    ].join('\n\n');

    const errors = runRule(
      queryComplexityLimitRule,
      MAX_QUERY_COMPLEXITY,
      source,
    );
    expect(errors).toHaveLength(0);
  });

  it('keeps the matchup detail page queries within the depth limit', () => {
    const graphqlSrc = join(__dirname, '../../../../lib/graphql/src');
    const source = [
      readFileSync(join(graphqlSrc, 'getMatchupPlayers.query.graphql'), 'utf8'),
      readFileSync(join(graphqlSrc, 'matchupPlayer.fragment.graphql'), 'utf8'),
      readFileSync(join(graphqlSrc, '_added/Matchups.added.graphql'), 'utf8'),
    ].join('\n\n');

    expect(runRule(queryDepthLimitRule, MAX_QUERY_DEPTH, source)).toHaveLength(
      0,
    );
  });
});
