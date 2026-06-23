/**
 * Inline GraphQL validation rules for query depth and field-count limiting.
 *
 * These rules are wired into Apollo Server's `validationRules` option and run
 * synchronously during the validation phase — before any resolver is executed.
 * Rejecting malicious queries here prevents exponential-resource-consumption
 * DoS attacks (deeply nested queries, excessively wide selection sets).
 *
 * Implementation uses only the `graphql` package (already a peer dependency of
 * Apollo Server) — no extra npm packages needed.
 *
 * OWASP: A05:2021 - Security Misconfiguration
 */

import {
  type FragmentDefinitionNode,
  GraphQLError,
  Kind,
  type OperationDefinitionNode,
  type SelectionNode,
  type SelectionSetNode,
  ValidationContext,
} from 'graphql';

/** Maximum allowed nesting depth for any query or mutation. */
export const MAX_QUERY_DEPTH = 10;

/**
 * Maximum number of fields (leaves + branches) allowed in any operation.
 * This is a simple proxy for query complexity that requires no schema-aware
 * cost functions and works correctly with all field types.
 */
export const MAX_QUERY_COMPLEXITY = 200;

// ---------------------------------------------------------------------------
// Depth limiting
// ---------------------------------------------------------------------------

function measureDepth(
  selectionSet: SelectionSetNode | undefined,
  currentDepth: number,
  getFragment: (name: string) => FragmentDefinitionNode | undefined,
  visitedFragments: Set<string> = new Set(),
): number {
  if (!selectionSet) return currentDepth;

  return selectionSet.selections.reduce<number>((maxSoFar, selection) => {
    if (selection.kind === Kind.FRAGMENT_SPREAD) {
      // Follow named fragment spreads recursively so deeply-nested
      // fragment chains cannot bypass the depth limit.
      const fragName = selection.name.value;
      if (visitedFragments.has(fragName)) {
        // Cycle detected — skip to avoid infinite recursion.
        return maxSoFar;
      }
      const fragment = getFragment(fragName);
      if (!fragment) {
        // Unknown fragment — count conservatively as current depth + 1.
        return Math.max(maxSoFar, currentDepth + 1);
      }
      const newVisited = new Set(visitedFragments);
      newVisited.add(fragName);
      return Math.max(
        maxSoFar,
        measureDepth(
          fragment.selectionSet,
          currentDepth,
          getFragment,
          newVisited,
        ),
      );
    }

    if (selection.kind === Kind.INLINE_FRAGMENT) {
      // Inline fragments (... on Type { ... }) are type refinements, not
      // field nesting — recurse without incrementing depth.
      return Math.max(
        maxSoFar,
        measureDepth(
          selection.selectionSet,
          currentDepth,
          getFragment,
          visitedFragments,
        ),
      );
    }

    // Kind.FIELD — actual nesting level.
    const depthAtThisField = currentDepth + 1;
    const next = selection.selectionSet;

    const nestedDepth = next
      ? measureDepth(next, depthAtThisField, getFragment, visitedFragments)
      : depthAtThisField;

    return Math.max(maxSoFar, nestedDepth);
  }, currentDepth);
}

/**
 * Apollo Server validation rule that rejects operations whose nesting depth
 * exceeds `maxDepth`.
 */
export function queryDepthLimitRule(maxDepth: number) {
  return (context: ValidationContext) => ({
    OperationDefinition(operation: OperationDefinitionNode) {
      const getFragment = (name: string) =>
        context.getFragment(name) ?? undefined;
      const depth = measureDepth(operation.selectionSet, 0, getFragment);
      if (depth > maxDepth) {
        context.reportError(
          new GraphQLError(
            `Query depth ${depth} exceeds maximum allowed depth of ${maxDepth}.`,
            { nodes: [operation] },
          ),
        );
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Field-count (complexity proxy) limiting
// ---------------------------------------------------------------------------

/**
 * Count the fields in `selectionSet` the way GraphQL execution does: sibling
 * selections that share a response key (alias, else field name) are **merged**
 * into a single field whose sub-selections are likewise merged. A field selected
 * via several overlapping fragments is therefore counted once — matching the
 * single resolver call execution makes for it.
 *
 * Fragment spreads and inline fragments are flattened into the current level
 * before grouping, exactly as execution's field-collection step does.
 *
 * Why merge: the earlier implementation summed every fragment's fields
 * independently, which over-counted operations that spread multiple overlapping
 * fragments on the same type. The shared cross-platform `getMatchupPlayers`
 * query spreads both `...MatchupPlayer` and `...AppMatchupPlayer` (GraphQL
 * consolidation, LS-8009); summed that is ~284 fields and falsely trips the 200
 * limit, even though the merged query resolves ~150 distinct fields and the
 * whole matchup detail page silently failed to render (LS-8246). Merging removes
 * those false positives without weakening DoS protection: duplicate selections
 * never amplify real resolver cost, so collapsing them cannot let a genuinely
 * wide query through.
 */
function countFields(
  selectionSet: SelectionSetNode | undefined,
  getFragment: (name: string) => FragmentDefinitionNode | undefined,
  visitedFragments: Set<string> = new Set(),
): number {
  if (!selectionSet) return 0;

  // Group sibling field selections by response key, accumulating each field's
  // child selections so same-keyed fields merge into one (with merged children).
  const childrenByKey = new Map<string, SelectionNode[]>();
  let unknownFragmentCount = 0;

  const flatten = (
    selections: readonly SelectionNode[],
    visited: Set<string>,
  ): void => {
    for (const selection of selections) {
      if (selection.kind === Kind.FRAGMENT_SPREAD) {
        const fragName = selection.name.value;
        if (visited.has(fragName)) {
          // Cycle detected — skip to avoid infinite recursion.
          continue;
        }
        const fragment = getFragment(fragName);
        if (!fragment) {
          // Unknown fragment — count conservatively as 1 field.
          unknownFragmentCount += 1;
          continue;
        }
        const newVisited = new Set(visited);
        newVisited.add(fragName);
        flatten(fragment.selectionSet.selections, newVisited);
        continue;
      }

      if (selection.kind === Kind.INLINE_FRAGMENT) {
        // Inline fragments are type refinements — flatten their fields into
        // this level without an extra +1 for the wrapper itself.
        flatten(selection.selectionSet.selections, visited);
        continue;
      }

      // Kind.FIELD — merge by response key (alias wins over the field name).
      const key = selection.alias?.value ?? selection.name.value;
      const merged = childrenByKey.get(key);
      const childSelections = selection.selectionSet?.selections ?? [];
      if (merged) {
        merged.push(...childSelections);
      } else {
        childrenByKey.set(key, [...childSelections]);
      }
    }
  };

  flatten(selectionSet.selections, visitedFragments);

  let total = unknownFragmentCount;
  for (const childSelections of childrenByKey.values()) {
    total += 1; // the field itself
    if (childSelections.length > 0) {
      total += countFields(
        { kind: Kind.SELECTION_SET, selections: childSelections },
        getFragment,
        visitedFragments,
      );
    }
  }
  return total;
}

/**
 * Apollo Server validation rule that rejects operations whose total field
 * count exceeds `maxComplexity`.
 */
export function queryComplexityLimitRule(maxComplexity: number) {
  return (context: ValidationContext) => ({
    OperationDefinition(operation: OperationDefinitionNode) {
      const getFragment = (name: string) =>
        context.getFragment(name) ?? undefined;
      const complexity = countFields(operation.selectionSet, getFragment);
      if (complexity > maxComplexity) {
        context.reportError(
          new GraphQLError(
            `Query complexity ${complexity} exceeds maximum allowed complexity of ${maxComplexity}.`,
            { nodes: [operation] },
          ),
        );
      }
    },
  });
}
