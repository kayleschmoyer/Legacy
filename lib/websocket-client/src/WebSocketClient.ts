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
/** API Gateway drops a WebSocket connection after this long with no activity. */
const API_GATEWAY_IDLE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
// Half the API Gateway idle timeout, so an idle connection always gets a
// second ping cycle inside the timeout window even if the first ping's pong
// is delayed — an 8-minute default against the same 10-minute timeout left
// only one untried cycle before the socket died mid-draft (LS-8880).
const DEFAULT_HEARTBEAT_MS = API_GATEWAY_IDLE_TIMEOUT_MS / 2; // 5 minutes
const MAX_CONSECUTIVE_PINGS = 3;
// A permanently-rejected connection (bad origin, revoked user, expired/
// malformed token) must not retry forever — see LS-8881. Neither browsers
// nor Node's native WebSocket expose the handshake's HTTP status to JS (both
// report a generic failure), so a 401/403 is indistinguishable client-side
// from a transient drop that happens to fail on every attempt. Bounding
// attempts — and surfacing a user-visible error once the budget is spent —
// is what actually stops the infinite loop. Finite by default; callers that
// genuinely want unbounded retries can still pass Infinity explicitly.
const DEFAULT_MAX_RECONNECT_ATTEMPTS = 10;
// After the attempt budget is spent, `reconnectNow()` already covers the
// cases where something external tells us the world changed (app
// foregrounded — LS-8985; browser `online`/`visibilitychange` — LS-9220).
// But a backend/gateway blip that outlasts the budget while the tab stays
// visible and the browser's own connectivity never drops triggers none of
// those signals, so the client stayed dead until a manual page reload
// (LS-9489). Give it exactly one unprompted retry with a fresh budget after
// a long cooldown — long enough to not meaningfully add to the
// permanently-rejected-connection load LS-8881 was written to bound, but
// enough to recover from a blip that resolves within a couple of minutes.
// If that retry cycle also exhausts its budget, give up for good; a
// permanently-rejected connection (bad origin, revoked user) still only
// ever retries twice as long as before, never forever.
const GIVE_UP_COOLDOWN_MS = 2 * 60 * 1000; // 2 minutes

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
  private giveUpCooldownTimeout: ReturnType<typeof setTimeout> | null = null;
  private hasRetriedAfterGiveUp = false;
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
      draftId: options.draftId,
      viewContext: options.viewContext || 'general',
      autoConnect: options.autoConnect ?? true,
      reconnect: options.reconnect ?? true,
      maxReconnectAttempts:
        options.maxReconnectAttempts ?? DEFAULT_MAX_RECONNECT_ATTEMPTS,
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

    if (this.ws?.readyState === WebSocket.OPEN) {
      LOGGER.debug('Already connected');
      return;
    }

    if (!this.options.token) {
      LOGGER.debug(
        'No auth token provided — connection will rely on cookie-based auth.',
      );
    } else if (this.isTokenExpired()) {
      LOGGER.warn(
        'WebSocket token expired — skipping connection attempt. ' +
          'Recreate the client or provide a fresh token before reconnecting.',
      );
      this.cancelReconnect();
      this.emitError(new Error('Token expired'));
      return;
    }

    // Build connection URL with query parameters
    const url = this.buildUrl();

    LOGGER.debug('Connecting to WebSocket', { url: this.redactToken(url) });

    try {
      // A previous socket that never opened (or already closed) would
      // otherwise be orphaned with live handlers — retire it first.
      if (this.ws) {
        this.closeDetached(this.ws);
        this.ws = null;
      }

      // Create WebSocket instance (works in browser, React Native, and Node.js with 'ws' package)
      const ws = new WebSocket(url);
      this.ws = ws;

      // Bind every handler to *this* socket instance, not to whatever
      // `this.ws` happens to be when the event fires (LS-10593). Closing a
      // socket is asynchronous, so after `disconnect(); connect()` (e.g. a
      // forced reconnect on app foreground) the old socket's late `onclose`
      // used to land after the new socket was created — stopping the new
      // socket's heartbeat, emitting a spurious 'disconnected' and scheduling
      // a duplicate reconnect. Events from a superseded socket are ignored.
      ws.onopen = () => {
        if (this.ws === ws) this.handleOpen();
      };
      ws.onmessage = (event) => {
        if (this.ws === ws) this.handleMessage(event);
      };
      ws.onerror = (error) => {
        if (this.ws === ws) this.handleError(error);
      };
      ws.onclose = () => {
        if (this.ws === ws) this.handleClose();
      };
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
      this.closeDetached(this.ws);
      this.ws = null;
    }

    this.emitConnectionState('disconnected');
  }

  /**
   * Close a socket without letting any of its (late, asynchronous) events
   * reach the client — see the per-socket handler guard in `connect()`
   * (LS-10593).
   */
  private closeDetached(ws: WebSocket): void {
    ws.onopen = null;
    ws.onmessage = null;
    ws.onerror = null;
    ws.onclose = null;
    try {
      ws.close();
    } catch (error) {
      LOGGER.debug('Error closing superseded WebSocket', { error });
    }
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
          (handler as EventHandler<void>)(undefined);
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
   * Update connection context (e.g., when navigating to a different page).
   *
   * Sends the server's `updateContext` action over the existing connection
   * rather than tearing down and reopening the socket — this is what
   * exercises the server's re-authorization + TTL-refresh path
   * (`lambdas/websocket/src/index.ts` `handleUpdateContext`) instead of
   * silently reconnecting past it. If not currently connected, the new
   * context is applied locally and takes effect on the next `connect()`.
   */
  public updateContext(context: {
    leagueId?: number;
    matchupId?: number;
    draftId?: number;
    viewContext?: RequiredWebSocketClientOptions['viewContext'];
  }): void {
    if (context.leagueId !== undefined) {
      this.options.leagueId = context.leagueId;
    }
    if (context.matchupId !== undefined) {
      this.options.matchupId = context.matchupId;
    }
    if (context.draftId !== undefined) {
      this.options.draftId = context.draftId;
    }
    if (context.viewContext !== undefined) {
      this.options.viewContext = context.viewContext;
    }

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.send({ action: 'updateContext', data: context });
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
   * to the default (5 min) once the window closes.
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
   * Update the auth token used for future connect attempts.
   *
   * Does NOT tear down or reconnect an already-open connection — the token is
   * only read at connect time (via `buildUrl`), so this only takes effect on
   * the next `connect()` call (e.g. after a drop-and-reconnect). Use this when
   * a fresh token becomes available (e.g. JWT refresh) instead of disposing
   * and recreating the client, which would needlessly interrupt a live socket.
   */
  public updateToken(token: string | undefined): void {
    this.options.token = token;
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
    if (this.options.draftId) {
      url.searchParams.set('draftId', String(this.options.draftId));
    }
    url.searchParams.set('viewContext', this.options.viewContext);

    return url.toString();
  }

  /**
   * Check if the JWT token has expired (or will within 30 s).
   * Decodes the payload without signature verification — the server
   * will do full verification. This is a client-side guard to avoid
   * futile reconnection attempts with a known-expired token.
   */
  private isTokenExpired(): boolean {
    const token = this.options.token;
    if (!token) return false; // No token → cookie-based auth, can't check

    try {
      const parts = token.split('.');
      if (parts.length !== 3) return false;

      const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
      const payload = JSON.parse(atob(padded)) as { exp?: number };

      if (!payload.exp) return false;

      // Treat the token as expired 30 s before actual expiry to avoid
      // races where the connection handshake starts just before expiry.
      const BUFFER_MS = 30_000;
      return Date.now() >= payload.exp * 1000 - BUFFER_MS;
    } catch {
      return false; // Can't decode → don't block the connection
    }
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
    this.hasRetriedAfterGiveUp = false;
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
          // A zombie socket is a dropped connection, not a deliberate
          // disconnect — `disconnect()` would cancel reconnection and leave
          // the client dead (LS-10593). Retire the socket without waiting
          // for its (possibly never-arriving) close event, then recover
          // through the normal reconnect path.
          LOGGER.warn('No pong response after 3 pings, reconnecting');
          this.stopHeartbeat();
          if (this.ws) {
            this.closeDetached(this.ws);
            this.ws = null;
          }
          this.emitConnectionState('disconnected');
          if (this.options.reconnect && !this.disposed) {
            this.scheduleReconnect();
          }
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
      // A connection that keeps failing after the full attempt budget is
      // most likely a permanent rejection (bad origin, revoked user,
      // expired/malformed token) rather than a transient drop — the client
      // can't tell the two apart (see the constant comment above), but it
      // must stop burning battery/network and server-side connect+DB-auth
      // load either way (LS-8881). Surface it so subscribers (e.g. the
      // `useWebSocket` hook) can show a real error instead of silently
      // staying disconnected forever.
      // Log level depends on whether this is genuinely terminal.
      // `scheduleGiveUpCooldownRetry()` below queues one more attempt after
      // `GIVE_UP_COOLDOWN_MS` — on the *first* exhaustion that retry hasn't
      // run yet, so the client hasn't actually given up: it's likely a
      // transient backend/gateway blip that self-heals within the cooldown
      // window (LS-9489). `LOGGER.error` auto-forwards to Rollbar
      // (`RollbarOutputDestination`), so reporting an error here for every
      // such blip is a false positive — LS-9629 saw exactly this, flooding
      // Rollbar with "giving up" reports for connections that recovered two
      // minutes later. Only escalate to `error` once the cooldown retry has
      // already fired and *also* exhausted its budget (`hasRetriedAfterGiveUp`
      // already true) — that is the truly terminal, alert-worthy case.
      if (this.hasRetriedAfterGiveUp) {
        LOGGER.error(
          'Max reconnection attempts reached — giving up',
          new Error('Max reconnection attempts reached'),
          { attempts: this.reconnectAttempts },
        );
      } else {
        LOGGER.warn(
          'Max reconnection attempts reached — retrying once more after cooldown',
          { attempts: this.reconnectAttempts },
        );
      }
      this.emitConnectionState('error');
      this.emitError(new Error('Max reconnection attempts reached'));
      this.scheduleGiveUpCooldownRetry();
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
   * Force a reconnection attempt with a fresh attempt budget, bypassing any
   * pending backoff timer.
   *
   * Use after the client has already given up (see `scheduleReconnect`) when
   * an external signal suggests connectivity may have returned — e.g. the
   * app coming back to the foreground after a spell of flaky mobile network
   * that burned through the full reconnect budget (LS-8985). Giving up is
   * still correct behaviour for a permanently-rejected connection (LS-8881),
   * but nothing should keep it giving up forever once the world around it
   * has changed. No-op if disposed or already connected.
   */
  public reconnectNow(): void {
    if (
      this.disposed ||
      this.ws?.readyState === WebSocket.OPEN ||
      this.ws?.readyState === WebSocket.CONNECTING
    ) {
      return;
    }

    this.cancelReconnect();
    this.reconnectAttempts = 0;
    this.hasRetriedAfterGiveUp = false;
    this.connect();
  }

  /**
   * Cancel any pending reconnection attempt
   */
  private cancelReconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.giveUpCooldownTimeout) {
      clearTimeout(this.giveUpCooldownTimeout);
      this.giveUpCooldownTimeout = null;
    }
  }

  /**
   * After the reconnect attempt budget is exhausted, wait out a long
   * cooldown and try once more with a fresh budget — see the
   * `GIVE_UP_COOLDOWN_MS` comment for why this exists. Only ever fires once
   * per give-up; if the retried cycle also exhausts its budget, this is not
   * called again and the client stays given-up until something external
   * (`reconnectNow`) tries again.
   */
  private scheduleGiveUpCooldownRetry(): void {
    if (this.hasRetriedAfterGiveUp) {
      return;
    }
    this.hasRetriedAfterGiveUp = true;

    this.giveUpCooldownTimeout = setTimeout(() => {
      this.giveUpCooldownTimeout = null;
      if (this.disposed || this.ws?.readyState === WebSocket.OPEN) {
        return;
      }
      LOGGER.info('Retrying connection after give-up cooldown', {
        cooldownMs: GIVE_UP_COOLDOWN_MS,
      });
      this.reconnectAttempts = 0;
      this.connect();
    }, GIVE_UP_COOLDOWN_MS);
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
