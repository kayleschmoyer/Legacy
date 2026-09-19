/**
 * Static extractor for the Legacy Sports MCP tool surface.
 *
 * Parses every MCP server entrypoint under tools/mcp/ with the TypeScript
 * compiler API and pulls out each registered tool: its name, description, and
 * input schema. Static parsing (rather than booting the servers and calling
 * tools/list) is deliberate — three of the servers are auth-gated Lambdas that
 * cannot be introspected without a Cognito bearer, and this way the reference
 * regenerates in CI with no credentials and no network.
 *
 * Handles the four registration shapes used in this repo:
 *   1. server.tool(name, description, zodShape, handler)      — most servers
 *   2. server.tool(name, description, handler)                — no-arg tools
 *   3. server.registerTool(name, { description, inputSchema }, handler)
 *   4. server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: [...] }))
 *      with hand-written JSON Schema literals (worktree-server)
 */
import ts from 'typescript';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Default reader — plain disk access. `collectAtRef` (collect.mjs) swaps this
 * for a reader backed by `git show`/`git ls-tree` so a historical ref can be
 * measured without a worktree or checkout.
 */
export const fsReader = {
  exists(path) {
    try {
      readFileSync(path, 'utf-8');
      return true;
    } catch {
      return false;
    }
  },
  readFile(path) {
    try {
      return readFileSync(path, 'utf-8');
    } catch {
      return undefined;
    }
  },
  listFiles(dir) {
    try {
      return readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name);
    } catch {
      return [];
    }
  },
};

/* ------------------------------------------------------------------ *
 * Literal evaluation
 * ------------------------------------------------------------------ */

const UNRESOLVED = Symbol('unresolved');

/** Evaluate a statically-analyzable expression to a plain JS value. */
function evalLiteral(node) {
  if (!node) return UNRESOLVED;

  switch (node.kind) {
    case ts.SyntaxKind.StringLiteral:
    case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
      return node.text;
    case ts.SyntaxKind.NumericLiteral:
      return Number(node.text);
    case ts.SyntaxKind.TrueKeyword:
      return true;
    case ts.SyntaxKind.FalseKeyword:
      return false;
    case ts.SyntaxKind.NullKeyword:
      return null;
    default:
      break;
  }

  if (ts.isAsExpression(node) || ts.isSatisfiesExpression(node)) {
    return evalLiteral(node.expression);
  }
  if (ts.isParenthesizedExpression(node)) return evalLiteral(node.expression);

  if (ts.isPrefixUnaryExpression(node)) {
    const inner = evalLiteral(node.operand);
    if (typeof inner === 'number') {
      if (node.operator === ts.SyntaxKind.MinusToken) return -inner;
      if (node.operator === ts.SyntaxKind.PlusToken) return inner;
    }
    return UNRESOLVED;
  }

  // String concatenation — descriptions in this repo are frequently built as
  // 'line one ' + 'line two' across many source lines.
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    const left = evalLiteral(node.left);
    const right = evalLiteral(node.right);
    if (left === UNRESOLVED || right === UNRESOLVED) return UNRESOLVED;
    if (typeof left === 'string' || typeof right === 'string') {
      return `${left}${right}`;
    }
    if (typeof left === 'number' && typeof right === 'number') {
      return left + right;
    }
    return UNRESOLVED;
  }

  if (ts.isArrayLiteralExpression(node)) {
    const out = [];
    for (const el of node.elements) {
      const value = evalLiteral(el);
      if (value === UNRESOLVED) return UNRESOLVED;
      out.push(value);
    }
    return out;
  }

  if (ts.isObjectLiteralExpression(node)) {
    const out = {};
    for (const prop of node.properties) {
      if (!ts.isPropertyAssignment(prop)) return UNRESOLVED;
      const key = propertyName(prop.name);
      if (key === undefined) return UNRESOLVED;
      const value = evalLiteral(prop.initializer);
      if (value === UNRESOLVED) return UNRESOLVED;
      out[key] = value;
    }
    return out;
  }

  return UNRESOLVED;
}

function propertyName(name) {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  if (ts.isNumericLiteral(name)) return name.text;
  return undefined;
}

/**
 * Resolve a description expression to text. Descriptions here are routinely
 * built from concatenated string literals and template literals that splice in
 * a limit constant; both are resolved, and an unresolvable hole is left as
 * `\${NAME}` rather than losing the whole description.
 */
function evalDescription(node, ctx) {
  if (!node) return '';

  if (ts.isAsExpression(node) || ts.isParenthesizedExpression(node)) {
    return evalDescription(node.expression, ctx);
  }

  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    return `${evalDescription(node.left, ctx)}${evalDescription(node.right, ctx)}`;
  }

  if (ts.isTemplateExpression(node)) {
    let text = node.head.text;
    for (const span of node.templateSpans) {
      text += `${resolveSpan(span.expression, ctx)}${span.literal.text}`;
    }
    return text;
  }

  const value = evalLiteral(node);
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value);
  return `\${${node.getText(ctx.sourceFile)}}`;
}

function resolveSpan(expression, ctx) {
  const direct = evalLiteral(expression);
  if (direct !== UNRESOLVED && direct !== null && typeof direct !== 'object') {
    return String(direct);
  }
  if (ts.isIdentifier(expression)) {
    const constant = ctx.constants.get(expression.text);
    const value = constant ? evalLiteral(constant) : UNRESOLVED;
    if (value !== UNRESOLVED && value !== null && typeof value !== 'object') {
      return String(value);
    }
  }
  return `\${${expression.getText(ctx.sourceFile)}}`;
}

/** Evaluate to a string, falling back to trimmed source text. */
function evalString(node, sourceFile) {
  const value = evalLiteral(node);
  if (typeof value === 'string') return value;
  return node ? node.getText(sourceFile) : '';
}

/**
 * Tolerant variant of evalLiteral: unresolvable object properties and array
 * elements are dropped rather than failing the whole literal. Used for the
 * hand-written JSON Schema literals, where a stray computed value should not
 * cost us the entire tool definition.
 */
function evalLiteralLoose(node) {
  if (!node) return undefined;

  if (ts.isAsExpression(node) || ts.isSatisfiesExpression(node)) {
    return evalLiteralLoose(node.expression);
  }
  if (ts.isParenthesizedExpression(node))
    return evalLiteralLoose(node.expression);

  if (ts.isArrayLiteralExpression(node)) {
    const out = [];
    for (const el of node.elements) {
      if (ts.isSpreadElement(el)) continue;
      const value = evalLiteralLoose(el);
      if (value !== undefined) out.push(value);
    }
    return out;
  }

  if (ts.isObjectLiteralExpression(node)) {
    const out = {};
    for (const prop of node.properties) {
      if (!ts.isPropertyAssignment(prop)) continue;
      const key = propertyName(prop.name);
      if (key === undefined) continue;
      const value = evalLiteralLoose(prop.initializer);
      if (value !== undefined) out[key] = value;
    }
    return out;
  }

  if (ts.isTemplateExpression(node)) {
    // Template with substitutions — keep the literal chunks so the prose
    // survives, marking the interpolated holes.
    let text = node.head.text;
    for (const span of node.templateSpans) text += `\${…}${span.literal.text}`;
    return text;
  }

  const value = evalLiteral(node);
  return value === UNRESOLVED ? undefined : value;
}

/* ------------------------------------------------------------------ *
 * Zod schema rendering
 * ------------------------------------------------------------------ */

/**
 * Reduce a zod expression to a documentation descriptor:
 *   { type, description, optional, default, enum, items, properties, constraints }
 */
function describeZod(node, ctx) {
  const descriptor = {
    type: 'unknown',
    optional: false,
    constraints: [],
  };
  walkZod(node, descriptor, ctx);
  if (descriptor.constraints.length === 0) delete descriptor.constraints;
  return descriptor;
}

function walkZod(node, descriptor, ctx) {
  if (!node) return;

  if (ts.isAsExpression(node) || ts.isSatisfiesExpression(node)) {
    return walkZod(node.expression, descriptor, ctx);
  }
  if (ts.isParenthesizedExpression(node)) {
    return walkZod(node.expression, descriptor, ctx);
  }

  // A bare identifier — a shared schema declared elsewhere in the file.
  if (ts.isIdentifier(node)) {
    const resolved = ctx.constants.get(node.text);
    if (resolved && !ctx.resolving.has(node.text)) {
      ctx.resolving.add(node.text);
      walkZod(resolved, descriptor, ctx);
      ctx.resolving.delete(node.text);
      return;
    }
    descriptor.type =
      descriptor.type === 'unknown' ? node.text : descriptor.type;
    return;
  }

  if (!ts.isCallExpression(node)) {
    if (descriptor.type === 'unknown') {
      descriptor.type = node.getText(ctx.sourceFile).replace(/\s+/g, ' ');
    }
    return;
  }

  // A call to a local schema factory, e.g. prNumberField('prNumber') — inline
  // the function's returned zod expression.
  if (ts.isIdentifier(node.expression)) {
    const factory = ctx.functions.get(node.expression.text);
    if (factory && !ctx.resolving.has(node.expression.text)) {
      ctx.resolving.add(node.expression.text);
      walkZod(factory, descriptor, ctx);
      ctx.resolving.delete(node.expression.text);
      return;
    }
  }

  const callee = node.expression;
  if (!ts.isPropertyAccessExpression(callee)) {
    if (descriptor.type === 'unknown') {
      descriptor.type = node.getText(ctx.sourceFile).replace(/\s+/g, ' ');
    }
    return;
  }

  const method = callee.name.text;
  const receiver = callee.expression;
  const args = node.arguments;

  // Base constructors: z.<method>(...)
  if (ts.isIdentifier(receiver) && receiver.text === 'z') {
    applyZodBase(method, args, descriptor, ctx);
    return;
  }

  // z.coerce.<method>(...) — same base types, values coerced on the way in.
  if (
    ts.isPropertyAccessExpression(receiver) &&
    ts.isIdentifier(receiver.expression) &&
    receiver.expression.text === 'z' &&
    receiver.name.text === 'coerce'
  ) {
    applyZodBase(method, args, descriptor, ctx);
    descriptor.constraints.push('coerced');
    return;
  }

  // Chained modifier — recurse into the receiver first so the base type is
  // known, then layer this modifier on top.
  walkZod(receiver, descriptor, ctx);
  applyZodModifier(method, args, descriptor, ctx);
}

function applyZodBase(method, args, descriptor, ctx) {
  switch (method) {
    case 'string':
    case 'number':
    case 'boolean':
    case 'bigint':
    case 'date':
      descriptor.type = method;
      return;
    case 'any':
    case 'unknown':
      descriptor.type = 'any';
      return;
    case 'never':
    case 'void':
    case 'null':
    case 'undefined':
      descriptor.type = method;
      return;
    case 'literal': {
      const value = evalLiteral(args[0]);
      descriptor.type = 'literal';
      descriptor.enum = value === UNRESOLVED ? [] : [value];
      return;
    }
    case 'enum': {
      descriptor.type = 'enum';
      const value = evalLiteral(args[0]);
      descriptor.enum = Array.isArray(value)
        ? value
        : args.map((a) => evalString(a, ctx.sourceFile));
      return;
    }
    case 'array':
      descriptor.type = 'array';
      descriptor.items = describeZod(args[0], ctx);
      return;
    case 'object':
      descriptor.type = 'object';
      descriptor.properties = describeShape(args[0], ctx);
      return;
    case 'record':
      descriptor.type = 'record';
      descriptor.items = args.length
        ? describeZod(args[args.length - 1], ctx)
        : undefined;
      return;
    case 'union':
    case 'discriminatedUnion': {
      descriptor.type = 'union';
      const listArg = method === 'union' ? args[0] : args[1];
      if (listArg && ts.isArrayLiteralExpression(listArg)) {
        descriptor.variants = listArg.elements.map((el) =>
          describeZod(el, ctx),
        );
      }
      return;
    }
    case 'preprocess':
      // z.preprocess(coerce, <realSchema>) — document the target schema.
      walkZod(args[1], descriptor, ctx);
      return;
    case 'coerce':
      descriptor.type = 'coerced';
      return;
    case 'lazy':
      descriptor.type = 'lazy';
      return;
    default:
      descriptor.type = method;
  }
}

function applyZodModifier(method, args, descriptor, ctx) {
  switch (method) {
    case 'optional':
      descriptor.optional = true;
      return;
    case 'nullable':
    case 'nullish':
      descriptor.nullable = true;
      if (method === 'nullish') descriptor.optional = true;
      return;
    case 'describe': {
      const text = evalDescription(args[0], ctx);
      if (text) descriptor.description = text;
      return;
    }
    case 'default': {
      const value = evalLiteral(args[0]);
      descriptor.default =
        value === UNRESOLVED ? evalString(args[0], ctx.sourceFile) : value;
      descriptor.optional = true;
      return;
    }
    case 'array':
      descriptor.items = { ...descriptor, constraints: descriptor.constraints };
      descriptor.type = 'array';
      delete descriptor.properties;
      delete descriptor.enum;
      descriptor.constraints = [];
      return;
    case 'int':
      descriptor.constraints.push('integer');
      return;
    case 'positive':
      descriptor.constraints.push('> 0');
      return;
    case 'nonnegative':
      descriptor.constraints.push('>= 0');
      return;
    case 'negative':
      descriptor.constraints.push('< 0');
      return;
    case 'min':
    case 'max': {
      const value = evalLiteral(args[0]);
      if (value !== UNRESOLVED) {
        descriptor.constraints.push(`${method} ${value}`);
      } else {
        descriptor.constraints.push(
          `${method} ${evalString(args[0], ctx.sourceFile)}`,
        );
      }
      return;
    }
    case 'length': {
      const value = evalLiteral(args[0]);
      if (value !== UNRESOLVED) descriptor.constraints.push(`length ${value}`);
      return;
    }
    case 'regex': {
      const text = args[0] ? args[0].getText(args[0].getSourceFile()) : '';
      descriptor.constraints.push(`matches ${text}`);
      return;
    }
    case 'url':
    case 'uuid':
    case 'email':
    case 'cuid':
    case 'datetime':
      descriptor.constraints.push(method);
      return;
    case 'trim':
    case 'toLowerCase':
    case 'toUpperCase':
    case 'transform':
    case 'refine':
    case 'superRefine':
    case 'pipe':
    case 'catch':
    case 'brand':
    case 'readonly':
      return;
    case 'strict':
    case 'passthrough':
    case 'strip':
      return;
    case 'extend':
    case 'merge': {
      const extra = describeShape(args[0], ctx);
      descriptor.properties = { ...(descriptor.properties ?? {}), ...extra };
      return;
    }
    case 'partial':
      for (const prop of Object.values(descriptor.properties ?? {})) {
        prop.optional = true;
      }
      return;
    case 'shape':
      return;
    default:
      descriptor.constraints.push(method);
  }
}

/** Turn a `{ key: z.string()… }` object literal into a properties map. */
function describeShape(node, ctx) {
  const properties = {};
  if (!node) return properties;

  let target = node;
  if (ts.isAsExpression(target) || ts.isSatisfiesExpression(target)) {
    target = target.expression;
  }

  // z.object({...}) passed where a raw shape is expected.
  if (ts.isCallExpression(target)) {
    const descriptor = describeZod(target, ctx);
    return descriptor.properties ?? properties;
  }

  if (ts.isIdentifier(target)) {
    const resolved = ctx.constants.get(target.text);
    if (resolved && !ctx.resolving.has(target.text)) {
      ctx.resolving.add(target.text);
      const out = describeShape(resolved, ctx);
      ctx.resolving.delete(target.text);
      return out;
    }
    return properties;
  }

  if (!ts.isObjectLiteralExpression(target)) return properties;

  for (const prop of target.properties) {
    if (ts.isPropertyAssignment(prop)) {
      const key = propertyName(prop.name);
      if (key === undefined) continue;
      properties[key] = describeZod(prop.initializer, ctx);
    } else if (ts.isSpreadAssignment(prop)) {
      Object.assign(properties, describeShape(prop.expression, ctx));
    }
  }
  return properties;
}

/* ------------------------------------------------------------------ *
 * JSON Schema rendering (worktree-server's hand-written literals)
 * ------------------------------------------------------------------ */

function describeJsonSchema(schema) {
  const descriptor = { type: 'unknown', optional: true, constraints: [] };
  if (!schema || typeof schema !== 'object') return descriptor;

  if (Array.isArray(schema.anyOf) || Array.isArray(schema.oneOf)) {
    descriptor.type = 'union';
    descriptor.variants = (schema.anyOf ?? schema.oneOf).map(
      describeJsonSchema,
    );
  } else if (typeof schema.type === 'string') {
    descriptor.type = schema.type === 'integer' ? 'number' : schema.type;
    if (schema.type === 'integer') descriptor.constraints.push('integer');
  }

  if (schema.description) descriptor.description = schema.description;
  if (schema.enum) {
    descriptor.enum = schema.enum;
    if (descriptor.type === 'unknown') descriptor.type = 'enum';
  }
  if (schema.default !== undefined) descriptor.default = schema.default;
  if (schema.items) {
    descriptor.items = describeJsonSchema(schema.items);
    // Array items have no "optional" concept in JSON Schema the way object
    // properties do (there's no analogue of a `required` list for items) —
    // describeJsonSchema's default `optional: true` seed is only meaningful
    // for object properties, where it's overridden below by the parent's
    // `required` array. Left unset here, every array's items were
    // incorrectly reported as optional in the generated reference (LS-9749
    // bot-review finding on PR #7835 — pre-existing, affects every raw
    // JSON-Schema array field, not just newly added ones).
    descriptor.items.optional = false;
  }
  if (schema.properties) {
    descriptor.properties = {};
    for (const [key, value] of Object.entries(schema.properties)) {
      const child = describeJsonSchema(value);
      child.optional = !(schema.required ?? []).includes(key);
      descriptor.properties[key] = child;
    }
  }
  if (typeof schema.minimum === 'number') {
    descriptor.constraints.push(`min ${schema.minimum}`);
  }
  if (typeof schema.maximum === 'number') {
    descriptor.constraints.push(`max ${schema.maximum}`);
  }
  if (descriptor.constraints.length === 0) delete descriptor.constraints;
  return descriptor;
}

/* ------------------------------------------------------------------ *
 * Source-file scanning
 * ------------------------------------------------------------------ */

function returnExpressionOf(node) {
  if (ts.isArrowFunction(node) && !ts.isBlock(node.body)) return node.body;
  const body = ts.isBlock(node.body) ? node.body : undefined;
  if (!body) return undefined;
  let found;
  const visit = (child) => {
    if (ts.isReturnStatement(child) && child.expression)
      found = child.expression;
    if (!ts.isFunctionLike(child) || child === node)
      ts.forEachChild(child, visit);
  };
  ts.forEachChild(body, visit);
  return found;
}

/**
 * Top-level `const` initializers and schema-factory return expressions, so a
 * parameter declared as a shared helper (`jiraKeysSchema`, `prNumberField(…)`)
 * still documents as its underlying zod type.
 */
function collectDeclarations(sourceFile, constants, functions) {
  const visit = (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer
    ) {
      const name = node.name.text;
      const init = node.initializer;
      if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) {
        const returned = returnExpressionOf(init);
        if (returned && !functions.has(name)) functions.set(name, returned);
      } else if (!constants.has(name)) {
        constants.set(name, init);
      }
    }
    if (ts.isFunctionDeclaration(node) && node.name) {
      const returned = returnExpressionOf(node);
      if (returned && !functions.has(node.name.text)) {
        functions.set(node.name.text, returned);
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sourceFile, visit);
}

function parseSource(filePath, content) {
  return ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
}

/**
 * Declarations from sibling modules in the same server package. Schemas shared
 * across tools live in files like `src/schemas.ts`; without these the shared
 * parameters would document as a bare identifier.
 */
function collectPackageDeclarations(entryPath, constants, functions, reader) {
  const dir = dirname(entryPath);
  for (const name of reader.listFiles(dir)) {
    if (!name.endsWith('.ts') || name.endsWith('.spec.ts')) continue;
    const path = join(dir, name);
    if (path === entryPath) continue;
    const content = reader.readFile(path);
    if (content === undefined) continue;
    try {
      collectDeclarations(parseSource(path, content), constants, functions);
    } catch {
      // A sibling that fails to parse simply contributes nothing.
    }
  }
}

/**
 * Extract every tool registered in one source file.
 *
 * @param {string} filePath
 * @param {{exists(path: string): boolean, readFile(path: string): string | undefined, listFiles(dir: string): string[]}} [reader]
 *   Defaults to plain disk access; pass a git-backed reader (collect.mjs) to
 *   extract from a historical ref instead of the working tree.
 */
export function extractToolsFromFile(filePath, reader = fsReader) {
  const content = reader.readFile(filePath);
  if (content === undefined) return { serverInfo: undefined, tools: [] };
  const sourceFile = parseSource(filePath, content);
  const constants = new Map();
  const functions = new Map();
  collectDeclarations(sourceFile, constants, functions);
  collectPackageDeclarations(filePath, constants, functions, reader);
  const ctx = { sourceFile, constants, functions, resolving: new Set() };

  const tools = [];
  let serverInfo;

  const visit = (node) => {
    if (ts.isNewExpression(node) && !serverInfo) {
      const name = node.expression.getText(sourceFile);
      if (name === 'McpServer' || name === 'Server') {
        const meta = evalLiteral(node.arguments?.[0]);
        if (meta !== UNRESOLVED && meta && typeof meta === 'object') {
          serverInfo = { name: meta.name, version: meta.version };
        }
      }
    }

    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression)
    ) {
      const method = node.expression.name.text;
      const args = node.arguments;

      if (method === 'tool' && args.length >= 2) {
        const name = evalLiteral(args[0]);
        if (typeof name === 'string') {
          tools.push(readToolOverload(name, args, ctx, sourceFile));
        }
      } else if (method === 'registerTool' && args.length >= 2) {
        const name = evalLiteral(args[0]);
        if (typeof name === 'string') {
          tools.push(readRegisterTool(name, args, ctx));
        }
      } else if (method === 'setRequestHandler') {
        const first = args[0]?.getText(sourceFile);
        if (first === 'ListToolsRequestSchema') {
          tools.push(...readListToolsHandler(args[1]));
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  ts.forEachChild(sourceFile, visit);
  return { serverInfo, tools };
}

function readToolOverload(name, args, ctx, sourceFile) {
  // tool(name, description, shape, handler) | tool(name, description, handler)
  // | tool(name, shape, handler)
  const describesTool =
    ts.isStringLiteralLike(args[1]) ||
    ts.isTemplateExpression(args[1]) ||
    ts.isBinaryExpression(args[1]);
  const second = describesTool
    ? evalDescription(args[1], ctx)
    : evalLiteral(args[1]);

  if (typeof second === 'string') {
    const third = args[2];
    const isShape =
      third &&
      (ts.isObjectLiteralExpression(third) ||
        (ts.isCallExpression(third) &&
          third.expression.getText(sourceFile).startsWith('z.')));
    return {
      name,
      description: second,
      inputs: isShape ? describeShape(third, ctx) : {},
    };
  }

  return { name, description: '', inputs: describeShape(args[1], ctx) };
}

function readRegisterTool(name, args, ctx) {
  const config = args[1];
  const tool = { name, description: '', inputs: {} };
  if (!config || !ts.isObjectLiteralExpression(config)) return tool;

  for (const prop of config.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    const key = propertyName(prop.name);
    if (key === 'description' || key === 'title') {
      const text = evalDescription(prop.initializer, ctx);
      if (text && (key === 'description' || !tool.description)) {
        tool.description = text;
      }
    } else if (key === 'inputSchema') {
      tool.inputs = describeShape(prop.initializer, ctx);
    } else if (key === 'annotations') {
      const value = evalLiteral(prop.initializer);
      if (value !== UNRESOLVED) tool.annotations = value;
    }
  }
  return tool;
}

function readListToolsHandler(handler) {
  if (!handler) return [];
  const tools = [];

  const visit = (node) => {
    if (ts.isPropertyAssignment(node) && propertyName(node.name) === 'tools') {
      const entries = evalLiteralLoose(node.initializer);
      if (Array.isArray(entries)) {
        for (const entry of entries) {
          if (!entry || typeof entry.name !== 'string') continue;
          const schema = describeJsonSchema(entry.inputSchema ?? {});
          tools.push({
            name: entry.name,
            description: entry.description ?? '',
            inputs: schema.properties ?? {},
          });
        }
      }
      return;
    }
    ts.forEachChild(node, visit);
  };

  visit(handler);
  return tools;
}
