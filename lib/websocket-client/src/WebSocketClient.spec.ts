/**
 * WebSocketClient Tests
 * Uses mock-socket to test WebSocket functionality
 */

import { Server } from 'mock-socket';
import { ClientNotificationType } from '@legacy-sports/utils';
import { WebSocketClient } from './WebSocketClient';
import type { NotificationData, WebSocketMessage } from './types';

// Mock the logger to avoid console output during tests
jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

/** Build a fake JWT with the given payload. The signature is garbage but the
 *  client only reads the payload for expiry checks. */
function fakeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.fake-signature`;
}

describe('WebSocketClient', () => {
  const mockUrl = 'ws://localhost:8080';
  let mockServer: Server;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    if (mockServer) {
      mockServer.close();
    }
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should create client with required options', () => {
      const client = new WebSocketClient({
        url: mockUrl,
        token: 'test-token',
        leagueId: 123,
        autoConnect: false,
      });

      expect(client).toBeInstanceOf(WebSocketClient);
      expect(client.getState()).toBe('disconnected');
      client.dispose();
    });

    it('should throw error if URL is not provided', () => {
      expect(() => {
        new WebSocketClient({
          url: '',
          token: 'test-token',
          leagueId: 123,
        });
      }).toThrow('WebSocket URL is required');
    });

    it('should auto-connect when autoConnect is true', () => {
      mockServer = new Server(mockUrl);

      const client = new WebSocketClient({
        url: mockUrl,
        token: 'test-token',
        leagueId: 123,
        autoConnect: true,
      });

      // Wait for connection
      jest.advanceTimersByTime(100);

      expect(client.getState()).toBe('connected');
      client.dispose();
    });

    it('should not auto-connect when autoConnect is false', () => {
      const client = new WebSocketClient({
        url: mockUrl,
        token: 'test-token',
        leagueId: 123,
        autoConnect: false,
      });

      expect(client.getState()).toBe('disconnected');
      client.dispose();
    });
  });

  describe('connect', () => {
    it('should connect to WebSocket server', (done) => {
      mockServer = new Server(mockUrl);

      const client = new WebSocketClient({
        url: mockUrl,
        token: 'test-token',
        leagueId: 123,
        autoConnect: false,
      });

      client.on('connected', () => {
        expect(client.getState()).toBe('connected');
        client.dispose();
        done();
      });

      client.connect();
      jest.advanceTimersByTime(100);
    });

    it('should include query parameters in connection URL', (done) => {
      const url = `${mockUrl}?token=test-token&leagueId=123&matchupId=456&viewContext=matchup`;
      mockServer = new Server(url);

      const client = new WebSocketClient({
        url: mockUrl,
        token: 'test-token',
        leagueId: 123,
        matchupId: 456,
        viewContext: 'matchup',
        autoConnect: false,
      });

      client.on('connected', () => {
        expect(client.getState()).toBe('connected');
        client.dispose();
        done();
      });

      client.connect();
      jest.advanceTimersByTime(100);
    });

    it('should connect without token for cookie-based auth', () => {
      const logging = jest.requireMock<{
        LOGGER: { debug: jest.Mock };
      }>('@legacy-sports/logging');

      mockServer = new Server(mockUrl);

      const client = new WebSocketClient({
        url: mockUrl,
        leagueId: 123,
        autoConnect: false,
      });

      client.connect();
      jest.advanceTimersByTime(100);

      expect(logging.LOGGER.debug).toHaveBeenCalledWith(
        expect.stringContaining('cookie-based auth'),
      );
      // Verify the client actually reaches connected state
      expect(client.getState()).toBe('connected');
      client.dispose();
    });

    it('should auto-connect without token for cookie-based auth', () => {
      mockServer = new Server(mockUrl);

      const client = new WebSocketClient({
        url: mockUrl,
        leagueId: 123,
        autoConnect: true,
      });

      jest.advanceTimersByTime(100);

      // Client should successfully connect, not just avoid error state
      expect(client.getState()).toBe('connected');
      client.dispose();
    });

    it('should not reconnect if already connected', () => {
      mockServer = new Server(mockUrl);

      const client = new WebSocketClient({
        url: mockUrl,
        token: 'test-token',
        leagueId: 123,
        autoConnect: true,
      });

      jest.advanceTimersByTime(100);
      const state = client.getState();

      client.connect(); // Try to connect again
      jest.advanceTimersByTime(100);

      expect(client.getState()).toBe(state);
      client.dispose();
    });
  });

  describe('disconnect', () => {
    it('should disconnect from WebSocket server', (done) => {
      mockServer = new Server(mockUrl);

      const client = new WebSocketClient({
        url: mockUrl,
        token: 'test-token',
        leagueId: 123,
        autoConnect: true,
      });

      jest.advanceTimersByTime(100);

      let disconnectCount = 0;
      client.on('disconnected', () => {
        disconnectCount++;
        if (disconnectCount === 1) {
          expect(client.getState()).toBe('disconnected');
          client.dispose();
          done();
        }
      });

      client.disconnect();
      jest.advanceTimersByTime(100);
    });

    it('should cancel pending reconnection attempts on disconnect', () => {
      mockServer = new Server(mockUrl);

      const client = new WebSocketClient({
        url: mockUrl,
        token: 'test-token',
        leagueId: 123,
        reconnect: true,
        reconnectDelay: 1000,
        autoConnect: false,
      });

      client.connect();
      jest.advanceTimersByTime(100);

      // Close server to trigger reconnection
      mockServer.close();
      jest.advanceTimersByTime(100);

      // Disconnect before reconnection attempt
      client.disconnect();
      jest.advanceTimersByTime(2000);

      expect(client.getState()).toBe('disconnected');
      client.dispose();
    });
  });

  describe('message handling', () => {
    it('should receive and emit messages', (done) => {
      mockServer = new Server(mockUrl);

      mockServer.on('connection', (socket) => {
        // Send message after connection is established
        setTimeout(() => {
          socket.send(
            JSON.stringify({
              type: 'test-message',
              data: { foo: 'bar' },
            }),
          );
        }, 50);
      });

      const client = new WebSocketClient({
        url: mockUrl,
        token: 'test-token',
        leagueId: 123,
        autoConnect: true,
      });

      const testMessage: WebSocketMessage = {
        type: 'test-message',
        data: { foo: 'bar' },
      };

      client.on('message', (msg) => {
        expect(msg).toEqual(testMessage);
        client.dispose();
        done();
      });

      jest.advanceTimersByTime(200);
    });

    it('should emit type-specific handlers', (done) => {
      mockServer = new Server(mockUrl);

      const notification: NotificationData = {
        type: 'draft-completed' as const,
        leagueId: 123,
        draftId: 7,
        selectionMethod: 'standard',
        completedAt: '2024-01-01T00:00:00Z',
      };

      mockServer.on('connection', (socket) => {
        setTimeout(() => {
          socket.send(JSON.stringify(notification));
        }, 50);
      });

      const client = new WebSocketClient({
        url: mockUrl,
        token: 'test-token',
        leagueId: 123,
        autoConnect: true,
      });

      client.on(ClientNotificationType.DRAFT_COMPLETED, (data) => {
        expect(data).toEqual(notification);
        client.dispose();
        done();
      });

      jest.advanceTimersByTime(200);
    });

    it('should handle pong messages without emitting', () => {
      mockServer = new Server(mockUrl);

      const client = new WebSocketClient({
        url: mockUrl,
        token: 'test-token',
        leagueId: 123,
        autoConnect: true,
      });

      const messageHandler = jest.fn();
      client.on('message', messageHandler);

      jest.advanceTimersByTime(100);

      mockServer.on('connection', (socket) => {
        socket.send(JSON.stringify({ type: 'pong' }));
      });

      jest.advanceTimersByTime(100);

      expect(messageHandler).not.toHaveBeenCalled();
      client.dispose();
    });

    it('should handle malformed JSON gracefully', (done) => {
      mockServer = new Server(mockUrl);

      mockServer.on('connection', (socket) => {
        setTimeout(() => {
          socket.send('invalid json');
        }, 50);
      });

      const client = new WebSocketClient({
        url: mockUrl,
        token: 'test-token',
        leagueId: 123,
        autoConnect: true,
      });

      client.on('error', (error) => {
        expect(error).toBeInstanceOf(Error);
        client.dispose();
        done();
      });

      jest.advanceTimersByTime(200);
    });
  });

  describe('send', () => {
    it('should send messages when connected', () => {
      mockServer = new Server(mockUrl);
      let receivedMessage: string | null = null;

      mockServer.on('connection', (socket) => {
        socket.on('message', (data) => {
          receivedMessage = data as string;
        });
      });

      const client = new WebSocketClient({
        url: mockUrl,
        token: 'test-token',
        leagueId: 123,
        autoConnect: true,
      });

      jest.advanceTimersByTime(100);

      client.send({ type: 'test', data: 'hello' });
      jest.advanceTimersByTime(100);

      expect(receivedMessage).toBe(
        JSON.stringify({ type: 'test', data: 'hello' }),
      );
      client.dispose();
    });

    it('should not send messages when disconnected', () => {
      const client = new WebSocketClient({
        url: mockUrl,
        token: 'test-token',
        leagueId: 123,
        autoConnect: false,
      });

      // Should not throw, just log warning
      expect(() => {
        client.send({ type: 'test', data: 'hello' });
      }).not.toThrow();

      client.dispose();
    });
  });

  describe('event subscriptions', () => {
    it('should subscribe and unsubscribe from events', () => {
      mockServer = new Server(mockUrl);

      const client = new WebSocketClient({
        url: mockUrl,
        token: 'test-token',
        leagueId: 123,
        autoConnect: false,
      });

      const handler = jest.fn();
      const unsubscribe = client.on(
        ClientNotificationType.DRAFT_COMPLETED,
        handler,
      );

      expect(typeof unsubscribe).toBe('function');

      unsubscribe();
      client.dispose();
    });

    it('should call multiple handlers for same event', (done) => {
      mockServer = new Server(mockUrl);

      const notification: NotificationData = {
        type: 'draft-completed' as const,
        leagueId: 123,
        draftId: 7,
        selectionMethod: 'standard',
        completedAt: '2024-01-01T00:00:00Z',
      };

      mockServer.on('connection', (socket) => {
        setTimeout(() => {
          socket.send(JSON.stringify(notification));
        }, 50);
      });

      const client = new WebSocketClient({
        url: mockUrl,
        token: 'test-token',
        leagueId: 123,
        autoConnect: true,
      });

      const handler1 = jest.fn();
      const handler2 = jest.fn();

      client.on(ClientNotificationType.DRAFT_COMPLETED, handler1);
      client.on(ClientNotificationType.DRAFT_COMPLETED, handler2);

      jest.advanceTimersByTime(200);

      setTimeout(() => {
        expect(handler1).toHaveBeenCalledWith(notification);
        expect(handler2).toHaveBeenCalledWith(notification);
        client.dispose();
        done();
      }, 0);

      jest.advanceTimersByTime(0);
    });

    it('should support off() method', () => {
      const client = new WebSocketClient({
        url: mockUrl,
        token: 'test-token',
        leagueId: 123,
        autoConnect: false,
      });

      const handler = jest.fn();
      client.on(ClientNotificationType.DRAFT_COMPLETED, handler);
      client.off(ClientNotificationType.DRAFT_COMPLETED, handler);

      client.dispose();
    });
  });

  describe('reconnection', () => {
    it('should reconnect with exponential backoff', () => {
      mockServer = new Server(mockUrl);

      const client = new WebSocketClient({
        url: mockUrl,
        token: 'test-token',
        leagueId: 123,
        reconnect: true,
        reconnectDelay: 1000,
        maxReconnectDelay: 30000,
        autoConnect: true,
      });

      jest.advanceTimersByTime(100);
      expect(client.getState()).toBe('connected');

      // Simulate disconnection
      mockServer.close();
      jest.advanceTimersByTime(100);

      // Should schedule reconnection after 1s (first attempt)
      expect(client.getState()).toBe('disconnected');

      // Recreate server for reconnection
      mockServer = new Server(mockUrl);
      jest.advanceTimersByTime(1000);

      expect(client.getState()).toBe('connected');
      client.dispose();
    });

    it('should respect maxReconnectAttempts', () => {
      const client = new WebSocketClient({
        url: mockUrl,
        token: 'test-token',
        leagueId: 123,
        reconnect: true,
        reconnectDelay: 100,
        maxReconnectAttempts: 2,
        autoConnect: false,
      });

      // Don't create server, so all connection attempts fail
      client.connect();
      jest.advanceTimersByTime(100);

      // First reconnect attempt
      jest.advanceTimersByTime(100);

      // Second reconnect attempt
      jest.advanceTimersByTime(200);

      // Should stop after 2 attempts
      expect(client.getState()).toBe('disconnected');
      client.dispose();
    });

    it('emits a user-visible error once the reconnect attempt budget is exhausted (LS-8881)', () => {
      const client = new WebSocketClient({
        url: mockUrl,
        token: 'test-token',
        leagueId: 123,
        reconnect: true,
        reconnectDelay: 100,
        maxReconnectAttempts: 2,
        autoConnect: false,
      });

      const errorHandler = jest.fn();
      client.on('error', errorHandler);

      // Don't create server, so every connection attempt fails before ever
      // opening — the shape of a permanently-rejected connection (bad
      // origin, revoked user, malformed token) that the client can't
      // distinguish from a transient drop, but must still stop retrying for.
      client.connect();
      jest.advanceTimersByTime(100); // initial attempt fails
      jest.advanceTimersByTime(100); // reconnect attempt 1 fails
      jest.advanceTimersByTime(200); // reconnect attempt 2 fails — budget spent

      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Max reconnection attempts reached',
        }),
      );

      // No further reconnect is scheduled — advance well past another cycle
      // and confirm the error was only emitted once.
      jest.advanceTimersByTime(10_000);
      expect(errorHandler).toHaveBeenCalledTimes(1);

      client.dispose();
    });

    it('defaults maxReconnectAttempts to a finite value instead of Infinity (LS-8881)', () => {
      const client = new WebSocketClient({
        url: mockUrl,
        token: 'test-token',
        leagueId: 123,
        reconnect: true,
        reconnectDelay: 100,
        maxReconnectDelay: 100,
        autoConnect: false,
      });

      const errorHandler = jest.fn();
      client.on('error', errorHandler);

      // Never create a server — every attempt fails before opening, exactly
      // like a permanently-403'd origin. With the old `Infinity` default
      // this would retry forever; it must now give up and surface an error.
      client.connect();
      // Initial attempt + up to 10 reconnect attempts at a 100ms fixed delay
      // (maxReconnectDelay caps backoff at 100ms) comfortably fits in 2s.
      jest.advanceTimersByTime(2_000);

      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Max reconnection attempts reached',
        }),
      );

      client.dispose();
    });

    it('reconnectNow gives up-and-recover a fresh attempt budget after the budget is exhausted (LS-8985)', () => {
      const client = new WebSocketClient({
        url: mockUrl,
        token: 'test-token',
        leagueId: 123,
        reconnect: true,
        reconnectDelay: 100,
        maxReconnectAttempts: 2,
        autoConnect: false,
      });

      const errorHandler = jest.fn();
      client.on('error', errorHandler);

      // Exhaust the reconnect budget the same way as the LS-8881 test above.
      client.connect();
      jest.advanceTimersByTime(100);
      jest.advanceTimersByTime(100);
      jest.advanceTimersByTime(200);

      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Max reconnection attempts reached',
        }),
      );

      // Simulate connectivity returning (e.g. app foregrounded) — a fresh
      // reconnectNow() call should try again rather than staying dead.
      mockServer = new Server(mockUrl);
      client.reconnectNow();
      jest.advanceTimersByTime(100);

      expect(client.getState()).toBe('connected');
      client.dispose();
    });

    it('automatically retries once with a fresh budget after a cooldown once the attempt budget is exhausted (LS-9489)', () => {
      const client = new WebSocketClient({
        url: mockUrl,
        token: 'test-token',
        leagueId: 123,
        reconnect: true,
        reconnectDelay: 100,
        maxReconnectAttempts: 2,
        autoConnect: false,
      });

      const errorHandler = jest.fn();
      client.on('error', errorHandler);

      // Exhaust the reconnect budget the same way as the LS-8881 test above —
      // this simulates a backend/gateway blip where nothing external (no
      // `online` toggle, no tab visibility change) ever signals recovery.
      client.connect();
      jest.advanceTimersByTime(100);
      jest.advanceTimersByTime(100);
      jest.advanceTimersByTime(200);

      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Max reconnection attempts reached',
        }),
      );

      // The blip resolves before the cooldown elapses — the client should
      // retry on its own, without any `reconnectNow()` call from a consumer.
      mockServer = new Server(mockUrl);
      jest.advanceTimersByTime(2 * 60 * 1000);

      expect(client.getState()).toBe('connected');
      client.dispose();
    });

    it('gives up for good if the cooldown retry also exhausts its budget', () => {
      const client = new WebSocketClient({
        url: mockUrl,
        token: 'test-token',
        leagueId: 123,
        reconnect: true,
        reconnectDelay: 100,
        maxReconnectAttempts: 2,
        autoConnect: false,
      });

      const errorHandler = jest.fn();
      client.on('error', errorHandler);

      // Exhaust the budget, then let the cooldown retry also fail because no
      // server ever comes up — a permanently-rejected connection.
      client.connect();
      jest.advanceTimersByTime(100);
      jest.advanceTimersByTime(100);
      jest.advanceTimersByTime(200);
      expect(errorHandler).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(2 * 60 * 1000); // cooldown retry fires, fails immediately
      jest.advanceTimersByTime(100); // reconnect attempt 1 fails
      jest.advanceTimersByTime(200); // reconnect attempt 2 fails — budget spent again
      expect(errorHandler).toHaveBeenCalledTimes(2);

      // No further cooldown is scheduled — it only ever fires once per give-up.
      jest.advanceTimersByTime(10 * 60 * 1000);
      expect(errorHandler).toHaveBeenCalledTimes(2);

      client.dispose();
    });

    it('logs the first budget exhaustion as a warning, not an error, since a cooldown retry is still pending (LS-9629)', () => {
      const client = new WebSocketClient({
        url: mockUrl,
        token: 'test-token',
        leagueId: 123,
        reconnect: true,
        reconnectDelay: 100,
        maxReconnectAttempts: 2,
        autoConnect: false,
      });

      const logging = jest.requireMock<{
        LOGGER: { warn: jest.Mock; error: jest.Mock };
      }>('@legacy-sports/logging');

      client.connect();
      jest.advanceTimersByTime(100);
      jest.advanceTimersByTime(100);
      jest.advanceTimersByTime(200); // budget spent — a cooldown retry is queued

      // LOGGER.error auto-forwards to Rollbar (RollbarOutputDestination) — a
      // transient blip that is about to retry on its own after the cooldown
      // must not be reported as an error yet.
      expect(logging.LOGGER.error).not.toHaveBeenCalledWith(
        'Max reconnection attempts reached — giving up',
        expect.anything(),
      );
      expect(logging.LOGGER.warn).toHaveBeenCalledWith(
        'Max reconnection attempts reached — retrying once more after cooldown',
        expect.objectContaining({ attempts: 2 }),
      );

      client.dispose();
    });

    it('escalates to a logged error once the cooldown retry also exhausts its budget (LS-9629)', () => {
      const client = new WebSocketClient({
        url: mockUrl,
        token: 'test-token',
        leagueId: 123,
        reconnect: true,
        reconnectDelay: 100,
        maxReconnectAttempts: 2,
        autoConnect: false,
      });

      const logging = jest.requireMock<{
        LOGGER: { warn: jest.Mock; error: jest.Mock };
      }>('@legacy-sports/logging');

      // Exhaust the budget, then let the cooldown retry also fail because no
      // server ever comes up — a permanently-rejected connection.
      client.connect();
      jest.advanceTimersByTime(100);
      jest.advanceTimersByTime(100);
      jest.advanceTimersByTime(200);
      expect(logging.LOGGER.error).not.toHaveBeenCalledWith(
        'Max reconnection attempts reached — giving up',
        expect.anything(),
      );

      jest.advanceTimersByTime(2 * 60 * 1000); // cooldown retry fires, fails immediately
      jest.advanceTimersByTime(100); // reconnect attempt 1 fails
      jest.advanceTimersByTime(200); // reconnect attempt 2 fails — budget spent again, now terminal

      expect(logging.LOGGER.error).toHaveBeenCalledWith(
        'Max reconnection attempts reached — giving up',
        expect.any(Error),
        expect.objectContaining({ attempts: 2 }),
      );

      client.dispose();
    });

    it('reconnectNow is a no-op when already connected', () => {
      mockServer = new Server(mockUrl);

      const client = new WebSocketClient({
        url: mockUrl,
        token: 'test-token',
        leagueId: 123,
        autoConnect: true,
      });

      jest.advanceTimersByTime(100);
      expect(client.getState()).toBe('connected');

      // Should not tear down and recreate the live connection.
      client.reconnectNow();
      jest.advanceTimersByTime(100);

      expect(client.getState()).toBe('connected');
      client.dispose();
    });

    // LS-10625: a minimized app must not churn reconnects in the background.
    describe('suspend / resume (LS-10625)', () => {
      it('suspend closes the socket, emits disconnected and stops reconnecting', () => {
        mockServer = new Server(mockUrl);
        const client = new WebSocketClient({
          url: mockUrl,
          token: 'test-token',
          leagueId: 123,
          autoConnect: true,
        });
        jest.advanceTimersByTime(100);
        expect(client.getState()).toBe('connected');
        const onDisconnected = jest.fn();
        client.on('disconnected', onDisconnected);

        client.suspend();
        // Well past every backoff step, heartbeat tick and the give-up cooldown.
        jest.advanceTimersByTime(10 * 60 * 1000);

        expect(client.getState()).toBe('disconnected');
        expect(onDisconnected).toHaveBeenCalledTimes(1);
        client.dispose();
      });

      it('cancels a pending reconnect backoff', () => {
        mockServer = new Server(mockUrl);
        const client = new WebSocketClient({
          url: mockUrl,
          token: 'test-token',
          leagueId: 123,
          autoConnect: true,
        });
        jest.advanceTimersByTime(100);
        // Drop the connection so a backoff timer is pending, then park.
        mockServer.close();
        jest.advanceTimersByTime(50);
        mockServer = new Server(mockUrl);

        client.suspend();
        jest.advanceTimersByTime(60_000);

        expect(client.getState()).toBe('disconnected');
        client.dispose();
      });

      it('connect and reconnectNow are no-ops while suspended', () => {
        mockServer = new Server(mockUrl);
        const client = new WebSocketClient({
          url: mockUrl,
          token: 'test-token',
          leagueId: 123,
          autoConnect: false,
        });
        client.suspend();

        client.connect();
        client.reconnectNow();
        jest.advanceTimersByTime(1000);

        expect(client.getState()).toBe('disconnected');
        client.dispose();
      });

      it('resume reconnects once with a fresh attempt budget', () => {
        mockServer = new Server(mockUrl);
        const client = new WebSocketClient({
          url: mockUrl,
          token: 'test-token',
          leagueId: 123,
          autoConnect: true,
        });
        jest.advanceTimersByTime(100);
        const onConnected = jest.fn();
        client.on('connected', onConnected);

        client.suspend();
        jest.advanceTimersByTime(1000);
        client.resume();
        jest.advanceTimersByTime(100);

        expect(client.getState()).toBe('connected');
        expect(onConnected).toHaveBeenCalledTimes(1);
        client.dispose();
      });

      it('suspend is idempotent and resume is a no-op when not suspended', () => {
        mockServer = new Server(mockUrl);
        const client = new WebSocketClient({
          url: mockUrl,
          token: 'test-token',
          leagueId: 123,
          autoConnect: true,
        });
        jest.advanceTimersByTime(100);

        // Not suspended: must not tear down the live connection.
        client.resume();
        expect(client.getState()).toBe('connected');

        const onDisconnected = jest.fn();
        client.on('disconnected', onDisconnected);
        client.suspend();
        client.suspend();
        expect(onDisconnected).toHaveBeenCalledTimes(1);
        client.dispose();
      });

      it('suspend and resume are no-ops after disposal', () => {
        const client = new WebSocketClient({
          url: mockUrl,
          token: 'test-token',
          leagueId: 123,
          autoConnect: false,
        });
        client.dispose();

        expect(() => {
          client.suspend();
          client.resume();
        }).not.toThrow();
        expect(client.getState()).toBe('disconnected');
      });
    });

    it('reconnectNow is a no-op after disposal', () => {
      const client = new WebSocketClient({
        url: mockUrl,
        token: 'test-token',
        leagueId: 123,
        autoConnect: false,
      });

      client.dispose();

      expect(() => client.reconnectNow()).not.toThrow();
      expect(client.getState()).toBe('disconnected');
    });

    it('should not reconnect when reconnect option is false', () => {
      mockServer = new Server(mockUrl);

      const client = new WebSocketClient({
        url: mockUrl,
        token: 'test-token',
        leagueId: 123,
        reconnect: false,
        autoConnect: true,
      });

      jest.advanceTimersByTime(100);

      mockServer.close();
      jest.advanceTimersByTime(5000);

      expect(client.getState()).toBe('disconnected');
      client.dispose();
    });
  });

  describe('token expiration', () => {
    it('should skip connection when token is expired', () => {
      const logging = jest.requireMock<{
        LOGGER: { warn: jest.Mock };
      }>('@legacy-sports/logging');

      const expiredToken = fakeJwt({
        id: 1,
        exp: Math.floor(Date.now() / 1000) - 60, // expired 60 s ago
      });

      const client = new WebSocketClient({
        url: mockUrl,
        token: expiredToken,
        leagueId: 123,
        autoConnect: false,
      });

      const errorHandler = jest.fn();
      client.on('error', errorHandler);

      client.connect();
      jest.advanceTimersByTime(100);

      expect(client.getState()).toBe('disconnected');
      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Token expired' }),
      );
      expect(logging.LOGGER.warn).toHaveBeenCalledWith(
        expect.stringContaining('token expired'),
      );

      client.dispose();
    });

    it('should skip connection when token expires within 30 s buffer', () => {
      const almostExpiredToken = fakeJwt({
        id: 1,
        exp: Math.floor(Date.now() / 1000) + 10, // expires in 10 s (within 30 s buffer)
      });

      const client = new WebSocketClient({
        url: mockUrl,
        token: almostExpiredToken,
        leagueId: 123,
        autoConnect: false,
      });

      const errorHandler = jest.fn();
      client.on('error', errorHandler);

      client.connect();
      jest.advanceTimersByTime(100);

      expect(client.getState()).toBe('disconnected');
      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Token expired' }),
      );

      client.dispose();
    });

    it('should connect normally when token is still valid', (done) => {
      mockServer = new Server(mockUrl);

      const validToken = fakeJwt({
        id: 1,
        exp: Math.floor(Date.now() / 1000) + 3600, // expires in 1 hour
      });

      // mock-socket matches URLs with query params, so we need to accept any
      const client = new WebSocketClient({
        url: mockUrl,
        token: validToken,
        leagueId: 123,
        autoConnect: false,
      });

      client.on('connected', () => {
        expect(client.getState()).toBe('connected');
        client.dispose();
        done();
      });

      client.connect();
      jest.advanceTimersByTime(100);
    });

    it('should stop reconnecting when token expires during reconnect cycle', () => {
      mockServer = new Server(mockUrl);

      // Token expires in 60 s — valid at creation (past the 30 s buffer)
      // but will be treated as expired after ~31 s of clock advancement.
      const shortLivedToken = fakeJwt({
        id: 1,
        exp: Math.floor(Date.now() / 1000) + 60,
      });

      const client = new WebSocketClient({
        url: mockUrl,
        token: shortLivedToken,
        leagueId: 123,
        reconnect: true,
        reconnectDelay: 1000,
        autoConnect: true,
      });

      jest.advanceTimersByTime(100);
      expect(client.getState()).toBe('connected');

      // Drop the connection — triggers reconnect cycle
      mockServer.close();
      jest.advanceTimersByTime(100);
      expect(client.getState()).toBe('disconnected');

      const errorHandler = jest.fn();
      client.on('error', errorHandler);

      // Advance past the 30 s buffer window (1 s reconnect delay + 31 s clock)
      // so the next connect() call detects the token as expired.
      jest.advanceTimersByTime(35_000);

      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Token expired' }),
      );

      client.dispose();
    });

    it('should allow connection without token (cookie-based auth)', () => {
      mockServer = new Server(mockUrl);

      const client = new WebSocketClient({
        url: mockUrl,
        // No token — cookie-based auth
        leagueId: 123,
        autoConnect: true,
      });

      jest.advanceTimersByTime(100);

      // Should connect normally — no expiration check for cookie auth
      expect(client.getState()).toBe('connected');
      client.dispose();
    });
  });

  describe('heartbeat', () => {
    it('should send ping after idle period', () => {
      mockServer = new Server(mockUrl);
      let receivedPing = false;

      mockServer.on('connection', (socket) => {
        socket.on('message', (data) => {
          const msg = JSON.parse(data as string) as { type: string };
          if (msg.type === 'ping') {
            receivedPing = true;
          }
        });
      });

      const client = new WebSocketClient({
        url: mockUrl,
        token: 'test-token',
        leagueId: 123,
        autoConnect: true,
      });

      jest.advanceTimersByTime(100);

      // Advance past idle period (5 minutes — see DEFAULT_HEARTBEAT_MS, LS-8880)
      jest.advanceTimersByTime(5 * 60 * 1000 + 100);

      expect(receivedPing).toBe(true);
      client.dispose();
    });

    it('should not send ping when receiving messages', () => {
      mockServer = new Server(mockUrl);
      let pingCount = 0;

      mockServer.on('connection', (socket) => {
        socket.on('message', (data) => {
          const msg = JSON.parse(data as string) as { type: string };
          if (msg.type === 'ping') {
            pingCount++;
          }
        });

        // Send messages periodically
        const interval = setInterval(() => {
          socket.send(JSON.stringify({ type: 'keep-alive' }));
        }, 1000);

        socket.addEventListener('close', () => {
          clearInterval(interval);
        });
      });

      const client = new WebSocketClient({
        url: mockUrl,
        token: 'test-token',
        leagueId: 123,
        autoConnect: true,
      });

      jest.advanceTimersByTime(100);

      // Advance time but keep sending messages
      for (let i = 0; i < 10; i++) {
        jest.advanceTimersByTime(1000);
      }

      expect(pingCount).toBe(0);
      client.dispose();
    });
  });

  describe('updateContext', () => {
    it('should send an updateContext action over the existing connection instead of reconnecting', () => {
      mockServer = new Server(mockUrl);
      let receivedMessage: string | null = null;

      mockServer.on('connection', (socket) => {
        socket.on('message', (data) => {
          receivedMessage = data as string;
        });
      });

      const client = new WebSocketClient({
        url: mockUrl,
        token: 'test-token',
        leagueId: 123,
        autoConnect: true,
      });

      jest.advanceTimersByTime(100);

      const disconnectedHandler = jest.fn();
      client.on('disconnected', disconnectedHandler);

      client.updateContext({ leagueId: 456, viewContext: 'roster' });
      jest.advanceTimersByTime(100);

      expect(disconnectedHandler).not.toHaveBeenCalled();
      expect(receivedMessage).toBe(
        JSON.stringify({
          action: 'updateContext',
          data: { leagueId: 456, viewContext: 'roster' },
        }),
      );
      client.dispose();
    });

    it('should update options locally without sending when not currently connected', () => {
      const client = new WebSocketClient({
        url: mockUrl,
        token: 'test-token',
        leagueId: 123,
        autoConnect: false,
      });

      const connectionHandler = jest.fn();
      client.on('connected', connectionHandler);

      client.updateContext({ leagueId: 456 });
      jest.advanceTimersByTime(1000);

      expect(connectionHandler).not.toHaveBeenCalled();
      client.dispose();
    });
  });

  describe('dispose', () => {
    it('should disconnect and clean up resources', () => {
      mockServer = new Server(mockUrl);

      const client = new WebSocketClient({
        url: mockUrl,
        token: 'test-token',
        leagueId: 123,
        autoConnect: true,
      });

      jest.advanceTimersByTime(100);

      client.dispose();

      expect(client.getState()).toBe('disconnected');
    });

    it('should prevent further operations after disposal', () => {
      mockServer = new Server(mockUrl);

      const client = new WebSocketClient({
        url: mockUrl,
        token: 'test-token',
        leagueId: 123,
        autoConnect: true,
      });

      jest.advanceTimersByTime(100);
      client.dispose();

      // These should not throw or cause issues
      client.connect();
      client.send({ type: 'test' });
      client.disconnect();

      expect(client.getState()).toBe('disconnected');
    });

    it('should be idempotent', () => {
      const client = new WebSocketClient({
        url: mockUrl,
        token: 'test-token',
        leagueId: 123,
        autoConnect: false,
      });

      expect(() => {
        client.dispose();
        client.dispose();
        client.dispose();
      }).not.toThrow();
    });
  });

  describe('error handling', () => {
    it('should emit error events', (done) => {
      const client = new WebSocketClient({
        url: 'ws://invalid-url-that-does-not-exist:9999',
        token: 'test-token',
        leagueId: 123,
        autoConnect: true,
        reconnect: false,
      });

      client.on('error', (error) => {
        expect(error).toBeInstanceOf(Error);
        client.dispose();
        done();
      });

      jest.advanceTimersByTime(100);
    });

    it('should emit an error event when a WebSocket error occurs', (done) => {
      mockServer = new Server(mockUrl);

      const client = new WebSocketClient({
        url: mockUrl,
        token: 'test-token',
        leagueId: 123,
        autoConnect: true,
        reconnect: false,
      });

      // Wait for connection then simulate an error event
      jest.advanceTimersByTime(50);

      client.on('error', (err) => {
        expect(err).toBeInstanceOf(Error);
        expect(err.message).toBe('WebSocket error');
        client.dispose();
        done();
      });

      // Trigger the onerror handler by closing the server abruptly
      mockServer.simulate('error');

      jest.advanceTimersByTime(100);
    });

    it('should suppress error events for transient errors when reconnect is enabled', () => {
      mockServer = new Server(mockUrl);

      const client = new WebSocketClient({
        url: mockUrl,
        token: 'test-token',
        leagueId: 123,
        autoConnect: true,
        reconnect: true,
      });

      jest.advanceTimersByTime(50);

      const errorHandler = jest.fn();
      client.on('error', errorHandler);

      // Simulate an error — with reconnect enabled, handleError should NOT emit
      mockServer.simulate('error');
      jest.advanceTimersByTime(100);

      expect(errorHandler).not.toHaveBeenCalled();
      // Also ensure that an "error" connection state was not emitted
      expect(client.getState()).not.toBe('error');

      client.dispose();
    });

    it('should handle connection state correctly', () => {
      mockServer = new Server(mockUrl);

      const client = new WebSocketClient({
        url: mockUrl,
        token: 'test-token',
        leagueId: 123,
        autoConnect: false,
      });

      expect(client.getState()).toBe('disconnected');

      client.connect();
      jest.advanceTimersByTime(50);

      // Should be connecting
      expect(client.getState()).toMatch(/connecting|connected/);

      jest.advanceTimersByTime(100);

      expect(client.getState()).toBe('connected');

      client.dispose();
    });
  });

  describe('stale socket events (LS-10593)', () => {
    /**
     * Minimal controllable WebSocket stand-in: unlike mock-socket, the test
     * decides exactly when each socket's open/close events fire, so it can
     * reproduce a superseded socket's `onclose` landing late.
     */
    class FakeWebSocket {
      static readonly CONNECTING = 0;
      static readonly OPEN = 1;
      static readonly CLOSING = 2;
      static readonly CLOSED = 3;
      static instances: FakeWebSocket[] = [];

      readyState = FakeWebSocket.CONNECTING;
      onopen: ((ev: Event) => void) | null = null;
      onmessage: ((ev: MessageEvent) => void) | null = null;
      onerror: ((ev: Event) => void) | null = null;
      onclose: ((ev: CloseEvent) => void) | null = null;
      sent: string[] = [];
      /** Captured at construction so a test can fire it after detachment. */
      capturedOnclose: (() => void) | null = null;

      constructor(public url: string) {
        FakeWebSocket.instances.push(this);
      }

      open(): void {
        this.capturedOnclose = this.onclose as (() => void) | null;
        this.readyState = FakeWebSocket.OPEN;
        this.onopen?.(new Event('open'));
      }

      send(data: string): void {
        this.sent.push(data);
      }

      close(): void {
        this.readyState = FakeWebSocket.CLOSED;
      }

      /** Simulate the browser delivering the close event (possibly late). */
      fireClose(): void {
        this.readyState = FakeWebSocket.CLOSED;
        (this.onclose as (() => void) | null)?.();
      }
    }

    const originalWebSocket = global.WebSocket;

    beforeEach(() => {
      FakeWebSocket.instances = [];
      (global as unknown as { WebSocket: unknown }).WebSocket = FakeWebSocket;
    });

    afterEach(() => {
      (global as unknown as { WebSocket: unknown }).WebSocket =
        originalWebSocket;
    });

    it("ignores a superseded socket's late close after disconnect(); connect()", () => {
      const client = new WebSocketClient({
        url: mockUrl,
        token: 'test-token',
        draftId: 7,
        viewContext: 'draft',
        reconnectDelay: 100,
        autoConnect: false,
      });
      client.setHeartbeatInterval(1000);
      const disconnected = jest.fn();
      client.on('disconnected', disconnected);

      client.connect();
      const first = FakeWebSocket.instances[0];
      first.open();
      const staleOnclose = first.capturedOnclose;

      // Forced fresh socket (e.g. app returned from a long background).
      client.disconnect();
      client.connect();
      const second = FakeWebSocket.instances[1];
      second.open();
      expect(disconnected).toHaveBeenCalledTimes(1);

      // The old socket's close event arrives after the new socket is live.
      // Even if a platform invokes the handler it captured earlier, it must
      // not affect the new socket.
      staleOnclose?.();
      first.fireClose();

      expect(disconnected).toHaveBeenCalledTimes(1);
      expect(client.getState()).toBe('connected');

      // The new socket's heartbeat is still running, and no duplicate
      // reconnect (100ms backoff) was scheduled by the stale close.
      jest.advanceTimersByTime(1000);
      expect(second.sent.some((m) => m.includes('ping'))).toBe(true);
      expect(FakeWebSocket.instances).toHaveLength(2);

      client.dispose();
    });

    it('detaches handlers from a socket retired by disconnect()', () => {
      const client = new WebSocketClient({
        url: mockUrl,
        token: 'test-token',
        autoConnect: false,
      });

      client.connect();
      const ws = FakeWebSocket.instances[0];
      ws.open();
      client.disconnect();

      expect(ws.onopen).toBeNull();
      expect(ws.onmessage).toBeNull();
      expect(ws.onerror).toBeNull();
      expect(ws.onclose).toBeNull();
      client.dispose();
    });

    it('reconnects (instead of giving up) when the heartbeat detects a dead socket', () => {
      const client = new WebSocketClient({
        url: mockUrl,
        token: 'test-token',
        reconnectDelay: 100,
        autoConnect: false,
      });
      client.setHeartbeatInterval(1000);
      const disconnected = jest.fn();
      client.on('disconnected', disconnected);

      client.connect();
      FakeWebSocket.instances[0].open();

      // Three unanswered heartbeat cycles — the zombie-socket branch.
      jest.advanceTimersByTime(3000);
      expect(disconnected).toHaveBeenCalledTimes(1);

      // A reconnect is scheduled with backoff and opens a fresh socket.
      jest.advanceTimersByTime(100);
      expect(FakeWebSocket.instances).toHaveLength(2);
      FakeWebSocket.instances[1].open();
      expect(client.getState()).toBe('connected');

      client.dispose();
    });
  });
});
