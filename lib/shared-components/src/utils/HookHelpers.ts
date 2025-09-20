import { useEffect, useState } from 'react';

// Simple error message extraction function to avoid server dependencies
function getMessageFromError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'An unknown error occurred';
}

export interface AsyncHookResult<T> {
  loading: boolean;
  data: T | null;
  error: Error | null;
}

export function useAsyncHook<T>(
  promiseCreator: () => Promise<T>,
  deps?: React.DependencyList,
): AsyncHookResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    promiseCreator()
      .then((result) => {
        setData(result);
      })
      .catch((err) => {
        const message = getMessageFromError(err);
        setError(new Error(message));
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return {
    data,
    error,
    loading,
  };
}
