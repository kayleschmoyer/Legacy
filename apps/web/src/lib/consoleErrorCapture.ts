/** Maximum number of errors kept in the ring buffer. */
const MAX_ERRORS = 10;

export interface CapturedError {
  message: string;
  source?: string;
  lineno?: number;
  colno?: number;
  timestamp: string;
}

const buffer: CapturedError[] = [];
let installed = false;

function push(entry: CapturedError): void {
  if (buffer.length >= MAX_ERRORS) buffer.shift();
  buffer.push(entry);
}

/**
 * Install global error listeners. Safe to call multiple times — installs once.
 * Call early in app bootstrap (e.g. main.tsx) so errors before the bug dialog
 * opens are captured.
 */
export function installConsoleErrorCapture(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  window.addEventListener('error', (e) => {
    push({
      message: e.message || String(e.error ?? 'Unknown error'),
      source: e.filename,
      lineno: e.lineno,
      colno: e.colno,
      timestamp: new Date().toISOString(),
    });
  });

  window.addEventListener('unhandledrejection', (e) => {
    const reason: unknown = e.reason;
    const message =
      reason instanceof Error
        ? reason.message
        : typeof reason === 'string'
          ? reason
          : JSON.stringify(reason);
    push({
      message: `Unhandled rejection: ${message}`,
      timestamp: new Date().toISOString(),
    });
  });
}

/** Return a snapshot of captured errors (most recent last). */
export function getCapturedErrors(): CapturedError[] {
  return [...buffer];
}
