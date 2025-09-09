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

  // TODO: Replace with better error handling solution
  console.error('Error occurred:', message);
}
