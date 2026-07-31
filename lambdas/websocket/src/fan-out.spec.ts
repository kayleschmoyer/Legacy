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
 * LS-8108 regression shapes. Reconnect-mid-draft (AC3), chained-auto-pick
 * burst/dedup (AC4), and true device-level (Appium) cross-platform E2E are
 * deliberately deferred — see the follow-up ticket referenced in the PR.
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
  reconnect?: boolean;
}

function makeClient(
  wsUrl: string,
  opts: TestClientOptions,
): InstanceType<typeof WebSocketClient> {
  return new WebSocketClient({
    url: wsUrl,
    token: opts.token,
    leagueId: opts.leagueId,
    viewContext: opts.leagueId ? 'league' : 'general',
    autoConnect: true,
    reconnect: opts.reconnect ?? false,
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
});
