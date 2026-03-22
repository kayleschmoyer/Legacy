import type { Browser, BrowserContext, Page } from 'playwright';

export interface DevServer {
  port: number;
  worktreePath: string;
  pid: number;
  startedAt: string;
}

export interface BrowserState {
  /** Running dev servers keyed by port */
  devServers: Map<number, DevServer>;
  /** Playwright browser instance (lazy-initialized) */
  browser: Browser | null;
  /** Browser context for the current session */
  context: BrowserContext | null;
  /** Active page */
  page: Page | null;
}

/** Singleton in-memory state for this MCP session. */
export const state: BrowserState = {
  devServers: new Map(),
  browser: null,
  context: null,
  page: null,
};
