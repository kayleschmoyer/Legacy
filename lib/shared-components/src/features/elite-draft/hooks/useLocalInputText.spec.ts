import { act, renderHook } from '@testing-library/react';
import { useLocalInputText } from './useLocalInputText';

describe('useLocalInputText (LS-10593)', () => {
  it('renders from local text immediately and forwards each change', () => {
    const onChange = jest.fn();
    const { result } = renderHook(() => useLocalInputText('', onChange));
    act(() => result.current[1]('a'));
    expect(result.current[0]).toBe('a');
    expect(onChange).toHaveBeenCalledWith('a');
  });

  it('ignores the parent echoing back a value it already emitted', () => {
    const onChange = jest.fn();
    const { result, rerender } = renderHook(
      ({ value }) => useLocalInputText(value, onChange),
      { initialProps: { value: '' } },
    );
    act(() => result.current[1]('ba'));
    // A lagging parent re-render still carrying an older keystroke must not
    // clobber what the user has typed since.
    rerender({ value: 'ba' });
    expect(result.current[0]).toBe('ba');
  });

  it('adopts external changes such as clearing the search', () => {
    const onChange = jest.fn();
    const { result, rerender } = renderHook(
      ({ value }) => useLocalInputText(value, onChange),
      { initialProps: { value: 'smith' } },
    );
    expect(result.current[0]).toBe('smith');
    rerender({ value: '' });
    expect(result.current[0]).toBe('');
  });
});
