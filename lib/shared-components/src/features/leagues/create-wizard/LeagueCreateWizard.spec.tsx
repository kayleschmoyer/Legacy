import React from 'react';
import { fireEvent } from '@testing-library/react';
import {
  LeagueCreateWizard,
  type LeagueCreateWizardProps,
} from './LeagueCreateWizard';
import { render } from '../../../test-utils';

// The premium field components and the date picker are exercised by their own
// specs; stubbing them here keeps this spec about wizard behavior and avoids
// pulling native date-picker internals into jsdom.
jest.mock('../premium/EraFilterGrid', () => ({
  EraFilterGrid: () => null,
}));
jest.mock('../premium/CustomEraRange', () => ({
  CustomEraRange: () => null,
}));
jest.mock('../premium/WaiverFields', () => {
  const React_ = jest.requireActual<typeof import('react')>('react');
  return {
    WaiverSystemField: () =>
      React_.createElement('div', { 'data-testid': 'waiver-system-field' }),
    FaabBudgetField: () => null,
  };
});
jest.mock('../premium/SalaryCapField', () => {
  const React_ = jest.requireActual<typeof import('react')>('react');
  return {
    SalaryCapField: () =>
      React_.createElement('div', { 'data-testid': 'salary-cap-field' }),
  };
});
jest.mock('../premium/DraftSlotTradingField', () => {
  const React_ = jest.requireActual<typeof import('react')>('react');
  return {
    DraftSlotTradingField: () =>
      React_.createElement('div', { 'data-testid': 'draft-slot-trading' }),
  };
});
jest.mock('../../../components/DateTimePicker', () => ({
  DateTimePicker: () => null,
}));

function renderWizard(overrides: Partial<LeagueCreateWizardProps> = {}) {
  const props: LeagueCreateWizardProps = {
    sport: 'baseball',
    isPremium: false,
    premiumLoading: false,
    onSubmit: jest.fn(),
    onClose: jest.fn(),
    onUpgrade: jest.fn(),
    ...overrides,
  };
  return { props, ...render(<LeagueCreateWizard {...props} />) };
}

/** Advance past the given number of steps by pressing NEXT. */
function pressNext(getByTestId: (id: string) => HTMLElement, times = 1) {
  for (let i = 0; i < times; i += 1) {
    fireEvent.click(getByTestId('wizard-next'));
  }
}

const VALID_NAME = 'Diamond Dynasty';

describe('LeagueCreateWizard — chrome', () => {
  it('renders all five steps, the header, and the step-1 CANCEL action', () => {
    const { getByTestId, getByText } = renderWizard();

    expect(getByTestId('wizard-header')).toBeTruthy();
    expect(getByTestId('wizard-progress-strip')).toBeTruthy();
    for (const id of ['basics', 'roster', 'draft', 'rules', 'review']) {
      expect(getByTestId(`wizard-step-tab-${id}`)).toBeTruthy();
    }
    expect(getByText('CANCEL')).toBeTruthy();
    expect(getByText('NEXT — ROSTER')).toBeTruthy();
  });

  it('reflects baseball in the header chip', () => {
    expect(renderWizard().getByTestId('wizard-sport-chip').textContent).toBe(
      'BASEBALL',
    );
  });

  it('reflects football in the header chip', () => {
    expect(
      renderWizard({ sport: 'football' }).getByTestId('wizard-sport-chip')
        .textContent,
    ).toBe('FOOTBALL');
  });

  it('shows BACK from step 2 onward', () => {
    const { getByTestId, getByText } = renderWizard({
      initialLeagueName: VALID_NAME,
    });
    pressNext(getByTestId);
    expect(getByText('BACK')).toBeTruthy();
    expect(getByText('NEXT — DRAFT')).toBeTruthy();
  });

  it('marks completed steps with a check and leaves unvisited steps inert', () => {
    const { getByTestId, queryByTestId } = renderWizard({
      initialLeagueName: VALID_NAME,
    });

    expect(queryByTestId('wizard-step-check-basics')).toBeNull();
    pressNext(getByTestId);
    expect(getByTestId('wizard-step-check-basics')).toBeTruthy();

    // A step the user has not reached does not navigate.
    fireEvent.click(getByTestId('wizard-step-tab-review'));
    expect(getByTestId('wizard-step-tab-roster')).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('jumps back to a completed step from the progress strip', () => {
    const { getByTestId, getByText } = renderWizard({
      initialLeagueName: VALID_NAME,
    });
    pressNext(getByTestId);
    fireEvent.click(getByTestId('wizard-step-tab-basics'));
    expect(getByText('NEXT — ROSTER')).toBeTruthy();
  });
});

describe('LeagueCreateWizard — basics step', () => {
  it('disables NEXT until the league name is valid', () => {
    const { getByTestId } = renderWizard();
    const next = getByTestId('wizard-next');
    expect(next).toHaveAttribute('aria-disabled', 'true');

    fireEvent.change(getByTestId('league-name-input'), {
      target: { value: VALID_NAME },
    });
    expect(next).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('seeds the name from the prefill and counts characters', () => {
    const { getByText } = renderWizard({ initialLeagueName: VALID_NAME });
    expect(getByText(`${VALID_NAME.length}/50`)).toBeTruthy();
  });

  it('disables division counts that violate the team-parity rule', () => {
    const { getByTestId } = renderWizard({ initialLeagueName: VALID_NAME });

    // 12 teams (even) → only even division counts are selectable.
    expect(getByTestId('chip-numberOfDivisions-1')).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(getByTestId('chip-numberOfDivisions-3')).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    fireEvent.click(getByTestId('chip-numberOfDivisions-4'));
    expect(getByTestId('chip-numberOfDivisions-4')).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // A disabled chip stays inert — the selection does not move to it.
    fireEvent.click(getByTestId('chip-numberOfDivisions-3'));
    expect(getByTestId('chip-numberOfDivisions-4')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('exposes the public/private toggle', () => {
    const { getByTestId } = renderWizard({ initialLeagueName: VALID_NAME });
    const toggle = getByTestId('toggle-isPublic');
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'true');
  });
});

describe('LeagueCreateWizard — roster step (LS-6146)', () => {
  it('shows the roster-size chips for baseball', () => {
    const { getByTestId, getByText } = renderWizard({
      initialLeagueName: VALID_NAME,
    });
    pressNext(getByTestId);
    expect(getByTestId('field-maxRosterSize')).toBeTruthy();
    expect(getByText('25')).toBeTruthy();
  });

  it('shows a per-position stepper for football instead of a roster-size chip group', () => {
    const { getByTestId, queryByTestId } = renderWizard({
      sport: 'football',
      initialLeagueName: VALID_NAME,
    });
    pressNext(getByTestId);
    expect(queryByTestId('field-maxRosterSize')).toBeNull();
    expect(getByTestId('roster-positions-editor')).toBeTruthy();
    expect(getByTestId('roster-slot-WR')).toBeTruthy();
    expect(getByTestId('roster-positions-totals').textContent).toContain(
      'Total: 16',
    );
  });

  it('incrementing a slot raises the total the review step will submit', () => {
    const { getByTestId } = renderWizard({
      sport: 'football',
      initialLeagueName: VALID_NAME,
    });
    pressNext(getByTestId);
    fireEvent.click(getByTestId('roster-slot-WR-increment'));
    expect(getByTestId('roster-positions-totals').textContent).toContain(
      'Total: 17',
    );
  });

  it('does not decrement a slot below zero', () => {
    const { getByTestId } = renderWizard({
      sport: 'football',
      initialLeagueName: VALID_NAME,
    });
    pressNext(getByTestId);
    // DST defaults to 1 — one decrement reaches zero, the next is inert.
    const decrement = getByTestId('roster-slot-DST-decrement');
    fireEvent.click(decrement);
    expect(getByTestId('roster-positions-totals').textContent).toContain(
      'Total: 15',
    );
    fireEvent.click(decrement);
    expect(getByTestId('roster-positions-totals').textContent).toContain(
      'Total: 15',
    );
  });

  it('shows SFLEX/K-P as premium-gated and routes a free user to upgrade (LS-6151)', () => {
    const onUpgrade = jest.fn();
    const { getByTestId } = renderWizard({
      sport: 'football',
      initialLeagueName: VALID_NAME,
      onUpgrade,
    });
    pressNext(getByTestId);
    expect(getByTestId('roster-premium-slot-SFLEX')).toBeTruthy();
    expect(getByTestId('roster-premium-slot-KP')).toBeTruthy();

    fireEvent.click(getByTestId('roster-premium-slot-SFLEX-increment'));
    expect(onUpgrade).toHaveBeenCalledWith('Custom Roster Positions');
  });

  it('lets a premium user add an SFLEX slot', () => {
    const { getByTestId } = renderWizard({
      sport: 'football',
      initialLeagueName: VALID_NAME,
      isPremium: true,
    });
    pressNext(getByTestId);
    fireEvent.click(getByTestId('roster-premium-slot-SFLEX-increment'));
    expect(getByTestId('roster-positions-totals').textContent).toContain(
      'Total: 17',
    );
  });
});

describe('LeagueCreateWizard — draft step', () => {
  function goToDraft(overrides: Partial<LeagueCreateWizardProps> = {}) {
    const utils = renderWizard({ initialLeagueName: VALID_NAME, ...overrides });
    pressNext(utils.getByTestId, 2);
    return utils;
  }

  it('forces Random selection and disables the group for an automated draft', () => {
    const { getByTestId } = goToDraft();
    fireEvent.click(getByTestId('chip-draftMode-automated'));
    expect(getByTestId('chip-selectionMethod-random')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(getByTestId('chip-selectionMethod-standard')).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('opens the auction sub-card, dims draft order, and hides slot trading', () => {
    const { getByTestId, getByText, queryByTestId } = goToDraft({
      isPremium: true,
    });
    expect(queryByTestId('auction-settings')).toBeNull();
    expect(getByTestId('draft-slot-trading')).toBeTruthy();

    fireEvent.click(getByTestId('chip-selectionMethod-auction'));

    expect(getByTestId('auction-settings')).toBeTruthy();
    expect(getByText('Not used in auction')).toBeTruthy();
    expect(getByTestId('chip-draftOrder-snake')).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(queryByTestId('draft-slot-trading')).toBeNull();
  });

  it('blocks NEXT with an inline error when the minimum bid exceeds the budget', () => {
    const { getByTestId, getByText, queryByTestId } = goToDraft({
      isPremium: true,
    });
    fireEvent.click(getByTestId('chip-selectionMethod-auction'));
    fireEvent.change(getByTestId('auction-min-bid-input'), {
      target: { value: '500' },
    });
    fireEvent.click(getByTestId('wizard-next'));

    expect(getByTestId('field-auctionMinBid-error')).toBeTruthy();
    expect(
      getByText('Minimum bid cannot exceed the auction budget.'),
    ).toBeTruthy();
    // Still on the draft step — the inline error blocked the advance.
    expect(queryByTestId('field-auctionBudget')).toBeTruthy();
  });

  // LS-6125: auction draft implicitly requires a budget, the same premium
  // gate as salary-cap leagues — a free user must not be able to select it.
  it('routes a free user to upgrade instead of selecting auction draft', () => {
    const onUpgrade = jest.fn();
    const { getByTestId, queryByTestId } = goToDraft({ onUpgrade });

    fireEvent.click(getByTestId('chip-selectionMethod-auction'));

    expect(onUpgrade).toHaveBeenCalledWith('Auction Draft');
    expect(getByTestId('chip-selectionMethod-standard')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(queryByTestId('auction-settings')).toBeNull();
  });
});

describe('LeagueCreateWizard — rules step', () => {
  it('holds a skeleton instead of the locked state while entitlements load (LS-8380)', () => {
    const { getByTestId } = renderWizard({
      initialLeagueName: VALID_NAME,
      premiumLoading: true,
    });
    pressNext(getByTestId, 3);
    expect(getByTestId('premium-settings-loading')).toBeTruthy();
  });

  it('routes a free user to upgrade instead of enabling HOF-only', () => {
    const onUpgrade = jest.fn();
    const { getByTestId } = renderWizard({
      initialLeagueName: VALID_NAME,
      onUpgrade,
    });
    pressNext(getByTestId, 3);
    fireEvent.click(getByTestId('toggle-baseballHofOnly'));
    expect(onUpgrade).toHaveBeenCalledWith('Hall of Fame Only');
    expect(getByTestId('toggle-baseballHofOnly')).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('shows football-specific scoring and defensive format chips first', () => {
    const { getByTestId } = renderWizard({
      sport: 'football',
      initialLeagueName: VALID_NAME,
    });
    pressNext(getByTestId, 3);
    expect(getByTestId('chip-scoringFormat-ppr')).toBeTruthy();
    expect(getByTestId('chip-defensiveFormat-dst')).toBeTruthy();
  });

  it('also exposes the premium era/HOF/waiver/salary-cap fields for football (LS-6138)', () => {
    const { getByTestId, queryByTestId } = renderWizard({
      sport: 'football',
      initialLeagueName: VALID_NAME,
    });
    pressNext(getByTestId, 3);
    expect(queryByTestId('field-eraFilter')).toBeTruthy();
    expect(queryByTestId('toggle-baseballHofOnly')).toBeTruthy();
    expect(queryByTestId('waiver-system-field')).toBeTruthy();
    expect(queryByTestId('salary-cap-field')).toBeTruthy();
  });

  it('switching to IDP resets the roster step to the IDP slot set (LS-6146)', () => {
    const { getByTestId, queryByTestId } = renderWizard({
      sport: 'football',
      initialLeagueName: VALID_NAME,
    });
    pressNext(getByTestId, 3);
    fireEvent.click(getByTestId('chip-defensiveFormat-idp'));
    fireEvent.click(getByTestId('wizard-step-tab-roster'));
    expect(getByTestId('roster-slot-DL')).toBeTruthy();
    expect(queryByTestId('roster-slot-DST')).toBeNull();
    // The fictional DP (IDP Flex) slot is never offered (LS-8996).
    expect(queryByTestId('roster-slot-DP')).toBeNull();
  });
});

describe('LeagueCreateWizard — review step', () => {
  function goToReview(overrides: Partial<LeagueCreateWizardProps> = {}) {
    const utils = renderWizard({ initialLeagueName: VALID_NAME, ...overrides });
    pressNext(utils.getByTestId, 4);
    return utils;
  }

  it('summarizes all four groups behind the league-name headline', () => {
    const { getByTestId } = goToReview();
    expect(getByTestId('review-league-name').textContent).toBe(VALID_NAME);
    for (const id of ['basics', 'roster', 'draft', 'rules']) {
      expect(getByTestId(`summary-${id}`)).toBeTruthy();
    }
    expect(getByTestId('wizard-submit')).toBeTruthy();
  });

  it('jumps to the owning step from a summary Edit link', () => {
    const { getByTestId, getByText } = goToReview();
    fireEvent.click(getByTestId('summary-roster-edit'));
    expect(getByText('NEXT — DRAFT')).toBeTruthy();
  });

  it('submits the assembled form and reports in-flight state', () => {
    const onSubmit = jest.fn();
    const { getByTestId } = goToReview({ onSubmit });
    fireEvent.click(getByTestId('wizard-submit'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        leagueName: VALID_NAME,
        numberOfTeams: 12,
        numberOfDivisions: 2,
        isPublic: false,
        schedulingStrategy: 'divisional',
      }),
    );
  });

  it('disables the CTA and swaps its label while the mutation is in flight', () => {
    // `submitting` also freezes NEXT, so reach the review step first and then
    // flip the flag — the same order the real screen sees it in.
    const { getByTestId, getByText, props, rerender } = goToReview();
    rerender(<LeagueCreateWizard {...props} submitting />);
    expect(getByText('Creating…')).toBeTruthy();
    expect(getByTestId('wizard-submit')).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('surfaces a mutation failure inline', () => {
    const { getByText } = goToReview({ submitError: 'League name is taken' });
    expect(getByText('League name is taken')).toBeTruthy();
  });
});

describe('LeagueCreateWizard — Fast Lane (LS-9179)', () => {
  it('toggles on the Basics step and reports the change via onFastLaneToggle', () => {
    const onFastLaneToggle = jest.fn();
    const { getByTestId } = renderWizard({
      initialLeagueName: VALID_NAME,
      onFastLaneToggle,
    });
    const toggle = getByTestId('toggle-fastLane');
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(onFastLaneToggle).toHaveBeenCalledWith(true);
  });

  it('jumps NEXT straight from Basics to Review, skipping Roster/Draft/Rules', () => {
    const { getByTestId, getByText } = renderWizard({
      initialLeagueName: VALID_NAME,
    });
    fireEvent.click(getByTestId('toggle-fastLane'));
    expect(getByText('NEXT — REVIEW')).toBeTruthy();
    fireEvent.click(getByTestId('wizard-next'));
    expect(getByTestId('wizard-submit')).toBeTruthy();
    expect(getByTestId('review-league-name').textContent).toBe(VALID_NAME);
  });

  it('leaves the skipped steps tappable from the progress strip after the jump', () => {
    const { getByTestId, getByText } = renderWizard({
      initialLeagueName: VALID_NAME,
    });
    fireEvent.click(getByTestId('toggle-fastLane'));
    fireEvent.click(getByTestId('wizard-next'));
    fireEvent.click(getByTestId('wizard-step-tab-basics'));
    expect(getByText('NEXT — REVIEW')).toBeTruthy();
  });

  it('submits sport defaults for the skipped steps', () => {
    const onSubmit = jest.fn();
    const { getByTestId } = renderWizard({
      initialLeagueName: VALID_NAME,
      onSubmit,
    });
    fireEvent.click(getByTestId('toggle-fastLane'));
    fireEvent.click(getByTestId('wizard-next'));
    fireEvent.click(getByTestId('wizard-submit'));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ leagueName: VALID_NAME, numberOfTeams: 12 }),
    );
  });
});

describe('LeagueCreateWizard — state and close', () => {
  it('preserves edits across forward and back navigation', () => {
    const { getByTestId } = renderWizard({ initialLeagueName: VALID_NAME });
    fireEvent.click(getByTestId('chip-numberOfTeams-8'));
    pressNext(getByTestId, 2);
    fireEvent.click(getByTestId('wizard-back'));
    fireEvent.click(getByTestId('wizard-back'));
    expect(getByTestId('chip-numberOfTeams-8')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('reports whether the form is dirty when closing', () => {
    const onClose = jest.fn();
    const { getByTestId } = renderWizard({
      initialLeagueName: VALID_NAME,
      onClose,
    });

    fireEvent.click(getByTestId('wizard-close'));
    expect(onClose).toHaveBeenLastCalledWith(false);

    fireEvent.click(getByTestId('chip-numberOfTeams-8'));
    fireEvent.click(getByTestId('wizard-close'));
    expect(onClose).toHaveBeenLastCalledWith(true);
  });

  it('treats CANCEL on step 1 as a close', () => {
    const onClose = jest.fn();
    const { getByTestId } = renderWizard({ onClose });
    fireEvent.click(getByTestId('wizard-back'));
    expect(onClose).toHaveBeenCalledWith(false);
  });
});

// LS-6133 — a user at the free-tier league cap must see this immediately on
// mount and be blocked from proceeding, rather than only failing on submit
// after filling out the whole form.
describe('LeagueCreateWizard — league limit', () => {
  it('shows no banner and does not block NEXT when under the cap', () => {
    const { getByTestId, queryByTestId } = renderWizard({
      initialLeagueName: VALID_NAME,
    });
    expect(queryByTestId('wizard-league-limit-banner')).toBeNull();
    expect(getByTestId('wizard-next')).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('shows the banner and disables NEXT immediately at the cap, even with a valid name', () => {
    const { getByTestId, getByText } = renderWizard({
      initialLeagueName: VALID_NAME,
      atLeagueLimit: true,
    });
    expect(getByTestId('wizard-league-limit-banner')).toBeTruthy();
    expect(getByText(/Free accounts can be in up to 3 leagues/)).toBeTruthy();
    expect(getByTestId('wizard-next')).toHaveAttribute('aria-disabled', 'true');
  });

  it('routes the banner Upgrade action through onUpgrade', () => {
    const onUpgrade = jest.fn();
    const { getByTestId } = renderWizard({ atLeagueLimit: true, onUpgrade });
    fireEvent.click(getByTestId('wizard-league-limit-upgrade'));
    expect(onUpgrade).toHaveBeenCalledWith('Unlimited League Creation');
  });

  it('disables CREATE LEAGUE on the review step and blocks submit if the user hits the cap after reaching review', () => {
    // Reach review before the limit applies (mirrors a league being created
    // by another tab/device mid-wizard), then flip atLeagueLimit like
    // `submitting` is flipped above — same order the real screen sees it in.
    const onSubmit = jest.fn();
    const props: LeagueCreateWizardProps = {
      sport: 'baseball',
      isPremium: false,
      premiumLoading: false,
      initialLeagueName: VALID_NAME,
      onSubmit,
      onClose: jest.fn(),
      onUpgrade: jest.fn(),
    };
    const { getByTestId, rerender } = render(<LeagueCreateWizard {...props} />);
    pressNext(getByTestId, 4);
    rerender(<LeagueCreateWizard {...props} atLeagueLimit />);

    expect(getByTestId('wizard-submit')).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    fireEvent.click(getByTestId('wizard-submit'));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
