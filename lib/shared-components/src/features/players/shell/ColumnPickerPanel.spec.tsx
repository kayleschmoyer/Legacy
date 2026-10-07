/**
 * ColumnPickerPanel.spec.tsx — keyboard + checked-state semantics for the
 * per-column show/hide checkboxes (LS-10734).
 */
import React from 'react';
import { ColumnPickerPanel } from './ColumnPickerPanel';
import { fireEvent, render, screen } from '../../../test-utils';

// The shared jest-setup mock renders Pressable as a bare <button> and strips
// role/testID, which hides exactly the react-native-web behavior this bug is
// about (aria-checked mapping, Enter/Space activation). Use the real RNW.
jest.mock('react-native', () =>
  // RNW has no type declarations; it implements react-native's module shape.
  jest.requireActual<typeof import('react-native')>('react-native-web'),
);

const COLUMNS = [
  { key: 'g', label: 'G' },
  { key: 'hr', label: 'HR' },
];

const makeProps = () => ({
  columns: COLUMNS,
  visibleKeys: new Set(['hr']),
  customized: false,
  onToggle: jest.fn(),
  onReset: jest.fn(),
});

describe('ColumnPickerPanel', () => {
  test('each option exposes aria-checked matching its visible state', () => {
    render(<ColumnPickerPanel {...makeProps()} />);

    const g = screen.getByTestId('column-toggle-g');
    const hr = screen.getByTestId('column-toggle-hr');
    expect(g).toHaveAttribute('role', 'checkbox');
    expect(g).toHaveAttribute('aria-checked', 'false');
    expect(hr).toHaveAttribute('aria-checked', 'true');
  });

  test('Space toggles the focused option and suppresses page scroll', () => {
    const props = makeProps();
    render(<ColumnPickerPanel {...props} />);

    const g = screen.getByTestId('column-toggle-g');
    const notPrevented = fireEvent.keyDown(g, { key: ' ' });

    expect(props.onToggle).toHaveBeenCalledTimes(1);
    expect(props.onToggle).toHaveBeenCalledWith('g');
    expect(notPrevented).toBe(false);
  });

  test('a held Space (auto-repeat) does not re-toggle', () => {
    const props = makeProps();
    render(<ColumnPickerPanel {...props} />);

    fireEvent.keyDown(screen.getByTestId('column-toggle-g'), {
      key: ' ',
      repeat: true,
    });

    expect(props.onToggle).not.toHaveBeenCalled();
  });

  test('Enter toggles the focused option exactly once', () => {
    const props = makeProps();
    render(<ColumnPickerPanel {...props} />);

    const g = screen.getByTestId('column-toggle-g');
    fireEvent.keyDown(g, { key: 'Enter' });
    fireEvent.keyUp(g, { key: 'Enter' });

    expect(props.onToggle).toHaveBeenCalledTimes(1);
    expect(props.onToggle).toHaveBeenCalledWith('g');
  });

  test('other keys do not toggle', () => {
    const props = makeProps();
    render(<ColumnPickerPanel {...props} />);

    fireEvent.keyDown(screen.getByTestId('column-toggle-g'), { key: 'a' });

    expect(props.onToggle).not.toHaveBeenCalled();
  });
});
