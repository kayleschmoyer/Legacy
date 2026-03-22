import { LOGGER } from '@legacy-sports/logging';
import { wireToClientEventName } from '@legacy-sports/utils';
import type {
  ConnectionState,
  EventHandler,
  NotificationData,
  RequiredWebSocketClientOptions,
  UnsubscribeFn,
  WebSocketClientOptions,
  WebSocketMessage,
} from './types';

// Constants
const DEFAULT_HEARTBEAT_MS = 8 * 60 * 1000; // 8 minutes
const MAX_CONSECUTIVE_PINGS = 3;

/**
 * Framework-agnostic WebSocket Client
 *
 * Provides a unified interface for WebSocket connections across web, React Native, and Node.js.
 * Features:
 * - Event-based API with typed notification handlers
 * - Auto-reconnection with exponential backoff
 * - Smart heartbeat (only pings during idle periods)
 * - Proper cleanup and disposal
 * - Type-safe message handling
 *
 * @example
 * ```typescript
 * const client = new WebSocketClient({
 *   url: 'wss://example.com',
 *   token: 'auth-token',
 *   leagueId: 123,
 *   viewContext: 'league',
 *   autoConnect: true
 * });
 *
 * const unsubscribe = client.on('draft-completed', (notification) => {
 *   console.log('Draft completed:', notification.leagueId);
 * });
 *
 * // Later:
 * unsubscribe();
 * client.dispose();
 * ```
 */
export class WebSocketClient {
  private ws: WebSocket | null = null;
  private options: RequiredWebSocketClientOptions;
  private reconnectAttempts = 0;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private heartbeatMs = DEFAULT_HEARTBEAT_MS;
  private lastMessageTime = 0;
  private consecutivePings = 0;
  private disposed = false;

  // Event handlers
  private eventHandlers = new Map<string, Set<EventHandler>>();
  private connectionHandlers = new Set<EventHandler<ConnectionState>>();
  private errorHandlers = new Set<EventHandler<Error>>();

  /**
   * Create a new WebSocket client
   */
  constructor(options: WebSocketClientOptions) {
    // Set defaults for optional fields
    this.options = {
      url: options.url,
      token: options.token,
      leagueId: options.leagueId,
      matchupId: options.matchupId,
      viewContext: options.viewContext || 'general',
      autoConnect: options.autoConnect ?? true,
      reconnect: options.reconnect ?? true,
      maxReconnectAttempts: options.maxReconnectAttempts ?? Infinity,
      reconnectDelay: options.reconnectDelay ?? 1000,
      maxReconnectDelay: options.maxReconnectDelay ?? 30000,
    };

    if (!this.options.url) {
      LOGGER.error('WebSocket URL not configured');
      throw new Error('WebSocket URL is required');
    }

    if (this.options.autoConnect) {
      this.connect();
    }
  }

  /**
   * Connect to the WebSocket server
   */
  public connect(): void {
    if (this.disposed) {
      LOGGER.warn('Cannot connect - client is disposed');
      return;
    }

    if (!this.options.token) {
      LOGGER.debug(
        'No auth token provided — connection will rely on cookie-based auth.',
      );
    }

    if (this.ws?.readyState === WebSocket.OPEN) {
      LOGGER.debug('Already connected');
      return;
    }

    // Build connection URL with query parameters
    const url = this.buildUrl();

    LOGGER.debug('Connecting to WebSocket', { url: this.redactToken(url) });

    try {
      // Create WebSocket instance (works in browser, React Native, and Node.js with 'ws' package)
      this.ws = new WebSocket(url);

      this.ws.onopen = () => this.handleOpen();
      this.ws.onmessage = (event) => this.handleMessage(event);
      this.ws.onerror = (error) => this.handleError(error);
      this.ws.onclose = () => this.handleClose();
    } catch (error) {
      LOGGER.error('Failed to create WebSocket', { error });
      this.emitConnectionState('error');
      this.emitError(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Disconnect from the WebSocket server
   */
  public disconnect(): void {
    this.stopHeartbeat();
    this.cancelReconnect();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.emitConnectionState('disconnected');
  }

  /**
   * Send a message to the server
   */
  public send(data: Record<string, unknown>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      LOGGER.warn('Cannot send message - WebSocket not connected');
      return;
    }

    try {
      this.ws.send(JSON.stringify(data));
    } catch (error) {
      LOGGER.error('Failed to send message', { error });
      this.emitError(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Subscribe to a specific event type
   */
  public on(eventType: 'connected', handler: EventHandler<void>): UnsubscribeFn;
  public on(
    eventType: 'disconnected',
    handler: EventHandler<void>,
  ): UnsubscribeFn;
  public on(eventType: 'error', handler: EventHandler<Error>): UnsubscribeFn;
  public on(
    eventType: 'message',
    handler: EventHandler<WebSocketMessage>,
  ): UnsubscribeFn;
  public on(
    eventType: string,
    handler: EventHandler<NotificationData>,
  ): UnsubscribeFn;
  public on(
    eventType: string,
    handler:
      | EventHandler<void>
      | EventHandler<Error>
      | EventHandler<WebSocketMessage>
      | EventHandler<NotificationData>,
  ): UnsubscribeFn {
    // Handle connection state events
    if (eventType === 'connected' || eventType === 'disconnected') {
      const wrappedHandler = (state: ConnectionState) => {
        if (state === eventType) {
          (handler as EventHandler<void>)(undefined as unknown as void);
        }
      };
      this.connectionHandlers.add(wrappedHandler);
      return () => this.connectionHandlers.delete(wrappedHandler);
    }

    // Handle error events
    if (eventType === 'error') {
      this.errorHandlers.add(handler as EventHandler<Error>);
      return () => this.errorHandlers.delete(handler as EventHandler<Error>);
    }

    // Handle message events
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, new Set());
    }

    const handlers = this.eventHandlers.get(eventType);
    if (handlers) {
      handlers.add(handler as EventHandler);
    }

    return () => {
      const handlers = this.eventHandlers.get(eventType);
      if (handlers) {
        handlers.delete(handler as EventHandler);
        if (handlers.size === 0) {
          this.eventHandlers.delete(eventType);
        }
      }
    };
  }

  /**
   * Unsubscribe from a specific event type
   */
  public off(eventType: string, handler: EventHandler): void {
    const handlers = this.eventHandlers.get(eventType);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.eventHandlers.delete(eventType);
      }
    }
  }

  /**
   * Update connection context (e.g., when navigating to a different page)
   */
  public updateContext(context: {
    leagueId?: number;
    matchupId?: number;
    viewContext?: 'general' | 'league' | 'matchup' | 'roster' | 'chat' | 'dm';
  }): void {
    if (context.leagueId !== undefined) {
      this.options.leagueId = context.leagueId;
    }
    if (context.matchupId !== undefined) {
      this.options.matchupId = context.matchupId;
    }
    if (context.viewContext !== undefined) {
      this.options.viewContext = context.viewContext;
    }

    // Reconnect with new context if currently connected
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.disconnect();
      this.connect();
    }
  }

  /**
   * Dispose of the client and clean up resources
   */
  public dispose(): void {
    if (this.disposed) {
      return;
    }

    LOGGER.debug('Disposing WebSocketClient');

    this.disposed = true;
    this.disconnect();
    this.eventHandlers.clear();
    this.connectionHandlers.clear();
    this.errorHandlers.clear();
  }

  /**
   * Get current connection state
   */
  public getState(): ConnectionState {
    if (!this.ws) return 'disconnected';

    switch (this.ws.readyState) {
      case WebSocket.CONNECTING:
        return 'connecting';
      case WebSocket.OPEN:
        return 'connected';
      case WebSocket.CLOSING:
      case WebSocket.CLOSED:
        return 'disconnected';
      default:
        return 'disconnected';
    }
  }

  /**
   * Change the heartbeat interval and restart the heartbeat timer.
   *
   * Use a shorter interval (e.g. 15 s) during transient high-value windows
   * like active drafts so zombie connections are detected quickly, then reset
   * to the default (8 min) once the window closes.
   *
   * Pass `undefined` or `0` to restore the default interval.
   */
  public setHeartbeatInterval(ms?: number): void {
    this.heartbeatMs = ms && ms > 0 ? ms : DEFAULT_HEARTBEAT_MS;
    // Restart the heartbeat with the new cadence if we are already connected.
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.startHeartbeat();
    }
  }

  /**
   * Build WebSocket URL with query parameters
   */
  private buildUrl(): string {
    const url = new URL(this.options.url);

    if (this.options.token) {
      url.searchParams.set('token', this.options.token);
    }
    if (this.options.leagueId) {
      url.searchParams.set('leagueId', String(this.options.leagueId));
    }
    if (this.options.matchupId) {
      url.searchParams.set('matchupId', String(this.options.matchupId));
    }
    url.searchParams.set('viewContext', this.options.viewContext);

    return url.toString();
  }

  /**
   * Redact token from URL for logging
   */
  private redactToken(url: string): string {
    return url.replace(/token=[^&]+/, 'token=REDACTED');
  }

  /**
   * Handle WebSocket open event
   */
  private handleOpen(): void {
    if (this.reconnectAttempts > 0) {
      LOGGER.info(
        `WebSocket reconnected after ${this.reconnectAttempts} attempt(s)`,
      );
    } else {
      LOGGER.info('WebSocket connected (initial)');
    }
    this.reconnectAttempts = 0;
    this.consecutivePings = 0;
    this.lastMessageTime = Date.now();
    this.startHeartbeat();
    this.emitConnectionState('connected');
  }

  /**
   * Handle WebSocket message event
   */
  private handleMessage(event: MessageEvent): void {
    this.lastMessageTime = Date.now();
    this.consecutivePings = 0;

    try {
      const message = JSON.parse(String(event.data)) as WebSocketMessage;

      // Handle pong responses
      if (message.type === 'pong') {
        LOGGER.debug('Received pong');
        return;
      }

      LOGGER.debug('WebSocket message received', { type: message.type });

      // Emit to 'message' handlers (generic)
      const messageHandlers = this.eventHandlers.get('message');
      if (messageHandlers) {
        messageHandlers.forEach((handler) => handler(message));
      }

      // Emit to type-specific handlers
      const typeHandlers = this.eventHandlers.get(message.type);
      if (typeHandlers) {
        typeHandlers.forEach((handler) => handler(message));
      }

      // For 'notification' messages, re-dispatch based on data.type (UPPER_SNAKE → kebab-case)
      // e.g. { type: 'notification', data: { type: 'DRAFT_PICK_MADE', ... } }
      //   → dispatches to 'draft-pick-made' handlers with data as payload
      if (
        message.type === 'notification' &&
        message.data &&
        typeof message.data['type'] === 'string'
      ) {
        const notificationEventType = wireToClientEventName(
          message.data['type'],
        );
        const notificationHandlers = this.eventHandlers.get(
          notificationEventType,
        );
        if (notificationHandlers) {
          notificationHandlers.forEach((handler) =>
            handler(message.data as unknown as WebSocketMessage),
          );
        }
      }
    } catch (error) {
      LOGGER.error('Failed to parse WebSocket message', { error });
      this.emitError(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Handle WebSocket error event.
   *
   * Per the WebSocket spec, `onerror` is always followed by `onclose`.
   * When reconnection is enabled, `handleClose` handles recovery so
   * we only log here.  When reconnection is disabled the error is
   * unrecoverable and must be surfaced to subscribers.
   */
  private handleError(error: Event): void {
    // Always skip processing when the client has been disposed — avoids
    // spurious error events leaking to subscribers during normal teardown.
    if (this.disposed) {
      return;
    }

    const errorInfo = { type: error.type };

    if (this.options.reconnect) {
      LOGGER.warn('WebSocket error (will auto-reconnect)', {
        error: errorInfo,
      });
      return;
    }

    LOGGER.warn('WebSocket error', { error: errorInfo });
    this.emitConnectionState('error');
    this.emitError(new Error('WebSocket error'));
  }

  /**
   * Handle WebSocket close event
   */
  private handleClose(): void {
    if (this.options.reconnect && !this.disposed) {
      LOGGER.info('WebSocket connection dropped — will auto-reconnect');
    } else {
      LOGGER.info('WebSocket disconnected');
    }
    this.stopHeartbeat();
    this.emitConnectionState('disconnected');

    if (this.options.reconnect && !this.disposed) {
      this.scheduleReconnect();
    }
  }

  /**
   * Start heartbeat mechanism
   * Sends pings when idle longer than the current heartbeat interval.
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();

    this.heartbeatInterval = setInterval(() => {
      const timeSinceLastMessage = Date.now() - this.lastMessageTime;

      // Only ping if idle for the configured interval
      if (timeSinceLastMessage >= this.heartbeatMs) {
        this.consecutivePings++;

        // Disconnect if no response after 3 consecutive pings
        if (this.consecutivePings >= MAX_CONSECUTIVE_PINGS) {
          LOGGER.warn('No pong response after 3 pings, disconnecting');
          this.disconnect();
          return;
        }

        LOGGER.debug('Sending heartbeat ping', {
          idleMs: timeSinceLastMessage,
          intervalMs: this.heartbeatMs,
        });
        this.send({ type: 'ping' });
      } else {
        // Reset ping counter if we received messages
        this.consecutivePings = 0;
      }
    }, this.heartbeatMs);
  }

  /**
   * Stop heartbeat mechanism
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Schedule a reconnection attempt with exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
      LOGGER.error('Max reconnection attempts reached');
      return;
    }

    this.cancelReconnect();

    // Calculate delay with exponential backoff: 1s → 2s → 4s → 8s → 16s → 30s (max)
    const delay = Math.min(
      this.options.reconnectDelay * Math.pow(2, this.reconnectAttempts),
      this.options.maxReconnectDelay,
    );

    this.reconnectAttempts++;

    LOGGER.info(
      `Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`,
    );

    this.reconnectTimeout = setTimeout(() => {
      if (!this.disposed) {
        this.connect();
      }
    }, delay);
  }

  /**
   * Cancel any pending reconnection attempt
   */
  private cancelReconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  /**
   * Emit connection state to handlers
   */
  private emitConnectionState(state: ConnectionState): void {
    this.connectionHandlers.forEach((handler) => handler(state));
  }

  /**
   * Emit error to handlers
   */
  private emitError(error: Error): void {
    this.errorHandlers.forEach((handler) => handler(error));
  }
}
