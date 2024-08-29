import { DependencyList, useEffect, useState } from 'react';

export interface AsyncHookResult<T> {
  loading: boolean;
  data: T | null;
  error: Error | null;
}

export function useAsyncHook<T>(
  promiseCreator: () => Promise<T>,
  dependencies: DependencyList,
): AsyncHookResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const awaitPromise = async () => {
      setLoading(true);
      setError(null);

      try {
        const result = await promiseCreator();
        setData(result);
      } catch (err) {
        if (err instanceof Error) {
          setError(err);
        } else if (typeof err === 'string') {
          setError(new Error(err));
        }
      } finally {
        setLoading(false);
      }
    };
    awaitPromise();
  }, [setData, setLoading, setError, ...dependencies]);

  return { data, loading, error };
}
