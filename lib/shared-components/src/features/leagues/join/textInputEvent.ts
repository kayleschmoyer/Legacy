/**
 * Cross-platform text-input change plumbing (LS-8812).
 *
 * Tamagui's `Input` forwards `onChangeText` only on native — on web the prop is
 * not a DOM attribute and is silently dropped, leaving the field inert. Both
 * platforms *do* fire `onChange`, so these components wire that instead and
 * read whichever payload the platform supplies: React Native puts the text on
 * `nativeEvent.text`, the DOM puts it on `target.value`.
 */

/**
 * The subset of a change event these helpers read.
 *
 * `target` is deliberately `unknown`: React Native types it as a
 * `ReactNativeElement` (no `value`), so narrowing it here would make the RN
 * event un-assignable to this shape.
 */
export interface TextChangeEvent {
  nativeEvent?: { text?: string };
  target?: unknown;
}

/** The new text from a change event, or undefined if the event carries none. */
export function textChangeValue(event: TextChangeEvent): string | undefined {
  if (typeof event?.nativeEvent?.text === 'string') {
    return event.nativeEvent.text;
  }
  const target = event?.target as { value?: unknown } | undefined;
  return typeof target?.value === 'string' ? target.value : undefined;
}

/**
 * Wrap a plain `(text: string) => void` callback as an `onChange` handler that
 * works on both platforms. `transform` lets a caller normalize the value (e.g.
 * upper-casing an invite code) without duplicating the extraction logic.
 */
export function onTextChange(
  handler: (text: string) => void,
  transform?: (text: string) => string,
): (event: TextChangeEvent) => void {
  return (event) => {
    const value = textChangeValue(event);
    if (value === undefined) return;
    handler(transform ? transform(value) : value);
  };
}
