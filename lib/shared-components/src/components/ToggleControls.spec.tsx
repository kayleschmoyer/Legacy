import React from 'react';
import { fireEvent, screen } from '@testing-library/react';

import { SegmentedControl, type SegmentedOption } from './ToggleControls';
import { render } from '../test-utils';

const OPTIONS: SegmentedOption[] = [
  { value: 'all', label: 'All' },
  { value: 'mlb', label: 'MLB' },
  { value: 'nfl', label: 'NFL' },
];

function Harness({
  initial = 'all',
  onValueChange,
}: {
  initial?: string;
  onValueChange?: (value: string) => void;
}): React.JSX.Element {
  const [value, setValue] = React.useState(initial);
  return (
    <SegmentedControl
      options={OPTIONS}
      value={value}
      onValueChange={(next) => {
        setValue(next);
        onValueChange?.(next);
      }}
    />
  );
}

const radio = (name: string) => screen.getByRole('radio', { name });

describe('SegmentedControl — keyboard + screen reader (LS-10696)', () => {
  it('exposes a radiogroup whose options announce their checked state', () => {
    render(<Harness initial="mlb" />);

    expect(screen.getByRole('radiogroup')).toBeTruthy();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(radio('MLB').getAttribute('aria-checked')).toBe('true');
    expect(radio('All').getAttribute('aria-checked')).toBe('false');
    expect(radio('NFL').getAttribute('aria-checked')).toBe('false');
  });

  it('makes only the selected option a tab stop (roving tabindex)', () => {
    render(<Harness initial="mlb" />);

    expect(radio('MLB').getAttribute('tabindex')).toBe('0');
    expect(radio('All').getAttribute('tabindex')).toBe('-1');
    expect(radio('NFL').getAttribute('tabindex')).toBe('-1');
  });

  it('keeps the group reachable when no option matches the value', () => {
    render(<Harness initial="nope" />);

    expect(radio('All').getAttribute('tabindex')).toBe('0');
    expect(radio('MLB').getAttribute('tabindex')).toBe('-1');
  });

  it('arrow keys move focus and selection, wrapping at the ends', () => {
    const onValueChange = jest.fn();
    render(<Harness initial="all" onValueChange={onValueChange} />);

    fireEvent.keyDown(radio('All'), { key: 'ArrowRight' });
    expect(onValueChange).toHaveBeenLastCalledWith('mlb');
    expect(document.activeElement).toBe(radio('MLB'));
    expect(radio('MLB').getAttribute('tabindex')).toBe('0');
    expect(radio('All').getAttribute('tabindex')).toBe('-1');

    fireEvent.keyDown(radio('MLB'), { key: 'ArrowDown' });
    expect(onValueChange).toHaveBeenLastCalledWith('nfl');

    fireEvent.keyDown(radio('NFL'), { key: 'ArrowRight' });
    expect(onValueChange).toHaveBeenLastCalledWith('all');
    expect(document.activeElement).toBe(radio('All'));

    fireEvent.keyDown(radio('All'), { key: 'ArrowLeft' });
    expect(onValueChange).toHaveBeenLastCalledWith('nfl');

    fireEvent.keyDown(radio('NFL'), { key: 'ArrowUp' });
    expect(onValueChange).toHaveBeenLastCalledWith('mlb');
  });

  it('Home and End jump to the first and last option', () => {
    const onValueChange = jest.fn();
    render(<Harness initial="mlb" onValueChange={onValueChange} />);

    fireEvent.keyDown(radio('MLB'), { key: 'End' });
    expect(onValueChange).toHaveBeenLastCalledWith('nfl');
    expect(document.activeElement).toBe(radio('NFL'));

    fireEvent.keyDown(radio('NFL'), { key: 'Home' });
    expect(onValueChange).toHaveBeenLastCalledWith('all');
    expect(document.activeElement).toBe(radio('All'));
  });

  it('Enter and Space activate the focused option', () => {
    const onValueChange = jest.fn();
    render(<Harness initial="all" onValueChange={onValueChange} />);

    fireEvent.keyDown(radio('NFL'), { key: 'Enter' });
    expect(onValueChange).toHaveBeenLastCalledWith('nfl');

    fireEvent.keyDown(radio('MLB'), { key: ' ' });
    expect(onValueChange).toHaveBeenLastCalledWith('mlb');
  });

  it('ignores unrelated keys', () => {
    const onValueChange = jest.fn();
    render(<Harness initial="all" onValueChange={onValueChange} />);

    fireEvent.keyDown(radio('All'), { key: 'Tab' });
    fireEvent.keyDown(radio('All'), { key: 'a' });
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('pointer selection is unchanged', () => {
    const onValueChange = jest.fn();
    render(<Harness initial="all" onValueChange={onValueChange} />);

    fireEvent.click(radio('NFL'));
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenLastCalledWith('nfl');
    expect(radio('NFL').getAttribute('aria-checked')).toBe('true');
  });

  it('keeps arrow navigation scoped to its own group', () => {
    const first = jest.fn();
    const second = jest.fn();
    render(
      <div>
        <SegmentedControl options={OPTIONS} value="all" onValueChange={first} />
        <SegmentedControl
          options={[
            { value: 'x', label: 'X' },
            { value: 'y', label: 'Y' },
          ]}
          value="x"
          onValueChange={second}
        />
      </div>,
    );

    fireEvent.keyDown(screen.getByRole('radio', { name: 'NFL' }), {
      key: 'ArrowRight',
    });
    expect(first).toHaveBeenLastCalledWith('all');
    expect(second).not.toHaveBeenCalled();
  });
});
