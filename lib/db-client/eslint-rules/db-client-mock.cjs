/**
 * `db-client-mock` (LS-10079): every `jest.mock` / `jest.doMock` /
 * `jest.setMock` factory of `@legacy-sports/db-client` must build its module
 * with `mockDbClientModule(...)`, and every `drizzle-orm` factory with
 * `mockDrizzleOrm(...)` or a `jest.requireActual('drizzle-orm')` spread
 * (lib/db-client/src/testing/db-client-module.testkit.ts). Repo-wide: wired
 * into the root eslint.config.mjs (LS-10498).
 *
 * A hand-written factory replaces the whole module with only what the spec
 * listed. Schema modules imported through it then see missing exports and
 * tables, and one that reads a table at module load crashes dozens of
 * unrelated suites at import time. This rule turns that into a lint error at
 * pc-lint time instead of a CI test failure.
 */

/** Mocked module → what its factory must contain. */
const GUARDED = {
  '@legacy-sports/db-client': { helper: 'mockDbClientModule', actual: false },
  // db-client's table definitions call drizzle's `sql` at load, so a real
  // db-client needs a complete drizzle underneath.
  'drizzle-orm': { helper: 'mockDrizzleOrm', actual: true },
};

/** Is `node` a call to `name(...)`, or to `jest.requireActual(moduleName)`? */
function isAllowedCall(node, helper, moduleName) {
  if (node.type !== 'CallExpression') return false;
  if (node.callee.type === 'Identifier' && node.callee.name === helper) {
    return true;
  }
  return (
    moduleName !== null &&
    node.callee.type === 'MemberExpression' &&
    node.callee.object.type === 'Identifier' &&
    node.callee.object.name === 'jest' &&
    node.callee.property.type === 'Identifier' &&
    node.callee.property.name === 'requireActual' &&
    node.arguments[0]?.type === 'Literal' &&
    node.arguments[0].value === moduleName
  );
}

/** Does any node under `root` build the module the sanctioned way? */
function buildsFullModule(root, helper, moduleName) {
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (isAllowedCall(node, helper, moduleName)) return true;
    for (const [key, value] of Object.entries(node)) {
      if (key === 'parent') continue;
      const children = Array.isArray(value) ? value : [value];
      for (const child of children) {
        if (child && typeof child.type === 'string') stack.push(child);
      }
    }
  }
  return false;
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require mockDbClientModule() / mockDrizzleOrm() for db-client and drizzle-orm jest mock factories',
    },
    schema: [],
    messages: {
      partialMock:
        'Build the {{module}} mock with {{helper}}({ ...overrides }) — a ' +
        'hand-written factory replaces the whole module, and any module that ' +
        'reads an export it does not list crashes at import time (LS-10079). ' +
        'See lib/db-client/src/testing/db-client-module.testkit.ts.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const { callee } = node;
        if (
          callee.type !== 'MemberExpression' ||
          callee.object.type !== 'Identifier' ||
          callee.object.name !== 'jest' ||
          callee.property.type !== 'Identifier' ||
          !['mock', 'doMock', 'setMock'].includes(callee.property.name)
        ) {
          return;
        }
        const [target, factory] = node.arguments;
        if (!target || target.type !== 'Literal') return;
        const guard = GUARDED[target.value];
        if (!guard) return;
        // No factory: jest's automock keeps the module's full shape.
        if (!factory) return;
        const moduleName = guard.actual ? target.value : null;
        if (!buildsFullModule(factory, guard.helper, moduleName)) {
          context.report({
            node: factory,
            messageId: 'partialMock',
            data: { module: target.value, helper: guard.helper },
          });
        }
      },
    };
  },
};
