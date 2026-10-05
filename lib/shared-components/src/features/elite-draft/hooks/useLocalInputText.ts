import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Local text state for a controlled search input whose canonical value lives
 * far up the tree (LS-10593).
 *
 * The draft search box used to feed `value` straight from screen-level state,
 * so every keystroke round-tripped through a re-render of the whole draft
 * room before reaching the native TextInput. On Android that stale echo
 * restores the caret to where it was before the keystroke — typing at the
 * start of the text came out reversed ("abc" → "cba"), and a pick landing
 * mid-typing (another full re-render) made it worse. The input now renders
 * from its own cheap state; external changes that didn't originate here
 * (the "Clear search" ×) are still adopted.
 */
export function useLocalInputText(
  value: string,
  onChange: (next: string) => void,
): [string, (next: string) => void] {
  const [text, setText] = useState(value);
  const lastEmittedRef = useRef(value);

  useEffect(() => {
    if (value !== lastEmittedRef.current) {
      lastEmittedRef.current = value;
      setText(value);
    }
  }, [value]);

  const handleChange = useCallback(
    (next: string) => {
      lastEmittedRef.current = next;
      setText(next);
      onChange(next);
    },
    [onChange],
  );

  return [text, handleChange];
}
