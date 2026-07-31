import type {
  APIGatewayProxyResultV2,
  APIGatewayProxyWebsocketEventV2,
} from 'aws-lambda';
import { WebSocketServer, type WebSocket as WsSocket } from 'ws';
import { createServer, type Server } from 'node:http';
import type { IncomingMessage } from 'node:http';
import type { Socket } from 'node:net';

export type WebSocketHandler = (
  event: APIGatewayProxyWebsocketEventV2,
) => Promise<APIGatewayProxyResultV2>;

let connectionCounter = 0;

function buildEvent(
  routeKey: '$connect' | '$disconnect' | '$default',
  connectionId: string,
  domainName: string,
  stage: string,
  overrides: {
    queryStringParameters?: Record<string, string>;
    headers?: Record<string, string>;
    body?: string | null;
  } = {},
): APIGatewayProxyWebsocketEventV2 {
  return {
    requestContext: {
      routeKey,
      connectionId,
      domainName,
      stage,
      messageId: `msg-${connectionId}`,
      eventType: routeKey === '$connect' ? 'CONNECT' : 'MESSAGE',
      extendedRequestId: `ext-${connectionId}`,
      requestTime: new Date().toISOString(),
      messageDirection: 'IN',
      connectedAt: Date.now(),
      requestTimeEpoch: Date.now(),
      requestId: `req-${connectionId}-${Date.now()}`,
      apiId: 'local-test-api',
    },
    headers: overrides.headers ?? {},
    queryStringParameters: overrides.queryStringParameters,
    body: overrides.body ?? null,
    isBase64Encoded: false,
  } as unknown as APIGatewayProxyWebsocketEventV2;
}

/**
 * A local `ws` server that bridges real WebSocket connections to the real
 * `lambdas/websocket` Lambda handler (`$connect`/`$default`/`$disconnect`),
 * so genuine `WebSocketClient` instances (lib/websocket-client) can be tested
 * against the actual connect/auth/message/disconnect contract without a live
 * API Gateway. The Lambda handler's AWS SDK clients (`DynamoDBClient`,
 * `ApiGatewayManagementApiClient`) must still be faked by the caller — this
 * bridge only owns the raw-socket <-> Lambda-event translation and the
 * connectionId -> socket registry a fake `ApiGatewayManagementApiClient`
 * needs to deliver `PostToConnectionCommand` pushes to a real client socket
 * (see `deliver`).
 *
 * **Handshake ordering mirrors real API Gateway, not `ws`'s default.**
 * API Gateway runs `$connect` synchronously as part of the WebSocket
 * handshake: a non-2xx response fails the HTTP Upgrade itself, so the
 * client's `onopen` never fires. `ws`'s default `WebSocketServer` completes
 * the Upgrade unconditionally before emitting `'connection'`, which would let
 * every client observe `connected` even when `$connect` is about to reject
 * it. To avoid that false positive, this bridge takes over the Upgrade by
 * hand (`noServer: true` + an `http.Server` `'upgrade'` listener): it calls
 * the handler FIRST, and only calls `wss.handleUpgrade` (which sends the 101
 * response) if the handler returns 200 — otherwise it writes a raw HTTP
 * error response and destroys the socket, so a rejected client only ever
 * sees a failed connection attempt, never a spurious `open`.
 *
 * One accepted consequence: a `$connect` handler's own push back to the
 * connecting client (e.g. the production handler's USER_LIST presence
 * message) fires before the socket is registered here, so it is silently
 * dropped in this harness. The production code already treats presence
 * pushes as best-effort (wrapped in a non-fatal try/catch), so this does not
 * affect connection success — it just means presence pushed at connect time
 * isn't observable through this harness. This test suite does not assert on
 * presence messages.
 */
export class LocalWsBridge {
  private readonly sockets = new Map<string, WsSocket>();
  readonly domainName = 'localhost';
  readonly stage = 'test';

  private constructor(
    private readonly httpServer: Server,
    private readonly wss: WebSocketServer,
    private readonly handler: WebSocketHandler,
  ) {
    this.httpServer.on('upgrade', (req, socket, head) => {
      void this.onUpgrade(req, socket, head);
    });
  }

  static async start(handler: WebSocketHandler): Promise<LocalWsBridge> {
    const httpServer = createServer();
    const wss = new WebSocketServer({ noServer: true });
    const bridge = new LocalWsBridge(httpServer, wss, handler);
    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', resolve);
    });
    return bridge;
  }

  get port(): number {
    const address = this.httpServer.address();
    if (!address || typeof address === 'string') {
      throw new Error('LocalWsBridge: server has no bound address');
    }
    return address.port;
  }

  get url(): string {
    return `ws://127.0.0.1:${this.port}`;
  }

  /**
   * Deliver raw bytes to a connected client — what the fake
   * `ApiGatewayManagementApiClient` calls on `PostToConnectionCommand`.
   * Returns false (the real API's 410 Gone shape) when the connectionId is
   * not currently registered, e.g. after unsubscribe/disconnect.
   */
  deliver(connectionId: string, data: Buffer | Uint8Array | string): boolean {
    const socket = this.sockets.get(connectionId);
    if (!socket || socket.readyState !== socket.OPEN) return false;
    socket.send(
      typeof data === 'string' ? data : Buffer.from(data).toString('utf-8'),
    );
    return true;
  }

  private async onUpgrade(
    req: IncomingMessage,
    socket: Socket,
    head: Buffer,
  ): Promise<void> {
    const connectionId = `local-conn-${++connectionCounter}`;
    const url = new URL(req.url ?? '/', 'http://localhost');
    const queryStringParameters: Record<string, string> = {};
    url.searchParams.forEach((value, key) => {
      queryStringParameters[key] = value;
    });
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === 'string') headers[key] = value;
    }

    const connectEvent = buildEvent(
      '$connect',
      connectionId,
      this.domainName,
      this.stage,
      { queryStringParameters, headers },
    );

    let result: APIGatewayProxyResultV2;
    try {
      result = await this.handler(connectEvent);
    } catch {
      socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
      socket.destroy();
      return;
    }

    const statusCode = (result as { statusCode?: number }).statusCode ?? 500;
    if (statusCode !== 200) {
      socket.write(`HTTP/1.1 ${statusCode} Rejected\r\n\r\n`);
      socket.destroy();
      return;
    }

    this.wss.handleUpgrade(req, socket, head, (ws) => {
      this.sockets.set(connectionId, ws);

      ws.on('message', (data: Buffer) => {
        void this.handler(
          buildEvent('$default', connectionId, this.domainName, this.stage, {
            body: data.toString('utf-8'),
          }),
        );
      });

      ws.on('close', () => {
        this.sockets.delete(connectionId);
        void this.handler(
          buildEvent('$disconnect', connectionId, this.domainName, this.stage),
        );
      });
    });
  }

  /** True while `connectionId` is registered (connected and accepted). */
  isConnected(connectionId: string): boolean {
    return this.sockets.has(connectionId);
  }

  async close(): Promise<void> {
    for (const ws of this.sockets.values()) ws.terminate();
    this.sockets.clear();
    await new Promise<void>((resolve, reject) => {
      this.wss.close((err) => (err ? reject(err) : resolve()));
    });
    await new Promise<void>((resolve, reject) => {
      this.httpServer.close((err) => (err ? reject(err) : resolve()));
    });
  }
}
