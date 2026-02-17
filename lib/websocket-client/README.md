# @legacy-sports/websocket-client

Framework-agnostic WebSocket client for real-time notifications across web, React Native, and Node.js environments.

## Features

- 🌐 **Universal**: Works in browsers, React Native, and Node.js
- 🔄 **Auto-reconnection**: Exponential backoff (1s → 2s → 4s → 8s → 16s → 30s max)
- 💓 **Smart Heartbeat**: Only pings during idle periods (8+ minutes without messages)
- 🎯 **Type-safe**: Full TypeScript support with typed event handlers
- 🧹 **Clean API**: Event-based with proper cleanup via unsubscribe functions
- 📦 **Zero React Dependencies**: Core client is framework-agnostic

## Installation

```bash
pnpm add @legacy-sports/websocket-client
```

**Note for Node.js/CLI:** The package automatically uses the `ws` library in Node.js environments. This is already configured as a workspace dependency.

## Usage

### Basic Example

```typescript
import { WebSocketClient } from '@legacy-sports/websocket-client';

const client = new WebSocketClient({
  url: 'wss://api.example.com/ws',
  token: 'your-auth-token',
  leagueId: 123,
  viewContext: 'league',
  autoConnect: true,
});

// Subscribe to events
const unsubscribe = client.on('draft-complete', (notification) => {
  console.log('Draft completed for league:', notification.leagueId);
});

// Later: cleanup
unsubscribe();
client.dispose();
```

### React Hook Example

```typescript
import { useEffect, useRef, useState } from 'react';
import { WebSocketClient } from '@legacy-sports/websocket-client';

function useWebSocket(leagueId: number) {
  const clientRef = useRef<WebSocketClient>();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const client = new WebSocketClient({
      url: process.env.WEBSOCKET_URL!,
      token: 'auth-token',
      leagueId,
      viewContext: 'league',
      autoConnect: true,
    });

    const unsubConnected = client.on('connected', () => setConnected(true));
    const unsubDisconnected = client.on('disconnected', () =>
      setConnected(false),
    );

    clientRef.current = client;

    return () => {
      unsubConnected();
      unsubDisconnected();
      client.dispose();
    };
  }, [leagueId]);

  return { client: clientRef.current, connected };
}
```

### Node.js CLI Example

```typescript
import { WebSocketClient } from '@legacy-sports/websocket-client';

async function waitForDraft(leagueId: number) {
  const client = new WebSocketClient({
    url: process.env.WEBSOCKET_URL!,
    token: process.env.API_TOKEN!,
    leagueId,
    viewContext: 'league',
    autoConnect: true,
    reconnect: false, // CLI manages connection manually
  });

  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      client.dispose();
      reject(new Error('Timeout waiting for draft'));
    }, 180000); // 3 minutes

    const unsubscribe = client.on('draft-complete', () => {
      clearTimeout(timeout);
      unsubscribe();
      client.dispose();
      resolve();
    });
  });
}
```

## API

### Constructor Options

```typescript
interface WebSocketClientOptions {
  /** WebSocket URL */
  url: string;
  /** Authentication token */
  token?: string;
  /** League ID for context */
  leagueId?: number;
  /** Matchup ID for context */
  matchupId?: number;
  /** View context for notifications */
  viewContext?: 'general' | 'league' | 'matchup' | 'roster';
  /** Auto-connect on instantiation (default: true) */
  autoConnect?: boolean;
  /** Enable auto-reconnect on disconnect (default: true) */
  reconnect?: boolean;
  /** Maximum reconnection attempts (default: Infinity) */
  maxReconnectAttempts?: number;
  /** Initial reconnection delay in ms (default: 1000) */
  reconnectDelay?: number;
  /** Maximum reconnection delay in ms (default: 30000) */
  maxReconnectDelay?: number;
}
```

### Methods

#### `connect(): void`

Manually connect to the WebSocket server.

#### `disconnect(): void`

Close the WebSocket connection and stop heartbeat.

#### `send(data: Record<string, unknown>): void`

Send a message to the server.

#### `on(eventType, handler): UnsubscribeFn`

Subscribe to events. Returns an unsubscribe function.

**Event Types:**

- `'connected'` - Connection established
- `'disconnected'` - Connection closed
- `'error'` - Error occurred
- `'message'` - Any message received
- `'draft-complete'` - Draft completed notification
- `'player-stats-loading'` - Player stats loading status
- `'player-stats-updated'` - Player stats updated
- `'matchup-stats-complete'` - Matchup stats completed

#### `off(eventType, handler): void`

Unsubscribe from events (alternative to using the unsubscribe function).

#### `updateContext(context): void`

Update connection context (reconnects if currently connected).

```typescript
client.updateContext({
  matchupId: 456,
  viewContext: 'matchup',
});
```

#### `dispose(): void`

Clean up resources and close connection. Call this when you're done with the client.

#### `getState(): ConnectionState`

Get current connection state: `'connecting' | 'connected' | 'disconnected' | 'error'`

## Notification Types

### Draft Completed

```typescript
interface DraftCompletedNotification {
  type: 'draft-complete';
  leagueId: number;
  draftType: string;
  completedAt: string;
}
```

### Player Stats Loading

```typescript
interface PlayerStatsLoadingNotification {
  type: 'player-stats-loading';
  leagueId: number;
  status: 'loading' | 'complete' | 'error';
  progress?: {
    current: number;
    total: number;
  };
}
```

### Player Stats Updated

```typescript
interface PlayerStatsUpdatedNotification {
  type: 'player-stats-updated';
  leagueId: number;
  playerId: number;
  stats: Record<string, unknown>;
}
```

### Matchup Stats Complete

```typescript
interface MatchupStatsCompleteNotification {
  type: 'matchup-stats-complete';
  leagueId: number;
  matchupId: number;
  completedAt: string;
}
```

## Architecture

### Smart Heartbeat

The heartbeat mechanism is designed to be efficient:

- **Only pings during idle periods**: No ping sent if regular messages are flowing
- **8-minute idle threshold**: Allows for natural message flow without unnecessary pings
- **3 consecutive pings timeout**: Disconnects if server doesn't respond to 3 pings
- **Automatic recovery**: Auto-reconnection kicks in if connection is lost

This approach is especially important for stats loading scenarios, where frequent notifications keep the connection naturally alive without needing heartbeat pings.

### Reconnection Strategy

Exponential backoff with configurable limits:

- Initial delay: 1 second
- Doubles on each attempt: 1s → 2s → 4s → 8s → 16s
- Max delay: 30 seconds (configurable)
- Max attempts: Infinity (configurable)

## Environment Support

- **Browser**: Uses native `WebSocket` API
- **React Native**: Uses native `WebSocket` API
- **Node.js**: Uses `ws` package (must be installed separately for CLI/backend usage)

For Node.js environments, ensure the `ws` package is available:

```bash
pnpm add ws
```

## Testing

The package includes comprehensive tests using mocked WebSocket:

```bash
nx test websocket-client
```

## License

Private - Part of Legacy Sports monorepo
