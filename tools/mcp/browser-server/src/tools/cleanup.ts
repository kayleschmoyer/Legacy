import { devServerStop } from './dev-server-stop.js';
import { state } from '../state.js';
import { jsonResult } from '../format.js';
import type { ToolResult } from '../types.js';

export async function cleanup(): Promise<ToolResult> {
  const results: string[] = [];

  // Close page
  if (state.page && !state.page.isClosed()) {
    await state.page.close();
    state.page = null;
    results.push('Closed active page');
  }

  // Close context
  if (state.context) {
    await state.context.close();
    state.context = null;
    results.push('Closed browser context');
  }

  // Close browser
  if (state.browser) {
    await state.browser.close();
    state.browser = null;
    results.push('Closed browser');
  }

  // Stop all dev servers
  const serverCount = state.devServers.size;
  if (serverCount > 0) {
    await devServerStop({ all: true });
    results.push(`Stopped ${serverCount} dev server(s)`);
  }

  return jsonResult({
    ok: true,
    actions: results.length > 0 ? results : ['Nothing to clean up'],
  });
}
