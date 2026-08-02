/**
 * Per-worker GraphQL mock server for hermetic **native** E2E runs
 * (ADR-0017 / ADR-0016 native rollout blueprint step 2 — LS-8448).
 *
 * ## Why this exists
 *
 * The native driver declares `networkMock: false` — there is no `page.route()`
 * on Android/Appium, so the web hermetic seam (`fixtures/api-isolation.ts`,
 * which fulfils `route`s in-process) cannot isolate a native run. The third
 * implementation of the ADR-0016 backend seam is therefore an **out-of-process**
 * one: a real HTTP server the emulator app talks to over the wire, serving the
 * SAME operation-name-keyed payloads the web mocks serve (the
 * `src/mocks/graphql/` factories, via the shared `BASELINE_GRAPHQL_RESPONSES`
 * map) — no forked fixtures.
 *
 * ## The in-process control surface (mirrors `page.route`)
 *
 * The server is created **inside the Playwright worker process** (see
 * `fixtures/native-mock.ts`), exactly where `MockTestData` calls `page.route()`
 * for web. So `NativeMockTestData` registers per-test overrides by calling
 * {@link GraphQLMockServer.override} directly — an in-process function call, the
 * native analogue of a layer-3 `route.fulfill()`. Only the **data plane** (the
 * app's GraphQL POSTs) crosses the process boundary; the app reaches it via
 * `adb reverse` (see `fixtures/native-mock.ts`). This keeps handler logic
 * (which inspects `variables`, e.g. the server-side discovery search) in TS in
 * the worker, not serialised across a control channel.
 *
 * ## Dispatch order (mirrors the web LIFO cascade)
 *
 *   1. a per-test **override** for the operation (layer 3), then
 *   2. the **baseline** response for the operation (layer 1), then
 *   3. **unmocked** — recorded and answered with `{ data: {} }` so the UI does
 *      not crash mid-test; the fixture fails the test afterwards if the list is
 *      non-empty (same contract as `withApiIsolation`).
 *
 * ## WebSocket / subscriptions (AC4)
 *
 * This server speaks HTTP only. A `subscription` operation is rejected **loudly**
 * with an explicit GraphQL error (never answered with empty data), and no WS
 * listener is opened. WebSocket-driven flows (e.g. the live draft) are declared
 * live-only on native via capability/fixture gating — see
 * `realtimeUnavailable` in `fixtures/native-mock.ts`.
 */
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';

/** A parsed GraphQL request, as seen by an operation handler. */
export interface GraphQLMockRequest {
  /** Operation name as sent by the client (`operationName` or `?ref=`). */
  readonly operationName: string;
  /** Lowercased {@link operationName} — the map/override key convention. */
  readonly op: string;
  /** The raw GraphQL document, when the client sends one. */
  readonly query: string;
  /** Parsed operation variables (`{}` when absent/unparseable). */
  readonly variables: Record<string, unknown>;
}

/**
 * An in-process handler for one operation. Returns the JSON response **body**
 * (e.g. `{ data: { ... } }`) — the exact object a `route.fulfill({ body })`
 * would carry on web. May inspect {@link GraphQLMockRequest.variables} to answer
 * server-side-filtered operations (mirrors `MockTestData.discoverySearch`).
 */
export type MockOperationHandler = (request: GraphQLMockRequest) => unknown;

export interface GraphQLMockServerOptions {
  /**
   * Operation-name-keyed (lowercased) default responses — the baseline layer.
   * Supplied by the fixture layer (`BASELINE_GRAPHQL_RESPONSES`) so this server
   * stays a generic transport with no dependency on the fixtures/factories (no
   * `mocks → fixtures` import cycle). A value may be a function of the
   * request's variables for ops whose safe default depends on an id (e.g. a
   * query that reuses another query's root field — see
   * `getmatchupwinprobability` in shared-mocks.ts for why a flat static
   * value can silently clobber an already-cached entity).
   */
  readonly baseline?: Readonly<
    Record<
      string,
      | Record<string, unknown>
      | ((variables: Record<string, unknown>) => Record<string, unknown>)
    >
  >;
  /** Host to bind (default `127.0.0.1` — the worker-local loopback). */
  readonly host?: string;
}

/** GraphQL error body for a subscription reaching the HTTP-only server (AC4). */
export function subscriptionRejectionBody(operationName: string): {
  data: null;
  errors: { message: string; extensions: { code: string } }[];
} {
  return {
    data: null,
    errors: [
      {
        message:
          `Operation "${operationName}" is a GraphQL subscription; the native ` +
          'mock server is HTTP-only and does not speak the WebSocket protocol. ' +
          'WebSocket-driven flows are live-only on native (AC4, LS-8448).',
        extensions: { code: 'SUBSCRIPTIONS_NOT_SUPPORTED' },
      },
    ],
  };
}

/** True when a GraphQL document's operation type is `subscription`. */
export function isSubscriptionDocument(query: string): boolean {
  // Strip leading comments/whitespace, then require the operation keyword.
  const stripped = query
    .replace(/#[^\n]*/g, '')
    .replace(/^\s+/, '')
    .trimStart();
  return /^subscription\b/i.test(stripped);
}

/**
 * A per-worker HTTP GraphQL mock. Generic transport: the baseline + overrides
 * carry all payload knowledge. Not exported through the `mocks/graphql` barrel
 * — it is a test-harness server, wired only by `fixtures/native-mock.ts`.
 */
export class GraphQLMockServer {
  readonly #baseline: Readonly<
    Record<
      string,
      | Record<string, unknown>
      | ((variables: Record<string, unknown>) => Record<string, unknown>)
    >
  >;
  readonly #host: string;
  readonly #overrides = new Map<string, MockOperationHandler>();
  readonly #unmocked: string[] = [];
  #server?: Server;
  #port = 0;

  constructor(options: GraphQLMockServerOptions = {}) {
    this.#baseline = options.baseline ?? {};
    this.#host = options.host ?? '127.0.0.1';
  }

  /** Start listening on an OS-assigned free port; resolves with that port. */
  async start(): Promise<{ port: number }> {
    if (this.#server) return { port: this.#port };
    const server = createServer((req, res) => {
      this.#handle(req, res).catch((err: unknown) => {
        // A handler that throws is a test-authoring bug — surface it as a 500
        // with the message so the failure is visible in the app's network log
        // rather than a silent hang.
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            errors: [
              { message: err instanceof Error ? err.message : String(err) },
            ],
          }),
        );
      });
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, this.#host, () => {
        server.removeListener('error', reject);
        resolve();
      });
    });
    this.#server = server;
    this.#port = (server.address() as AddressInfo).port;
    return { port: this.#port };
  }

  /** Stop the server and release the port. Idempotent. */
  async stop(): Promise<void> {
    const server = this.#server;
    if (!server) return;
    this.#server = undefined;
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }

  /** The bound port (0 until {@link start} resolves). */
  get port(): number {
    return this.#port;
  }

  /** The GraphQL endpoint URL on the worker-local loopback. */
  get url(): string {
    return `http://${this.#host}:${this.#port}/graphql`;
  }

  /**
   * Register an in-process handler for `operationName` (case-insensitive) — the
   * native analogue of a layer-3 `route.fulfill()` override. Last registration
   * wins, mirroring Playwright's LIFO route precedence for a single operation.
   */
  override(operationName: string, handler: MockOperationHandler): void {
    this.#overrides.set(operationName.toLowerCase(), handler);
  }

  /** Drop all per-test overrides and the unmocked-operation log. */
  reset(): void {
    this.#overrides.clear();
    this.#unmocked.length = 0;
  }

  /** Operations that hit neither an override nor the baseline (deduped). */
  get unmockedOperations(): string[] {
    return [...new Set(this.#unmocked)];
  }

  async #handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // Readiness probe for the CI runner / adb-reverse wait loop.
    if (req.method === 'GET' && (req.url ?? '').startsWith('/__mock/health')) {
      this.#json(res, 200, { ok: true });
      return;
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end();
      return;
    }
    if (req.method !== 'POST') {
      this.#json(res, 405, { errors: [{ message: 'Method Not Allowed' }] });
      return;
    }

    const request = parseGraphQLBody(await readBody(req), req.url ?? '');

    if (isSubscriptionDocument(request.query)) {
      // Loud rejection — never an empty-data silent pass (AC4).
      this.#json(res, 200, subscriptionRejectionBody(request.operationName));
      return;
    }

    const override = this.#overrides.get(request.op);
    if (override) {
      this.#json(res, 200, override(request));
      return;
    }

    const baseline = this.#baseline[request.op];
    if (baseline) {
      this.#json(
        res,
        200,
        typeof baseline === 'function' ? baseline(request.variables) : baseline,
      );
      return;
    }

    // Unknown operation: record it (the fixture fails the test afterwards) and
    // return empty data so the app does not crash mid-test via error boundary.
    this.#unmocked.push(request.operationName);
    this.#json(res, 200, { data: {} });
  }

  #json(res: ServerResponse, status: number, body: unknown): void {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  }
}

/** Read a request body to a string (bounded by Node's default socket limits). */
async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * Parse an Apollo GraphQL POST body into a {@link GraphQLMockRequest}. The
 * operation name comes from the JSON `operationName`, falling back to the
 * `?ref=<op>` query parameter the native `DbClient` appends to every request
 * URI (`apps/app/src/common/auth/DbClient.ts`).
 */
export function parseGraphQLBody(raw: string, url: string): GraphQLMockRequest {
  let parsed: {
    operationName?: string;
    query?: string;
    variables?: Record<string, unknown>;
  } = {};
  try {
    parsed = JSON.parse(raw) as typeof parsed;
  } catch {
    parsed = {};
  }
  let operationName = parsed.operationName ?? '';
  if (!operationName) {
    const ref = /[?&]ref=([^&]+)/.exec(url);
    if (ref) operationName = decodeURIComponent(ref[1]);
  }
  return {
    operationName,
    op: operationName.toLowerCase(),
    query: parsed.query ?? '',
    variables: parsed.variables ?? {},
  };
}
