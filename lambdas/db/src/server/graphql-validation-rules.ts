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

function countFields(
  selectionSet: SelectionSetNode | undefined,
  getFragment: (name: string) => FragmentDefinitionNode | undefined,
  visitedFragments: Set<string> = new Set(),
): number {
  if (!selectionSet) return 0;

  return selectionSet.selections.reduce<number>((total, selection) => {
    if (selection.kind === Kind.FRAGMENT_SPREAD) {
      const fragName = selection.name.value;
      if (visitedFragments.has(fragName)) {
        // Cycle detected — skip to avoid infinite recursion.
        return total;
      }
      const fragment = getFragment(fragName);
      if (!fragment) {
        // Unknown fragment — count conservatively as 1 field.
        return total + 1;
      }
      const newVisited = new Set(visitedFragments);
      newVisited.add(fragName);
      return (
        total + countFields(fragment.selectionSet, getFragment, newVisited)
      );
    }

    if (selection.kind === Kind.INLINE_FRAGMENT) {
      // Inline fragments are type refinements — count their fields but
      // don't add an extra +1 for the fragment wrapper itself.
      return (
        total +
        countFields(selection.selectionSet, getFragment, visitedFragments)
      );
    }

    // Kind.FIELD — count the field itself plus any nested selections.
    const nested = selection.selectionSet;
    return total + 1 + countFields(nested, getFragment, visitedFragments);
  }, 0);
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
