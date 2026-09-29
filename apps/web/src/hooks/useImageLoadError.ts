import { useCallback, useState } from 'react';

/**
 * Tracks whether the image at `src` failed to load.
 *
 * The failure is remembered per-URL, so the error state clears as soon as
 * `src` changes. A plain boolean would stay stuck once the broken `<img>` is
 * unmounted (its `onLoad` can then never fire to reset it), leaving the
 * fallback showing even after a new, valid URL is selected.
 */
export function useImageLoadError(src: string | null): {
  hasError: boolean;
  onError: () => void;
} {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const onError = useCallback(() => setFailedSrc(src), [src]);
  return { hasError: src !== null && failedSrc === src, onError };
}
