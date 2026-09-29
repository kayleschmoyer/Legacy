import { act, renderHook } from '@testing-library/react';
import { useImageLoadError } from './useImageLoadError';

describe('useImageLoadError', () => {
  it('starts without an error', () => {
    const { result } = renderHook(() => useImageLoadError('a.png'));
    expect(result.current.hasError).toBe(false);
  });

  it('reports an error after the current src fails', () => {
    const { result } = renderHook(() => useImageLoadError('a.png'));
    act(() => result.current.onError());
    expect(result.current.hasError).toBe(true);
  });

  it('clears the error when a new src is selected (LS-7210)', () => {
    const { result, rerender } = renderHook(
      ({ src }: { src: string | null }) => useImageLoadError(src),
      { initialProps: { src: 'broken.png' } },
    );
    act(() => result.current.onError());
    expect(result.current.hasError).toBe(true);

    rerender({ src: 'valid.png' });
    expect(result.current.hasError).toBe(false);
  });

  it('errors again if the new src also fails', () => {
    const { result, rerender } = renderHook(
      ({ src }: { src: string | null }) => useImageLoadError(src),
      { initialProps: { src: 'broken.png' } },
    );
    act(() => result.current.onError());
    rerender({ src: 'also-broken.png' });
    expect(result.current.hasError).toBe(false);
    act(() => result.current.onError());
    expect(result.current.hasError).toBe(true);
  });

  it('never reports an error for a null src', () => {
    const { result } = renderHook(() => useImageLoadError(null));
    act(() => result.current.onError());
    expect(result.current.hasError).toBe(false);
  });
});
