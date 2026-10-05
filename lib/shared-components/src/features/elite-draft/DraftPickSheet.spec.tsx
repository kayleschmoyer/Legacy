import React from 'react';
import {
  clampSheetHeightPercent,
  DraftPickCta,
  draftPickCtaLabel,
  DraftPickSheet,
  PICK_SHEET_HEIGHT_PERCENT,
} from './DraftPickSheet';
import { fireEvent, render, screen } from '../../test-utils';

// The web jest setup mocks Tamagui's `Sheet` as plain passthrough divs that
// always render their children and drop `onPress`, so this spec covers what the
// host itself owns — CTA copy, the close control, the bounded snap point, and
// that the body is whatever the caller passes. Open/close animation and the
// scrim's own dismissal are Tamagui behavior, exercised against the real
// component by apps/web-e2e/src/tests/compact-draft-board.spec.ts.

const CTA_BASE = {
  canDraft: true,
  untimed: false,
  draftPaused: false,
  timeRemaining: 47,
  pickTimeLimitSeconds: 90,
};

describe('draftPickCtaLabel', () => {
  it('counts down the pick clock while the viewer is on it', () => {
    expect(draftPickCtaLabel(CTA_BASE)).toBe('Pick a player · 0:47 left');
  });

  it('formats slow-mode clocks with an hours group', () => {
    expect(
      draftPickCtaLabel({
        ...CTA_BASE,
        timeRemaining: 3725,
        pickTimeLimitSeconds: 7200,
      }),
    ).toBe('Pick a player · 1:02:05 left');
  });

  it('drops the countdown for untimed and paused drafts', () => {
    expect(draftPickCtaLabel({ ...CTA_BASE, untimed: true })).toBe(
      'Pick a player',
    );
    expect(draftPickCtaLabel({ ...CTA_BASE, draftPaused: true })).toBe(
      'Pick a player',
    );
  });

  it('never shows a negative clock', () => {
    expect(draftPickCtaLabel({ ...CTA_BASE, timeRemaining: -3 })).toBe(
      'Pick a player · 0:00 left',
    );
  });

  it('reads as browsing, not picking, when the viewer cannot draft', () => {
    expect(draftPickCtaLabel({ ...CTA_BASE, canDraft: false })).toBe(
      'Browse players',
    );
  });
});

describe('DraftPickCta', () => {
  it('raises the sheet on press', () => {
    const onPress = jest.fn();
    render(<DraftPickCta {...CTA_BASE} onPress={onPress} />);

    fireEvent.click(screen.getByTestId('draft-pick-cta'));

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Pick a player · 0:47 left')).toBeTruthy();
  });

  it('still opens the sheet off the clock, so players can be queued', () => {
    const onPress = jest.fn();
    render(<DraftPickCta {...CTA_BASE} canDraft={false} onPress={onPress} />);

    fireEvent.click(screen.getByText('Browse players'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('DraftPickSheet', () => {
  it('snaps to a bounded share of the viewport rather than sizing to its content', () => {
    // The LS-8501 / LS-9900 failure mode is a floating layer that grows with
    // its content until its bottom controls leave the viewport.
    expect(PICK_SHEET_HEIGHT_PERCENT).toBeGreaterThan(0);
    expect(PICK_SHEET_HEIGHT_PERCENT).toBeLessThan(100);
  });

  it('hosts the caller-supplied browser under the sheet header', () => {
    render(
      <DraftPickSheet
        open
        onOpenChange={jest.fn()}
        subtitle="Pick #42 · Round 4"
      >
        <div data-testid="hosted-browser" />
      </DraftPickSheet>,
    );

    expect(screen.getByText('Available players')).toBeTruthy();
    expect(screen.getByTestId('draft-pick-sheet-subtitle').textContent).toBe(
      'Pick #42 · Round 4',
    );
    expect(screen.getByTestId('hosted-browser')).toBeTruthy();
  });

  it('omits the subtitle line when none is given', () => {
    render(
      <DraftPickSheet open onOpenChange={jest.fn()}>
        <div />
      </DraftPickSheet>,
    );

    expect(screen.queryByTestId('draft-pick-sheet-subtitle')).toBeNull();
  });

  it('dismisses from the close control', () => {
    const onOpenChange = jest.fn();
    render(
      <DraftPickSheet open onOpenChange={onOpenChange}>
        <div />
      </DraftPickSheet>,
    );

    fireEvent.click(screen.getByTestId('draft-pick-sheet-close'));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('dismisses from the keyboard on the close control', () => {
    const onOpenChange = jest.fn();
    render(
      <DraftPickSheet open onOpenChange={onOpenChange}>
        <div />
      </DraftPickSheet>,
    );

    fireEvent.keyDown(screen.getByTestId('draft-pick-sheet-close'), {
      key: 'Enter',
    });

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe('clampSheetHeightPercent (LS-10593)', () => {
  it('keeps the sheet top below the status bar on short windows', () => {
    // 600px window, 40px status bar: the top edge must stay at >= 48px.
    expect(clampSheetHeightPercent(95, 600, 40)).toBe(92);
    // Split-screen / landscape sliver: 200px window, 32px status bar.
    expect(clampSheetHeightPercent(PICK_SHEET_HEIGHT_PERCENT, 200, 32)).toBe(
      80,
    );
  });

  it('leaves the design height alone when there is room or no inset', () => {
    expect(clampSheetHeightPercent(74, 800, 24)).toBe(74);
    expect(clampSheetHeightPercent(84, 800, 0)).toBe(84);
  });
});
