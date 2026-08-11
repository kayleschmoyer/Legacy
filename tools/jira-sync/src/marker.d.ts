/**
 * Type declarations for marker.js.
 */

export interface MarkerResult {
  /** Whether a jira-link comment block exists at all. */
  present: boolean;
  /** Whether the block parsed cleanly (false implies present). */
  valid: boolean;
  /** Uppercased primary key, or null when `primary: none` was declared or the marker is absent/invalid. */
  primary: string | null;
  /** Uppercased related keys (informational only). */
  related: string[];
  /** Parse error description when valid is false. */
  error?: string;
}

export function parseMarker(body: string | null | undefined): MarkerResult;
