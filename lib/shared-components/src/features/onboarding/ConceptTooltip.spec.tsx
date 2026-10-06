/**
 * Ported from apps/web (LS-6887 selectable text, LS-6888 Escape, LS-6889
 * reposition).  Positioning/scroll/resize now come from the Tamagui Popover
 * (floating-ui autoUpdate), so only ConceptTooltip's own open/close logic is
 * asserted here.
 */
import React from 'react';
import { act, fireEvent, screen } from '@testing-library/react';

import { ConceptTooltip } from './ConceptTooltip';
import { render } from '../../test-utils';

// The real Tamagui Popover needs a full render environment unavailable under
// jsdom (see StaleScoringIndicator.spec.tsx); this double honours the
// controlled `open` state and exposes the content props.
jest.mock('../../components/Popover', () => ({
  Popover: ({
    trigger,
    open,
    children,
    contentProps,
  }: {
    trigger: React.ReactNode;
    open?: boolean;
    children?: React.ReactNode;
    contentProps?: {
      id?: string;
      userSelect?: string;
      onHoverIn?: () => void;
      onHoverOut?: () => void;
    };
  }) => (
    <>
      {trigger}
      {open ? (
        <div
          id={contentProps?.id}
          role="tooltip"
          data-user-select={contentProps?.userSelect}
          onMouseEnter={contentProps?.onHoverIn}
          onMouseLeave={contentProps?.onHoverOut}
        >
          {children}
        </div>
      ) : null}
    </>
  ),
}));

describe('ConceptTooltip', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    localStorage.clear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const renderTooltip = () =>
    render(<ConceptTooltip term="WAR" explanation="Wins above replacement" />);

  const getAnchor = () => screen.getByRole('button', { name: 'WAR' });

  it('is closed until the term is pressed', () => {
    renderTooltip();
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('opens on press and closes on a second press', () => {
    renderTooltip();
    fireEvent.click(getAnchor());
    expect(screen.getByRole('tooltip')).toBeTruthy();

    fireEvent.click(getAnchor());
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('renders the explanation content when open', () => {
    renderTooltip();
    fireEvent.click(getAnchor());
    expect(screen.getByText('Wins above replacement')).toBeTruthy();
  });

  it('toggles with Enter and Space', () => {
    renderTooltip();
    fireEvent.keyDown(getAnchor(), { key: 'Enter' });
    expect(screen.getByRole('tooltip')).toBeTruthy();
    fireEvent.keyDown(getAnchor(), { key: ' ' });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('closes on Escape and keeps focus on the anchor (LS-6888)', () => {
    renderTooltip();
    const anchor = getAnchor();
    act(() => {
      anchor.focus();
    });
    expect(screen.getByRole('tooltip')).toBeTruthy();

    fireEvent.keyDown(anchor, { key: 'Escape' });

    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(document.activeElement).toBe(anchor);
  });

  it('renders the card with selectable text (LS-6887)', () => {
    renderTooltip();
    fireEvent.click(getAnchor());
    expect(screen.getByRole('tooltip').getAttribute('data-user-select')).toBe(
      'text',
    );
  });

  it('describes the anchor with the tooltip id', () => {
    renderTooltip();
    fireEvent.click(getAnchor());
    expect(getAnchor().getAttribute('aria-describedby')).toBe(
      screen.getByRole('tooltip').id,
    );
  });

  it('opens on focus and closes immediately on keyboard blur', () => {
    renderTooltip();
    const anchor = getAnchor();
    fireEvent.focus(anchor);
    expect(screen.getByRole('tooltip')).toBeTruthy();

    fireEvent.blur(anchor);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('stays open when a press follows hover/focus auto-open in the same gesture', () => {
    renderTooltip();
    fireEvent.focus(getAnchor());
    fireEvent.click(getAnchor());
    expect(screen.getByRole('tooltip')).toBeTruthy();

    act(() => {
      jest.advanceTimersByTime(1000);
    });
    fireEvent.click(getAnchor());
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('stays open when a focused anchor blurs because the pointer is on the card', () => {
    renderTooltip();
    const anchor = getAnchor();
    fireEvent.focus(anchor);
    fireEvent.mouseEnter(screen.getByRole('tooltip'));

    fireEvent.blur(anchor);

    expect(screen.getByRole('tooltip')).toBeTruthy();
  });

  it('hides after the pointer leaves the card', () => {
    renderTooltip();
    fireEvent.focus(getAnchor());
    const card = screen.getByRole('tooltip');
    fireEvent.mouseEnter(card);
    fireEvent.mouseLeave(card);
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  describe('seen-state persistence (LS-6886)', () => {
    it('opens on hover while the term has not been acknowledged', () => {
      renderTooltip();
      fireEvent.mouseEnter(getAnchor());
      expect(screen.getByRole('tooltip')).toBeTruthy();
    });

    it('"Got it" persists the per-term flag and closes the card', () => {
      renderTooltip();
      fireEvent.click(getAnchor());
      fireEvent.click(screen.getByRole('button', { name: 'Got it' }));

      expect(localStorage.getItem('ls_tooltip_seen_war')).toBe('1');
      expect(screen.queryByRole('tooltip')).toBeNull();
    });

    it('no longer opens on hover once acknowledged, across remounts', () => {
      const { unmount } = renderTooltip();
      fireEvent.click(getAnchor());
      fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
      unmount();

      renderTooltip();
      fireEvent.mouseEnter(getAnchor());
      expect(screen.queryByRole('tooltip')).toBeNull();
    });

    it('still opens on press when acknowledged, without the "Got it" control', () => {
      localStorage.setItem('ls_tooltip_seen_war', '1');
      renderTooltip();
      fireEvent.click(getAnchor());

      expect(screen.getByRole('tooltip')).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Got it' })).toBeNull();
    });

    it('acknowledges with the keyboard', () => {
      renderTooltip();
      fireEvent.click(getAnchor());
      fireEvent.keyDown(screen.getByRole('button', { name: 'Got it' }), {
        key: 'Enter',
      });
      expect(localStorage.getItem('ls_tooltip_seen_war')).toBe('1');
    });

    it('tracks each term independently', () => {
      localStorage.setItem('ls_tooltip_seen_war', '1');
      render(<ConceptTooltip term="OPS" explanation="On-base plus slugging" />);
      fireEvent.mouseEnter(screen.getByRole('button', { name: 'OPS' }));
      expect(screen.getByRole('tooltip')).toBeTruthy();
    });
  });
});
