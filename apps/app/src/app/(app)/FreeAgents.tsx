import React from 'react';
import { FreeAgents as SharedFreeAgents } from '@legacy-sports/shared-components';

/**
 * Mobile Free Agents Screen
 *
 * Wraps the shared FreeAgents component for mobile use.
 * The shared component handles search, filtering, position tabs,
 * and waiver claim modals cross-platform.
 */
export default function FreeAgentsScreen() {
  return <SharedFreeAgents />;
}
