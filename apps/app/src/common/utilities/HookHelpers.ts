import { getMessageFromError } from '@legacy-sports/utils';
import { useEffect, useState } from 'react';

export interface AsyncHookResult<T> {
  loading: boolean;
  data: T | null;
  error: Error | null;
}

export function useAsyncHook<T>(
  promiseCreator: () => Promise<T>
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
  }, [setData, setLoading, setError, promiseCreator]);

  return {
    data,
    error,
    loading,
  };
}
