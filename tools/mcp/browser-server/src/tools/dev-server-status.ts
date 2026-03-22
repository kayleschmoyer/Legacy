import { state } from '../state.js';
import type { ToolResult } from '../types.js';

export async function devServerStatus(): Promise<ToolResult> {
  const servers = Array.from(state.devServers.values());

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          count: servers.length,
          servers,
          browserActive: state.browser !== null,
          pageUrl: state.page?.url() ?? null,
        }),
      },
    ],
  };
}
