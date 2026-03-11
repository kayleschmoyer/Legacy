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

      // Advance past idle period (8 minutes)
      jest.advanceTimersByTime(8 * 60 * 1000 + 100);

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
    it('should update context and reconnect', (done) => {
      mockServer = new Server(mockUrl);

      const client = new WebSocketClient({
        url: mockUrl,
        token: 'test-token',
        leagueId: 123,
        autoConnect: true,
      });

      jest.advanceTimersByTime(100);

      let disconnected = false;
      let reconnected = false;

      client.on('disconnected', () => {
        disconnected = true;
      });

      client.on('connected', () => {
        if (disconnected && !reconnected) {
          reconnected = true;
          client.dispose();
          done();
        }
      });

      client.updateContext({ leagueId: 456, viewContext: 'roster' });
      jest.advanceTimersByTime(200);
    });

    it('should not reconnect if not currently connected', () => {
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
        client.dispose();
        done();
      });

      // Trigger the onerror handler by closing the server abruptly
      mockServer.simulate('error');

      jest.advanceTimersByTime(100);
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
});
