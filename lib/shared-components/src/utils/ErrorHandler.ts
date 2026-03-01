// Simple logger fallback for ErrorHandler
const LOGGER = {
  warn: (message: string, ...args: unknown[]) => console.warn(message, ...args),
  error: (message: string, ...args: unknown[]) =>
    console.error(message, ...args),
  info: (message: string, ...args: unknown[]) => console.info(message, ...args),
};

// Simple error message extraction function - browser compatible
function getMessageFromError(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  if (typeof err === 'string') {
    return err;
  }
  return 'An unknown error occurred';
}

export function handleError(err: unknown): void {
  const message = getMessageFromError(err);

  // TODO(LS-324): Replace with better error handling solution
  LOGGER.error('Error occurred:', message);
}
