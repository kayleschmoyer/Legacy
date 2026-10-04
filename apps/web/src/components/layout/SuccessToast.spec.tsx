import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { showToast, SuccessToast } from './SuccessToast';

jest.mock('../../context/ThemeContext', () => ({
  useThemeContext: () => ({ resolvedTheme: 'light' }),
}));

describe('SuccessToast', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('renders nothing until showToast is called', () => {
    render(<SuccessToast />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('shows the message from showToast and auto-dismisses', () => {
    render(<SuccessToast />);
    act(() => showToast('Avatar updated'));
    expect(screen.getByRole('status').textContent).toBe('Avatar updated');
    act(() => {
      jest.advanceTimersByTime(4000);
    });
    expect(screen.queryByRole('status')).toBeNull();
  });
});
