import React from 'react';
import { fireEvent, screen } from '@testing-library/react';

import {
  Checkbox,
  SegmentedControl,
  type SegmentedOption,
} from './ToggleControls';
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

describe('Checkbox — checked state is visually distinct (LS-10798)', () => {
  type FrameProps = {
    checked?: boolean | 'indeterminate';
    backgroundColor?: string;
    borderColor?: string;
  };
  type TamaguiModule = { Checkbox: React.ComponentType<FrameProps> };
  const frameCalls: FrameProps[] = [];
  let original: TamaguiModule['Checkbox'];

  // Tamagui has no `$checked` pseudo, so the fill must be passed explicitly.
  // Record the props handed to the Tamagui frame by wrapping whichever mock
  // the web/mobile harness installed (a function on web, a forwardRef object
  // on mobile — so jest.spyOn can't be used). Patch the raw mocked module,
  // not an `import * as` interop copy, so ToggleControls sees the wrapper.
  beforeEach(() => {
    const tamagui = jest.requireMock<TamaguiModule>('tamagui');
    original = tamagui.Checkbox;
    const Original = original;
    tamagui.Checkbox = Object.assign(
      (props: FrameProps) => {
        frameCalls.push(props);
        return <Original {...props} />;
      },
      { Indicator: (original as unknown as { Indicator: unknown }).Indicator },
    );
  });
  afterEach(() => {
    jest.requireMock<TamaguiModule>('tamagui').Checkbox = original;
    frameCalls.length = 0;
  });

  // The web and mobile icon mocks use different test ids.
  const CHECK_ICON = /^Check(Icon)?$/;

  const lastFrameProps = (): FrameProps => frameCalls[frameCalls.length - 1];

  it('fills checked boxes navy with a gold border and renders the check mark', () => {
    render(<Checkbox checked aria-label="MVP" />);

    expect(lastFrameProps()).toMatchObject({
      checked: true,
      backgroundColor: '$brandNavy',
      borderColor: '$brandGold',
    });
    expect(screen.getByTestId(CHECK_ICON)).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'MVP' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('keeps unchecked boxes on the card surface with no check mark', () => {
    render(<Checkbox checked={false} aria-label="MVP" />);

    expect(lastFrameProps()).toMatchObject({
      checked: false,
      backgroundColor: '$surfaceCard',
      borderColor: '$outlineStrong',
    });
    expect(screen.queryByTestId(CHECK_ICON)).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'MVP' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('never passes the unsupported `$checked` style prop', () => {
    render(<Checkbox checked aria-label="MVP" />);

    expect(lastFrameProps()).not.toHaveProperty('$checked');
  });

  it('tracks state when uncontrolled so the fill follows toggles', () => {
    const onCheckedChange = jest.fn();
    render(
      <Checkbox
        defaultChecked
        onCheckedChange={onCheckedChange}
        aria-label="MVP"
      />,
    );
    expect(lastFrameProps().backgroundColor).toBe('$brandNavy');

    fireEvent.click(screen.getByRole('checkbox', { name: 'MVP' }));

    expect(onCheckedChange).toHaveBeenCalledWith(false);
    expect(lastFrameProps()).toMatchObject({
      checked: false,
      backgroundColor: '$surfaceCard',
    });
  });
});
