/**
 * LS-6887: the tooltip card used to set `pointerEvents: 'none'`, so mouse users
 * could not select its text.  It is now interactive, and a short hide delay
 * bridges the gap between the anchor and the card so the pointer can reach it.
 */
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';

import { ConceptTooltip } from './ConceptTooltip';

jest.mock('../../context/ThemeContext', () => ({
  useThemeContext: () => ({ resolvedTheme: 'dark' }),
}));

jest.mock('@legacy-sports/shared-components/ui', () => {
  const ReactActual: typeof React = jest.requireActual('react');
  const passThrough =
    (tag: string) =>
    ({ children, ...props }: { children?: React.ReactNode }) =>
      ReactActual.createElement(tag, props, children);
  return {
    Paragraph: passThrough('p'),
    XStack: passThrough('div'),
    YStack: passThrough('div'),
  };
});

describe('ConceptTooltip', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const renderTooltip = () =>
    render(<ConceptTooltip term="WAR" explanation="Wins above replacement" />);

  const getAnchor = () => screen.getByRole('button', { name: 'WAR' });

  it('renders the tooltip card as interactive so its text can be selected', () => {
    renderTooltip();
    fireEvent.mouseEnter(getAnchor());

    const card = screen.getByRole('tooltip');
    expect(card.style.pointerEvents).toBe('auto');
  });

  it('keeps the tooltip open when the pointer moves from the anchor onto the card', () => {
    renderTooltip();
    const anchor = getAnchor();
    fireEvent.mouseEnter(anchor);
    const card = screen.getByRole('tooltip');

    fireEvent.mouseLeave(anchor);
    act(() => {
      jest.advanceTimersByTime(50);
    });
    fireEvent.mouseEnter(card);
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(screen.getByRole('tooltip')).toBeTruthy();
  });

  it('hides the tooltip after the pointer leaves the card', () => {
    renderTooltip();
    const anchor = getAnchor();
    fireEvent.mouseEnter(anchor);
    const card = screen.getByRole('tooltip');
    fireEvent.mouseLeave(anchor);
    fireEvent.mouseEnter(card);

    fireEvent.mouseLeave(card);
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('hides the tooltip after the pointer leaves the anchor without entering the card', () => {
    renderTooltip();
    const anchor = getAnchor();
    fireEvent.mouseEnter(anchor);

    fireEvent.mouseLeave(anchor);
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('stays open when a focused anchor blurs because the pointer pressed on the card', () => {
    renderTooltip();
    const anchor = getAnchor();
    fireEvent.focus(anchor);
    fireEvent.mouseEnter(screen.getByRole('tooltip'));

    fireEvent.blur(anchor);

    expect(screen.getByRole('tooltip')).toBeTruthy();
  });

  it('still hides immediately on keyboard blur', () => {
    renderTooltip();
    const anchor = getAnchor();
    fireEvent.focus(anchor);
    expect(screen.getByRole('tooltip')).toBeTruthy();

    fireEvent.blur(anchor);

    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});
