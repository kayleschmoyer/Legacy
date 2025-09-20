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

// Logger setup with fallback
let LOGGER: {
  error: (...args: unknown[]) => void;
};

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  const logging = require('@legacy-sports/logging') as {
    LOGGER: {
      error: (...args: unknown[]) => void;
    };
  };
  LOGGER = logging.LOGGER;
} catch {
  // Fallback for test environment
  LOGGER = {
    error: (...args: unknown[]) => {
      // eslint-disable-next-line no-console
      console.error(...args);
    },
  };
}

export function handleError(err: unknown): void {
  const message = getMessageFromError(err);

  // TODO: Replace with better error handling solution
  LOGGER.error('Error occurred:', message);
}
