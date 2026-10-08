import React from 'react';
import { ConsentPreferencesDialog } from './ConsentPreferencesDialog';
import { fireEvent, render, screen } from '../../test-utils';

jest.mock('tamagui', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const passThrough =
    (tag: string) =>
    ({ children, id }: { children?: React.ReactNode; id?: string }) =>
      React.createElement(tag, { id }, children);
  const Switch = ({
    checked,
    onCheckedChange,
  }: {
    checked: boolean;
    onCheckedChange: (v: boolean) => void;
  }) =>
    React.createElement(
      'button',
      {
        role: 'switch',
        'aria-checked': checked,
        onClick: () => onCheckedChange(!checked),
      },
      'analytics switch',
    );
  Switch.Thumb = () => null;
  return {
    YStack: passThrough('div'),
    XStack: passThrough('div'),
    Text: passThrough('span'),
    Switch,
  };
});

jest.mock('../../Button', () => ({
  Button: ({
    children,
    onPress,
    'aria-expanded': ariaExpanded,
  }: {
    children?: React.ReactNode;
    onPress?: () => void;
    'aria-expanded'?: boolean;
  }) => (
    <button onClick={onPress} aria-expanded={ariaExpanded}>
      {children}
    </button>
  ),
}));

jest.mock('../../components/Dialog', () => ({
  Dialog: ({
    open,
    title,
    children,
    confirmLabel,
    cancelLabel,
    onConfirm,
    onCancel,
    onOpenChange,
  }: {
    open: boolean;
    title: string;
    children: React.ReactNode;
    confirmLabel: string;
    cancelLabel: string;
    onConfirm: () => void;
    onCancel: () => void;
    onOpenChange: (open: boolean) => void;
  }) =>
    open ? (
      <div role="dialog" aria-label={title}>
        {children}
        <button onClick={onCancel}>{cancelLabel}</button>
        <button onClick={onConfirm}>{confirmLabel}</button>
        <button onClick={() => onOpenChange(false)}>Close</button>
      </div>
    ) : null,
}));

function renderDialog(analyticsEnabled: boolean) {
  const handlers = {
    onSave: jest.fn(),
    onRejectAll: jest.fn(),
    onClose: jest.fn(),
  };
  render(
    <ConsentPreferencesDialog
      open
      analyticsEnabled={analyticsEnabled}
      {...handlers}
    />,
  );
  return handlers;
}

describe('ConsentPreferencesDialog (LS-10764)', () => {
  it('pre-fills the analytics switch from the current choice', () => {
    renderDialog(true);
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe(
      'true',
    );
  });

  it('saves the toggled switch state', () => {
    const { onSave } = renderDialog(false);
    fireEvent.click(screen.getByRole('switch'));
    fireEvent.click(screen.getByText('Save choices'));
    expect(onSave).toHaveBeenCalledWith(true);
  });

  it('allows saving with nothing changed', () => {
    const { onSave } = renderDialog(false);
    fireEvent.click(screen.getByText('Save choices'));
    expect(onSave).toHaveBeenCalledWith(false);
  });

  it('Reject all and Close call their own handlers', () => {
    const { onRejectAll, onClose, onSave } = renderDialog(true);
    fireEvent.click(screen.getByText('Reject all'));
    fireEvent.click(screen.getByText('Close'));
    expect(onRejectAll).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('shows strictly necessary as always on, with no switch', () => {
    renderDialog(false);
    expect(screen.getByText('Always on')).toBeTruthy();
    expect(screen.getAllByRole('switch')).toHaveLength(1);
  });

  it('expands the "What\'s collected" details on demand', () => {
    renderDialog(false);
    expect(screen.queryByText(/Deleted automatically/)).toBeNull();
    fireEvent.click(screen.getByText("What's collected"));
    expect(screen.getByText(/Deleted automatically/)).toBeTruthy();
  });
});
