/**
 * LS-8856 — genuine two-client WebSocket fan-out coverage.
 *
 * Every existing spec for this contract tests one layer against mocks of its
 * neighbours (see `index.spec.ts`, `WebSocketClient.spec.ts`,
 * `useDraftWebSocket.spec.ts`): a mocked server response fed to one real
 * client, or a mocked client call asserted against one Lambda invocation.
 * None of them can catch a contract mismatch BETWEEN two layers — precisely
 * the shape of LS-7977 (a pick broadcast that never reached the second
 * client), LS-8067 (a second device's client never received a league's
 * broadcast), and LS-8108 (a client that never sent an auth token at all).
 *
 * This spec closes that gap by running the REAL production code on both
 * sides of the wire:
 *   - Server: the real `lambdas/websocket/src/index.ts` Lambda handler
 *     ($connect/$default/$disconnect) and the real
 *     `WebSocketNotificationService` (the same class the draft-pick
 *     resolver calls after committing a pick — see
 *     `lambdas/db/src/schema/drafts/mutations/make-draft-pick.ts`).
 *   - Client: the real `WebSocketClient` (lib/websocket-client) — the exact
 *     class both the web and native apps construct via the shared
 *     `useWebSocket` hook (lib/shared-components/src/hooks/useWebSocket.ts).
 *
 * Only the AWS SDK boundary is faked: `DynamoDBClient` and
 * `ApiGatewayManagementApiClient` are replaced with a stateful in-memory
 * table (`FakeConnectionsTable`) and a bridge that delivers
 * `PostToConnectionCommand` pushes to real local sockets (`LocalWsBridge`).
 * `runWithPublicClient` (league/matchup membership) and `jsonwebtoken.verify`
 * are faked the same way the existing `index.spec.ts` fakes them, but with
 * real cross-call state instead of one-shot canned responses — the
 * difference that lets a second real connection actually show up in a
 * broadcast's recipient list.
 *
 * Scope (see LS-8856 for the full ticket and the PR description for the
 * coverage matrix): this spec covers AC1, AC2, AC5, and the LS-7977/LS-8067/
 * LS-8108 regression shapes.
 *
 * LS-8865 (this ticket's second slice) extends the same harness with:
 *   - reconnect-mid-draft (LS-8865 AC1): a client that drops and reconnects
 *     still receives post-reconnect broadcasts, and a broadcast attempted
 *     while it was offline fails gracefully without disrupting delivery to
 *     other connected clients. The "no permanently missed picks" guarantee
 *     itself is proved at the hook layer, not here — see
 *     `useDraftWebSocket.spec.ts`'s "reconnect refetch recovery (LS-8506)"
 *     block, which already covers the `RECONNECT_REFETCH_ATTEMPTS` resync
 *     path this ticket's Technical Approach pointed at.
 *   - chained auto-pick burst (LS-8865 AC2): a burst of `notifyDraftPickMade`
 *     calls fired in quick succession to one connected client all arrive,
 *     exactly once each — the fan-out/transport layer does not itself
 *     dedupe or drop; the debounced-refetch/dedup contract on TOP of that
 *     delivery lives in `useDraftWebSocket.ts` and is asserted there.
 *
 * True device-level (Appium) native cross-platform WS coverage remains
 * deliberately out of this spec's reach — see
 * `docs/decisions/0020-native-websocket-fan-out-stays-manual.md` for why.
 */

// ── Mocks (must be declared before importing the module under test) ──

import { WebSocketNotificationService } from '@legacy-sports/aws-utils';
import { WebSocketClient } from '@legacy-sports/websocket-client';
import type { AttrItem } from './test-support/fakeConnectionsTable';
import { FakeConnectionsTable } from './test-support/fakeConnectionsTable';
import { LocalWsBridge } from './test-support/localWsBridge';

const mockConnectionsTable = new FakeConnectionsTable();

const mockBridgeHolder: { current: LocalWsBridge | null } = { current: null };

const mockApiGatewaySend = jest.fn(
  (command: { _type: string; input: Record<string, unknown> }) => {
    if (command._type === 'PostToConnection') {
      const input = command.input as {
        ConnectionId: string;
        Data: Buffer | Uint8Array;
      };
      const delivered =
        mockBridgeHolder.current?.deliver(input.ConnectionId, input.Data) ??
        false;
      if (!delivered) {
        const err = new Error('UnknownError') as Error & { name: string };
        err.name = 'GoneException';
        throw err;
      }
    }
    return Promise.resolve({});
  },
);

/** Extracts the connectionId key without a non-null assertion. */
function connectionIdFrom(input: {
  Key?: { connectionId: { S: string } };
}): string {
  const id = input.Key?.connectionId.S;
  if (!id)
    throw new Error('FakeConnectionsTable command: missing Key.connectionId');
  return id;
}

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({
    send: jest.fn((command: { _type: string; input: never }) => {
      const input = command.input as {
        TableName?: string;
        Item?: AttrItem;
        Key?: { connectionId: { S: string } };
        IndexName?: string;
        ExpressionAttributeValues?: Record<string, { S?: string; N?: string }>;
        UpdateExpression?: string;
        ConditionExpression?: string;
      };
      switch (command._type) {
        case 'Put':
          mockConnectionsTable.putItem(input.Item as AttrItem);
          return Promise.resolve({});
        case 'Get':
          return Promise.resolve({
            Item: mockConnectionsTable.getItem(connectionIdFrom(input)),
          });
        case 'Delete':
          // `sendMessageToConnection`'s grace-period delete conditions on
          // `connectedAt` staying below a threshold — see FakeConnectionsTable.
          if (input.ConditionExpression?.includes('connectedAt < :threshold')) {
            mockConnectionsTable.deleteItem(connectionIdFrom(input), {
              attr: 'connectedAt',
              lessThan: Number(
                input.ExpressionAttributeValues?.[':threshold']?.N ?? '0',
              ),
            });
          } else {
            mockConnectionsTable.deleteItem(connectionIdFrom(input));
          }
          return Promise.resolve({});
        case 'Update':
          mockConnectionsTable.updateItem(
            connectionIdFrom(input),
            input.UpdateExpression ?? '',
            input.ExpressionAttributeValues ?? {},
          );
          return Promise.resolve({});
        case 'Query': {
          const values = input.ExpressionAttributeValues ?? {};
          if (input.IndexName === 'LeagueIdIndex') {
            return Promise.resolve({
              Items: mockConnectionsTable.queryByLeagueId(
                Number(values[':leagueId']?.N ?? '0'),
                values[':excludeViewContext']?.S,
              ),
            });
          }
          if (input.IndexName === 'MatchupIdIndex') {
            return Promise.resolve({
              Items: mockConnectionsTable.queryByMatchupId(
                Number(values[':matchupId']?.N ?? '0'),
                values[':context']?.S,
              ),
            });
          }
          if (input.IndexName === 'UserIdIndex') {
            return Promise.resolve({
              Items: mockConnectionsTable.queryByUserId(
                Number(values[':userId']?.N ?? '0'),
              ),
            });
          }
          return Promise.resolve({ Items: [] });
        }
        case 'Scan':
          return Promise.resolve({ Items: mockConnectionsTable.scanAll() });
        default:
          return Promise.resolve({});
      }
    }),
  })),
  PutItemCommand: jest
    .fn()
    .mockImplementation((input) => ({ _type: 'Put', input })),
  GetItemCommand: jest
    .fn()
    .mockImplementation((input) => ({ _type: 'Get', input })),
  DeleteItemCommand: jest
    .fn()
    .mockImplementation((input) => ({ _type: 'Delete', input })),
  QueryCommand: jest
    .fn()
    .mockImplementation((input) => ({ _type: 'Query', input })),
  ScanCommand: jest
    .fn()
    .mockImplementation((input) => ({ _type: 'Scan', input })),
  UpdateItemCommand: jest
    .fn()
    .mockImplementation((input) => ({ _type: 'Update', input })),
}));

jest.mock('@aws-sdk/client-apigatewaymanagementapi', () => ({
  ApiGatewayManagementApiClient: jest.fn().mockImplementation(() => ({
    send: mockApiGatewaySend,
  })),
  PostToConnectionCommand: jest.fn().mockImplementation((input) => ({
    _type: 'PostToConnection',
    input,
  })),
}));

const mockJwtUsers = new Map<
  string,
  { id: number; username: string; accessLevel: string }
>();

jest.mock('jsonwebtoken', () => ({
  verify: jest.fn((token: string) => {
    const payload = mockJwtUsers.get(token);
    if (!payload) {
      throw Object.assign(new Error('invalid signature'), {
        name: 'JsonWebTokenError',
      });
    }
    return payload;
  }),
}));

jest.mock('@legacy-sports/aws-utils', () => ({
  ...jest.requireActual('@legacy-sports/aws-utils'),
  retrieveSecretParameterValue: jest.fn().mockResolvedValue('test-jwt-secret'),
}));

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@legacy-sports/rollbar', () => ({
  getRollbarConfigFromEnv: jest.fn().mockReturnValue(null),
  initRollbar: jest.fn(),
  withRollbar: jest.fn((fn) => fn),
  addBreadcrumb: jest.fn(),
  captureError: jest.fn(),
  captureWarning: jest.fn(),
}));

jest.mock('@legacy-sports/utils/node', () => ({
  getVersionInfo: jest.fn().mockReturnValue({}),
  formatVersionInfo: jest.fn().mockReturnValue('v0.0.0'),
  getDbOptions: jest.fn().mockReturnValue({}),
}));

const mockPublicSchema = {
  leagueMembers: { leagueId: 'leagueId', userId: 'userId' },
  matchups: { id: 'id', leagueId: 'leagueId' },
};

/** `${userId}:${leagueId}` pairs treated as league members by the fake DB. */
const mockLeagueMembers = new Set<string>();
/** matchupId -> leagueId, for the fake matchup-access lookup. */
const mockMatchupLeague = new Map<number, number>();

function pairsFrom(cond: unknown): Array<[string, unknown]> {
  if (Array.isArray(cond) && Array.isArray(cond[0])) {
    return cond as Array<[string, unknown]>;
  }
  return [cond as [string, unknown]];
}

const mockRunWithPublicClient = jest.fn(
  (_opts: unknown, cb: (db: unknown) => unknown) => {
    const fakeDb = {
      select: () => ({
        from: (table: Record<string, string>) => ({
          where: (cond: unknown) => ({
            limit: () => {
              const values: Record<string, unknown> = {};
              for (const [key, val] of pairsFrom(cond)) values[key] = val;

              if (table === mockPublicSchema.leagueMembers) {
                const key = `${String(values['userId'])}:${String(values['leagueId'])}`;
                return Promise.resolve(mockLeagueMembers.has(key) ? [{}] : []);
              }
              if (table === mockPublicSchema.matchups) {
                const leagueId = mockMatchupLeague.get(values['id'] as number);
                return Promise.resolve(
                  leagueId !== undefined ? [{ leagueId }] : [],
                );
              }
              return Promise.resolve([]);
            },
          }),
        }),
      }),
    };
    return cb(fakeDb);
  },
);

jest.mock('@legacy-sports/db-client', () => ({
  runWithPublicClient: (...args: unknown[]) =>
    mockRunWithPublicClient(...(args as [unknown, (db: unknown) => unknown])),
  PublicSchema: mockPublicSchema,
}));

jest.mock('drizzle-orm', () => ({
  and: jest.fn((...args: unknown[]) => args),
  eq: jest.fn((a: unknown, b: unknown) => [a, b]),
}));

process.env['CONNECTIONS_TABLE_NAME'] = 'test-connections';
process.env['JWT_SECRET_NAME'] = 'test-jwt-secret-name';
// Short TTL so LS-8878's expiry/refresh regression coverage below doesn't
// need to wait out the real 2h window — see `CONNECTION_TTL_SECONDS` in
// `index.ts`. 2s (rather than 1s) leaves headroom against the TTL's
// epoch-*seconds* rounding so the refresh-path test isn't a coin flip on
// exactly which second a heartbeat lands in.
process.env['CONNECTION_TTL_SECONDS'] = '2';

// `./index` reads CONNECTIONS_TABLE_NAME/JWT_SECRET_NAME into module-level
// consts at import time, so it must load via `require()` AFTER the env vars
// above are set — a static `import` would be hoisted ahead of them (see
// index.spec.ts for the same constraint).
/* eslint-disable @typescript-eslint/no-require-imports */
import type * as IndexModule from './index';
const { __resetCachedJwtSecret, handler } =
  require('./index') as typeof IndexModule;
/* eslint-enable @typescript-eslint/no-require-imports */

// ── Test helpers ──

let nextUserId = 1;

/** Registers a fake user + JWT and returns the token to connect with. */
function registerUser(username: string): {
  token: string;
  userId: number;
} {
  const userId = nextUserId++;
  const token = `token-${username}-${userId}`;
  mockJwtUsers.set(token, { id: userId, username, accessLevel: 'user' });
  return { token, userId };
}

function grantLeagueMembership(userId: number, leagueId: number): void {
  mockLeagueMembers.add(`${userId}:${leagueId}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForEvent<T = void>(
  client: InstanceType<typeof WebSocketClient>,
  event: string,
  timeoutMs = 2000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsubscribe();
      reject(new Error(`Timed out waiting for "${event}"`));
    }, timeoutMs);
    const unsubscribe = client.on(
      event as never,
      ((payload: T) => {
        clearTimeout(timer);
        unsubscribe();
        resolve(payload);
      }) as never,
    );
  });
}

interface TestClientOptions {
  token?: string;
  leagueId?: number;
  matchupId?: number;
  viewContext?: 'general' | 'league' | 'matchup' | 'roster' | 'chat' | 'dm';
  reconnect?: boolean;
  reconnectDelay?: number;
  maxReconnectDelay?: number;
  maxReconnectAttempts?: number;
}

function makeClient(
  wsUrl: string,
  opts: TestClientOptions,
): InstanceType<typeof WebSocketClient> {
  return new WebSocketClient({
    url: wsUrl,
    token: opts.token,
    leagueId: opts.leagueId,
    matchupId: opts.matchupId,
    viewContext: opts.viewContext ?? (opts.leagueId ? 'league' : 'general'),
    autoConnect: true,
    reconnect: opts.reconnect ?? false,
    reconnectDelay: opts.reconnectDelay,
    maxReconnectDelay: opts.maxReconnectDelay,
    maxReconnectAttempts: opts.maxReconnectAttempts,
  });
}

describe('WebSocket fan-out (LS-8856)', () => {
  let bridge: LocalWsBridge;
  const clients: Array<InstanceType<typeof WebSocketClient>> = [];

  beforeEach(async () => {
    jest.clearAllMocks();
    __resetCachedJwtSecret();
    mockConnectionsTable.clear();
    mockLeagueMembers.clear();
    mockMatchupLeague.clear();
    mockJwtUsers.clear();
    nextUserId = 1;

    bridge = await LocalWsBridge.start(handler);
    mockBridgeHolder.current = bridge;
  });

  afterEach(async () => {
    for (const client of clients.splice(0)) client.dispose();
    mockBridgeHolder.current = null;
    await bridge.close();
  });

  function client(
    opts: TestClientOptions,
  ): InstanceType<typeof WebSocketClient> {
    const c = makeClient(bridge.url, opts);
    clients.push(c);
    return c;
  }

  function notificationService() {
    return new WebSocketNotificationService(
      'test-connections',
      'https://ignored.example.com/test',
    );
  }

  // ── AC1 / LS-7977: fan-out reaches a genuinely separate connected client ──

  it('delivers a draft pick notification to a second connected client (AC1, regression: LS-7977)', async () => {
    const leagueId = 100;
    const teamA = registerUser('alice');
    const teamB = registerUser('bob');
    grantLeagueMembership(teamA.userId, leagueId);
    grantLeagueMembership(teamB.userId, leagueId);

    const clientA = client({ token: teamA.token, leagueId });
    const clientB = client({ token: teamB.token, leagueId });
    await Promise.all([
      waitForEvent(clientA, 'connected'),
      waitForEvent(clientB, 'connected'),
    ]);

    const received = waitForEvent<{
      leagueId: number;
      overallPick: number;
      playerId: number;
    }>(clientB, 'draft-pick-made');

    // Client A's pick triggers the broadcast — this is the exact seam
    // `make-draft-pick.ts`'s resolver calls after committing the pick in the
    // DB (out of this ticket's scope; see the docblock above).
    await notificationService().notifyDraftPickMade(
      leagueId,
      /* draftId */ 5,
      /* pickId */ 9,
      teamA.userId,
      /* playerId */ 4242,
      /* round */ 1,
      /* pickNumber */ 2,
      /* overallPick */ 2,
    );

    const notification = await received;
    expect(notification.leagueId).toBe(leagueId);
    expect(notification.overallPick).toBe(2);
    expect(notification.playerId).toBe(4242);
  });

  // ── LS-8067: two independently-connected clients (modelling web + native,
  // which share the same WebSocketClient/useWebSocket transport today — see
  // the coverage-matrix note in the PR) both receive the same broadcast ──

  it('delivers the same pick to every subscribed client, not just one (regression: LS-8067)', async () => {
    const leagueId = 200;
    const commissioner = registerUser('commissioner');
    const webViewer = registerUser('web-viewer');
    const nativeViewer = registerUser('native-viewer');
    for (const u of [commissioner, webViewer, nativeViewer]) {
      grantLeagueMembership(u.userId, leagueId);
    }

    const webClient = client({ token: webViewer.token, leagueId });
    const nativeClient = client({ token: nativeViewer.token, leagueId });
    await Promise.all([
      waitForEvent(webClient, 'connected'),
      waitForEvent(nativeClient, 'connected'),
    ]);

    const webReceived = waitForEvent(webClient, 'draft-pick-made');
    const nativeReceived = waitForEvent(nativeClient, 'draft-pick-made');

    await notificationService().notifyDraftPickMade(
      leagueId,
      1,
      1,
      commissioner.userId,
      777,
      1,
      1,
      1,
    );

    await expect(webReceived).resolves.toMatchObject({ playerId: 777 });
    await expect(nativeReceived).resolves.toMatchObject({ playerId: 777 });
  });

  // ── AC2 / LS-8108: auth is enforced, not merely assumed ──

  it('rejects a connection with no token (regression: LS-8108 — native never sent one)', async () => {
    const rejected = client({ reconnect: false });
    await expect(waitForEvent(rejected, 'connected', 500)).rejects.toThrow();
  });

  it('rejects a connection with an invalid token', async () => {
    const rejected = client({ token: 'not-a-real-token', reconnect: false });
    await expect(waitForEvent(rejected, 'connected', 500)).rejects.toThrow();
  });

  it('accepts a connection with a valid token', async () => {
    const user = registerUser('carol');
    const accepted = client({ token: user.token });
    await expect(waitForEvent(accepted, 'connected')).resolves.toBeUndefined();
  });

  // ── LS-8881: a permanent rejection (invalid token, mirrors 401/403-style
  // auth failures — see the real `$connect` handler above) must not reconnect
  // forever. Run against the REAL handler + REAL client over a real loopback
  // socket, per ADR-0019 — a mock-socket-only test can't prove the real
  // `$connect` auth-rejection path actually stops the real client's retry
  // loop. ──

  it('stops retrying and surfaces an error after repeated auth rejection, instead of reconnecting forever (LS-8881)', async () => {
    const rejected = client({
      token: 'not-a-real-token',
      reconnect: true,
      reconnectDelay: 10,
      maxReconnectDelay: 10,
      maxReconnectAttempts: 3,
    });

    const error = await waitForEvent<Error>(rejected, 'error', 3000);
    expect(error.message).toBe('Max reconnection attempts reached');

    // No further reconnect fires after the budget is spent — 'connected'
    // never arrives.
    await expect(waitForEvent(rejected, 'connected', 200)).rejects.toThrow();
  });

  // ── AC2: subscribe / unsubscribe / no-delivery-after-unsubscribe ──

  it('stops delivering league broadcasts after the client unsubscribes', async () => {
    const leagueId = 300;
    const sender = registerUser('dave');
    const viewer = registerUser('erin');
    grantLeagueMembership(sender.userId, leagueId);
    grantLeagueMembership(viewer.userId, leagueId);

    const viewerClient = client({ token: viewer.token, leagueId });
    await waitForEvent(viewerClient, 'connected');

    // Subscribed: a broadcast arrives.
    const firstReceived = waitForEvent(viewerClient, 'draft-pick-made');
    await notificationService().notifyDraftPickMade(
      leagueId,
      1,
      1,
      sender.userId,
      1,
      1,
      1,
      1,
    );
    await firstReceived;

    // Unsubscribe by explicitly clearing leagueId (the real client contract
    // for leaving a league view — WebSocketClient.updateContext() only ever
    // sets, so a genuine clear goes over the wire as the server's own null
    // convention, exactly as a real "navigate away" would).
    const messagesAfterUnsubscribe: unknown[] = [];
    viewerClient.on('draft-pick-made', (n) => messagesAfterUnsubscribe.push(n));
    viewerClient.send({ action: 'updateContext', data: { leagueId: null } });
    await sleep(200); // let the server apply the update

    await notificationService().notifyDraftPickMade(
      leagueId,
      1,
      2,
      sender.userId,
      2,
      1,
      2,
      2,
    );
    await sleep(300); // bounded wait for a negative assertion — see PR body

    expect(messagesAfterUnsubscribe).toHaveLength(0);
  });

  // ── LS-8880: heartbeat ping/pong wire format, joined to the real $default
  // handler — previously only ever exercised against mocks of the other side
  // (WebSocketClient.spec.ts mocks the server; index.spec.ts mocks the AWS
  // SDK client and asserts the pong payload in isolation) ──

  it('keeps a real connection alive across several genuine ping/pong heartbeat cycles (AC3)', async () => {
    const user = registerUser('heartbeat-user');
    const heartbeatClient = client({ token: user.token, reconnect: false });
    await waitForEvent(heartbeatClient, 'connected');

    const disconnected = jest.fn();
    heartbeatClient.on('disconnected', disconnected);

    // Exercise the production heartbeat wiring (setHeartbeatInterval) — the
    // API this ticket found had no production caller — against the real
    // `$default` handler instead of a mock. A very short interval forces
    // several genuine ping/pong round-trips within the test's lifetime.
    heartbeatClient.setHeartbeatInterval(50);

    // Long enough for multiple heartbeat cycles. If the real pong's wire
    // format didn't match what the real client expects, consecutive misses
    // would hit MAX_CONSECUTIVE_PINGS and the client would self-disconnect —
    // so staying connected here is proof the round trip actually worked.
    await sleep(500);

    expect(heartbeatClient.getState()).toBe('connected');
    expect(disconnected).not.toHaveBeenCalled();

    // Confirm the server's actual wire payload, not just the client's
    // internal state, matches the `{ type: 'pong' }` contract.
    const pongPayloads = mockApiGatewaySend.mock.calls
      .map(([command]) => command)
      .filter(
        (command): command is { _type: string; input: { Data: Buffer } } =>
          command._type === 'PostToConnection',
      )
      .map((command) => {
        try {
          return JSON.parse(command.input.Data.toString('utf-8')) as {
            type?: string;
          };
        } catch {
          return null;
        }
      });

    expect(pongPayloads.some((payload) => payload?.type === 'pong')).toBe(true);
  });

  // ── LS-8877: presence events reach client handlers ──

  it('delivers USER_JOINED and USER_LIST in the notification envelope on connect', async () => {
    const leagueId = 500;
    const existing = registerUser('ivan');
    const joining = registerUser('judy');
    grantLeagueMembership(existing.userId, leagueId);
    grantLeagueMembership(joining.userId, leagueId);

    const existingClient = client({ token: existing.token, leagueId });
    await waitForEvent(existingClient, 'connected');

    const joinedReceived = waitForEvent<{ userId: number; username: string }>(
      existingClient,
      'user-joined',
    );

    const joiningClient = client({ token: joining.token, leagueId });
    const userListReceived = waitForEvent<{
      users: Array<{ userId: number; username: string }>;
    }>(joiningClient, 'user-list');
    await waitForEvent(joiningClient, 'connected');

    const joined = await joinedReceived;
    expect(joined.userId).toBe(joining.userId);
    expect(joined.username).toBe('judy');

    const userList = await userListReceived;
    expect(userList.users).toEqual(
      expect.arrayContaining([
        { userId: existing.userId, username: 'ivan' },
        { userId: joining.userId, username: 'judy' },
      ]),
    );
  });

  it('delivers USER_LEFT in the notification envelope on disconnect', async () => {
    const leagueId = 501;
    const stayer = registerUser('kevin');
    const leaver = registerUser('laura');
    grantLeagueMembership(stayer.userId, leagueId);
    grantLeagueMembership(leaver.userId, leagueId);

    const stayerClient = client({ token: stayer.token, leagueId });
    const leaverClient = client({ token: leaver.token, leagueId });
    await Promise.all([
      waitForEvent(stayerClient, 'connected'),
      waitForEvent(leaverClient, 'connected'),
    ]);

    const leftReceived = waitForEvent<{ userId: number }>(
      stayerClient,
      'user-left',
    );

    leaverClient.dispose();

    const left = await leftReceived;
    expect(left.userId).toBe(leaver.userId);
  });

  // ── AC5: no cross-league leakage ──

  it('does not leak a league broadcast to a client subscribed to a different league', async () => {
    const leagueA = 400;
    const leagueB = 401;
    const senderA = registerUser('frank');
    const viewerA = registerUser('grace');
    const viewerB = registerUser('heidi');
    grantLeagueMembership(senderA.userId, leagueA);
    grantLeagueMembership(viewerA.userId, leagueA);
    grantLeagueMembership(viewerB.userId, leagueB);

    const clientA = client({ token: viewerA.token, leagueId: leagueA });
    const clientB = client({ token: viewerB.token, leagueId: leagueB });
    await Promise.all([
      waitForEvent(clientA, 'connected'),
      waitForEvent(clientB, 'connected'),
    ]);

    const leagueBMessages: unknown[] = [];
    clientB.on('draft-pick-made', (n) => leagueBMessages.push(n));

    const receivedByA = waitForEvent(clientA, 'draft-pick-made');
    await notificationService().notifyDraftPickMade(
      leagueA,
      1,
      1,
      senderA.userId,
      1,
      1,
      1,
      1,
    );
    await receivedByA;
    await sleep(300); // bounded wait for a negative assertion — see PR body

    expect(leagueBMessages).toHaveLength(0);
  });

  // ── LS-8879: client.updateContext() reaches the server's re-authorization
  // path over the live connection instead of silently reconnecting past it ──

  it('re-scopes broadcast delivery via updateContext() without dropping the connection', async () => {
    const leagueA = 500;
    const leagueB = 501;
    const senderA = registerUser('ivan');
    const senderB = registerUser('judy');
    const viewer = registerUser('kim');
    grantLeagueMembership(senderA.userId, leagueA);
    grantLeagueMembership(senderB.userId, leagueB);
    grantLeagueMembership(viewer.userId, leagueA);
    grantLeagueMembership(viewer.userId, leagueB);

    const viewerClient = client({ token: viewer.token, leagueId: leagueA });
    await waitForEvent(viewerClient, 'connected');

    const disconnectedHandler = jest.fn();
    viewerClient.on('disconnected', disconnectedHandler);

    // Still scoped to league A: a league A broadcast is delivered.
    const firstReceived = waitForEvent(viewerClient, 'draft-pick-made');
    await notificationService().notifyDraftPickMade(
      leagueA,
      1,
      1,
      senderA.userId,
      1,
      1,
      1,
      1,
    );
    await firstReceived;

    // Real client API — the exact call `useWebSocket`'s `updateContext`
    // forwards to. Must reach the server over the SAME connection: a
    // disconnect/reconnect here would be the LS-8879 regression.
    const leagueAMessagesAfterSwitch: unknown[] = [];
    viewerClient.on('draft-pick-made', (n) =>
      leagueAMessagesAfterSwitch.push(n),
    );
    viewerClient.updateContext({ leagueId: leagueB });
    await sleep(200); // let the server apply the update

    expect(disconnectedHandler).not.toHaveBeenCalled();

    // No longer scoped to league A: a league A broadcast is not delivered.
    await notificationService().notifyDraftPickMade(
      leagueA,
      1,
      2,
      senderA.userId,
      2,
      1,
      2,
      2,
    );
    await sleep(300); // bounded wait for a negative assertion — see PR body
    expect(leagueAMessagesAfterSwitch).toHaveLength(0);

    // Now scoped to league B: a league B broadcast IS delivered on the
    // same, still-open connection.
    const receivedAfterSwitch = waitForEvent<{ leagueId: number }>(
      viewerClient,
      'draft-pick-made',
    );
    await notificationService().notifyDraftPickMade(
      leagueB,
      1,
      1,
      senderB.userId,
      3,
      1,
      1,
      1,
    );
    await expect(receivedAfterSwitch).resolves.toMatchObject({
      leagueId: leagueB,
    });
    expect(disconnectedHandler).not.toHaveBeenCalled();
  });

  // ── LS-8878: connections-table TTL refresh on heartbeat ping ──

  it(
    'drops a connection from broadcasts once its row TTL expires with no refresh ' +
      '(regression: LS-8878 — the bug before the ping-refresh fix)',
    async () => {
      const leagueId = 502;
      const sender = registerUser('ivan');
      const viewer = registerUser('judy');
      grantLeagueMembership(sender.userId, leagueId);
      grantLeagueMembership(viewer.userId, leagueId);

      // Default heartbeat is 8 minutes — this client never pings within the
      // test, so its connections-table row's TTL (CONNECTION_TTL_SECONDS)
      // expires with no refresh, exactly like a real client that only ever
      // disconnects/reconnects via updateContext() instead of pinging.
      const viewerClient = client({ token: viewer.token, leagueId });
      await waitForEvent(viewerClient, 'connected');

      const messages: unknown[] = [];
      viewerClient.on('draft-pick-made', (n) => messages.push(n));

      // Outlast the TTL with the socket still open — DynamoDB TTL eviction is
      // lazy, so the row disappears from reads while the client believes it's
      // still subscribed.
      await sleep(2500);

      await notificationService().notifyDraftPickMade(
        leagueId,
        1,
        1,
        sender.userId,
        1,
        1,
        1,
        1,
      );
      await sleep(300); // bounded wait for a negative assertion

      expect(messages).toHaveLength(0);
    },
  );

  it(
    'keeps receiving broadcasts past the original TTL when heartbeat pings ' +
      'refresh the row (LS-8878 fix)',
    async () => {
      const leagueId = 503;
      const sender = registerUser('kevin');
      const viewer = registerUser('laura');
      grantLeagueMembership(sender.userId, leagueId);
      grantLeagueMembership(viewer.userId, leagueId);

      const viewerClient = client({ token: viewer.token, leagueId });
      await waitForEvent(viewerClient, 'connected');

      // Ping well inside the TTL so the server-side refresh (handleDefault's
      // 'ping' branch) keeps extending the row's TTL for as long as the socket
      // stays open — modelling a multi-hour draft against the short test TTL.
      viewerClient.setHeartbeatInterval(300);

      // Outlast the original TTL several times over; the connection should
      // survive because the heartbeat kept refreshing it.
      await sleep(2500);

      const received = waitForEvent<{ playerId: number }>(
        viewerClient,
        'draft-pick-made',
      );
      await notificationService().notifyDraftPickMade(
        leagueId,
        1,
        1,
        sender.userId,
        999,
        1,
        1,
        1,
      );

      await expect(received).resolves.toMatchObject({ playerId: 999 });
    },
  );

  // ── LS-8865 AC1: reconnect-mid-draft ──

  it('delivers a pick broadcast after a client drops and reconnects mid-draft', async () => {
    const leagueId = 550;
    const stableViewer = registerUser('noah'); // stays connected throughout
    const droppedViewer = registerUser('olivia'); // disconnects and reconnects
    grantLeagueMembership(stableViewer.userId, leagueId);
    grantLeagueMembership(droppedViewer.userId, leagueId);

    // `reconnect: false` — this test drives the connect/disconnect cycle
    // itself rather than relying on the client's own backoff timer, per the
    // ticket's Technical Approach.
    const stableClient = client({ token: stableViewer.token, leagueId });
    const droppedClient = client({
      token: droppedViewer.token,
      leagueId,
      reconnect: false,
    });
    await Promise.all([
      waitForEvent(stableClient, 'connected'),
      waitForEvent(droppedClient, 'connected'),
    ]);

    // Drop the connection mid-draft (clean client-initiated close is
    // sufficient here — LocalWsBridge's `$disconnect` path removes the
    // DynamoDB row exactly as a genuine network drop would once the socket
    // closes; see the harness docblock).
    const droppedDisconnected = waitForEvent(droppedClient, 'disconnected');
    droppedClient.disconnect();
    await droppedDisconnected;

    // A pick sent while the client is offline cannot reach it over the dead
    // socket — but it must not disrupt delivery to the still-connected
    // client, and must not throw out of the broadcast call. (The guarantee
    // that the dropped client itself doesn't end up "permanently" missing
    // this pick is the hook-layer reconnect-refetch's job — see the
    // docblock above — not this transport-layer spec's.)
    const stableReceivedFirst = waitForEvent<{ overallPick: number }>(
      stableClient,
      'draft-pick-made',
    );
    await expect(
      notificationService().notifyDraftPickMade(
        leagueId,
        6,
        10,
        stableViewer.userId,
        5151,
        1,
        3,
        3,
      ),
    ).resolves.toBeUndefined();
    await expect(stableReceivedFirst).resolves.toMatchObject({
      overallPick: 3,
    });

    // Reconnect with the same league context and re-assert delivery.
    const droppedReconnected = waitForEvent(droppedClient, 'connected');
    droppedClient.connect();
    await droppedReconnected;

    const droppedReceivedAfterReconnect = waitForEvent<{
      overallPick: number;
    }>(droppedClient, 'draft-pick-made');
    await notificationService().notifyDraftPickMade(
      leagueId,
      6,
      11,
      stableViewer.userId,
      5252,
      1,
      4,
      4,
    );

    await expect(droppedReceivedAfterReconnect).resolves.toMatchObject({
      overallPick: 4,
    });
  });

  // ── LS-8865 AC2: chained auto-pick burst ──

  it('delivers every pick in a burst of chained auto-picks exactly once', async () => {
    const leagueId = 600;
    const commissioner = registerUser('karl');
    const viewer = registerUser('maria');
    grantLeagueMembership(commissioner.userId, leagueId);
    grantLeagueMembership(viewer.userId, leagueId);

    const viewerClient = client({ token: viewer.token, leagueId });
    await waitForEvent(viewerClient, 'connected');

    const BURST_SIZE = 6;
    const received: number[] = [];
    const allReceived = new Promise<void>((resolve) => {
      viewerClient.on('draft-pick-made', (n) => {
        received.push((n as { overallPick: number }).overallPick);
        if (received.length === BURST_SIZE) resolve();
      });
    });

    // Fire a chain of auto-picks back-to-back without waiting between them —
    // the shape of a real chained-auto-pick burst (a run of teams that are
    // all on auto-pick, each pick immediately triggering the next).
    const sends = Array.from({ length: BURST_SIZE }, (_, i) =>
      notificationService().notifyDraftPickMade(
        leagueId,
        7,
        20 + i,
        commissioner.userId,
        6000 + i,
        1,
        i + 1,
        i + 1,
        undefined,
        { wasAutoPick: true },
      ),
    );
    await Promise.all(sends);

    await Promise.race([
      allReceived,
      sleep(2000).then(() => {
        throw new Error(
          `Timed out waiting for all ${BURST_SIZE} burst picks; received ${received.length}`,
        );
      }),
    ]);

    // Every pick observed exactly once, per AC2's "every pick is delivered"
    // outcome — the fan-out/transport layer does not dedupe or drop.
    expect(received).toHaveLength(BURST_SIZE);
    expect(new Set(received).size).toBe(BURST_SIZE);
    expect(received.sort((a, b) => a - b)).toEqual(
      Array.from({ length: BURST_SIZE }, (_, i) => i + 1),
    );
  });

  // ── LS-6355: matchup-scoped connections don't receive league chat/roster
  // noise, but a plain league-scoped connection still does ──

  it('does not deliver a league chat message to a matchup-scoped connection, but does deliver it to a league-scoped one', async () => {
    const leagueId = 600;
    const matchupId = 60;
    mockMatchupLeague.set(matchupId, leagueId);
    const sender = registerUser('leo');
    const leagueViewer = registerUser('mia');
    const matchupViewer = registerUser('noah');
    for (const u of [sender, leagueViewer, matchupViewer]) {
      grantLeagueMembership(u.userId, leagueId);
    }

    const leagueClient = client({ token: leagueViewer.token, leagueId });
    const matchupClient = client({
      token: matchupViewer.token,
      leagueId,
      matchupId,
      viewContext: 'matchup',
    });
    await Promise.all([
      waitForEvent(leagueClient, 'connected'),
      waitForEvent(matchupClient, 'connected'),
    ]);

    const matchupMessages: unknown[] = [];
    matchupClient.on('league-chat-message', (n) => matchupMessages.push(n));
    const leagueReceived = waitForEvent(leagueClient, 'league-chat-message');

    await notificationService().notifyLeagueChatMessage(leagueId, {
      messageId: 1,
      senderId: sender.userId,
      senderUsername: 'leo',
      messageText: 'hello league',
      timestamp: '2026-01-01T00:00:00.000Z',
    });

    await expect(leagueReceived).resolves.toMatchObject({
      messageText: 'hello league',
    });
    await sleep(300); // bounded wait for a negative assertion — see PR body
    expect(matchupMessages).toHaveLength(0);
  });

  it('does not deliver a roster update to a matchup-scoped connection, but does deliver it to a league-scoped one', async () => {
    const leagueId = 601;
    const matchupId = 61;
    mockMatchupLeague.set(matchupId, leagueId);
    const commissioner = registerUser('olivia');
    const leagueViewer = registerUser('paul');
    const matchupViewer = registerUser('quinn');
    for (const u of [commissioner, leagueViewer, matchupViewer]) {
      grantLeagueMembership(u.userId, leagueId);
    }

    const leagueClient = client({ token: leagueViewer.token, leagueId });
    const matchupClient = client({
      token: matchupViewer.token,
      leagueId,
      matchupId,
      viewContext: 'matchup',
    });
    await Promise.all([
      waitForEvent(leagueClient, 'connected'),
      waitForEvent(matchupClient, 'connected'),
    ]);

    const matchupMessages: unknown[] = [];
    matchupClient.on('roster-update', (n) => matchupMessages.push(n));
    const leagueReceived = waitForEvent(leagueClient, 'roster-update');

    await notificationService().notifyRosterUpdate(leagueId);

    await leagueReceived;
    await sleep(300); // bounded wait for a negative assertion — see PR body
    expect(matchupMessages).toHaveLength(0);
  });
});
