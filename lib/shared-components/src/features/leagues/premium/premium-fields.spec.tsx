import React from 'react';
import { EraFilterGrid } from './EraFilterGrid';
import { FaabBudgetField, WaiverSystemField } from './WaiverFields';
import { SalaryCapField } from './SalaryCapField';
import { DraftSlotTradingField } from './DraftSlotTradingField';
import { RosterContinuityField } from './RosterContinuityField';
import { CustomEraRange } from './CustomEraRange';
import { FREE_ERA_IDS_BY_SPORT } from './constants';
import { fireEvent, render } from '../../../test-utils';

// Clicking a child Text node bubbles to the Tamagui pressable ancestor on web
// (the same pattern CreateLeagueModal.spec uses for its stepper).

describe('premium league-create fields (LS-5174)', () => {
  describe('EraFilterGrid', () => {
    const baseProps = {
      sport: 'baseball' as const,
      value: 'all',
      onChange: jest.fn(),
      onUpgrade: jest.fn(),
    };

    beforeEach(() => jest.clearAllMocks());

    it('renders every era option for the sport', () => {
      const { getByText } = render(
        <EraFilterGrid {...baseProps} isPremium={false} />,
      );
      expect(getByText('All Eras')).toBeTruthy();
      expect(getByText('Modern (2006+)')).toBeTruthy();
      expect(getByText('Dead Ball (pre-1920)')).toBeTruthy();
    });

    it('selects a free era without prompting upgrade', () => {
      const onChange = jest.fn();
      const onUpgrade = jest.fn();
      const { getByText } = render(
        <EraFilterGrid
          {...baseProps}
          onChange={onChange}
          onUpgrade={onUpgrade}
          isPremium={false}
        />,
      );
      fireEvent.click(getByText('Modern (2006+)'));
      expect(onChange).toHaveBeenCalledWith('modern');
      expect(onUpgrade).not.toHaveBeenCalled();
    });

    it('routes a locked premium era to onUpgrade for free users', () => {
      const onChange = jest.fn();
      const onUpgrade = jest.fn();
      const { getByText } = render(
        <EraFilterGrid
          {...baseProps}
          onChange={onChange}
          onUpgrade={onUpgrade}
          isPremium={false}
        />,
      );
      fireEvent.click(getByText('Dead Ball (pre-1920)'));
      expect(onUpgrade).toHaveBeenCalledTimes(1);
      expect(onChange).not.toHaveBeenCalled();
    });

    it('selects a premium era for premium users', () => {
      const onChange = jest.fn();
      const onUpgrade = jest.fn();
      const { getByText } = render(
        <EraFilterGrid
          {...baseProps}
          onChange={onChange}
          onUpgrade={onUpgrade}
          isPremium
        />,
      );
      fireEvent.click(getByText('Dead Ball (pre-1920)'));
      expect(onChange).toHaveBeenCalledWith('dead_ball');
      expect(onUpgrade).not.toHaveBeenCalled();
    });

    it('announces a locked era differently from an unlocked one (LS-6085)', () => {
      const { getByLabelText, queryByLabelText } = render(
        <EraFilterGrid {...baseProps} isPremium={false} />,
      );
      expect(
        getByLabelText('Dead Ball (pre-1920) — Locked, premium required'),
      ).toBeTruthy();
      expect(
        queryByLabelText('Dead Ball (pre-1920)', { exact: true }),
      ).toBeNull();
      expect(getByLabelText('Modern (2006+) — Free')).toBeTruthy();
    });

    it('labels every non-premium era as Free (LS-6141)', () => {
      const { getByLabelText } = render(
        <EraFilterGrid {...baseProps} isPremium={false} />,
      );
      expect(getByLabelText('All Eras — Free')).toBeTruthy();
      expect(getByLabelText('Modern (2006+) — Free')).toBeTruthy();
    });

    it('does not label a premium era as Free once unlocked for premium users (LS-6141)', () => {
      const { getByLabelText } = render(
        <EraFilterGrid {...baseProps} isPremium />,
      );
      expect(getByLabelText('Dead Ball (pre-1920)')).toBeTruthy();
    });

    it('does not mark a premium era as locked for premium users (LS-6085)', () => {
      const { getByLabelText, queryByLabelText } = render(
        <EraFilterGrid {...baseProps} isPremium />,
      );
      expect(
        queryByLabelText('Dead Ball (pre-1920) — Locked, premium required'),
      ).toBeNull();
      expect(getByLabelText('Dead Ball (pre-1920)')).toBeTruthy();
    });

    // testID does not reach the DOM as data-testid for a raw tamagui
    // YStack in this jsdom test setup (no tamagui compiler pass), so
    // these target the tile via its aria-label like the click tests
    // above target it via visible text.

    it('routes a locked premium era to onUpgrade on Enter keydown (LS-6084)', () => {
      const onChange = jest.fn();
      const onUpgrade = jest.fn();
      const { getByLabelText } = render(
        <EraFilterGrid
          {...baseProps}
          onChange={onChange}
          onUpgrade={onUpgrade}
          isPremium={false}
        />,
      );
      fireEvent.keyDown(
        getByLabelText('Dead Ball (pre-1920) — Locked, premium required'),
        { key: 'Enter' },
      );
      expect(onUpgrade).toHaveBeenCalledTimes(1);
      expect(onChange).not.toHaveBeenCalled();
    });

    it('selects a free era on Space keydown (LS-6084)', () => {
      const onChange = jest.fn();
      const onUpgrade = jest.fn();
      const { getByLabelText } = render(
        <EraFilterGrid
          {...baseProps}
          onChange={onChange}
          onUpgrade={onUpgrade}
          isPremium={false}
        />,
      );
      fireEvent.keyDown(getByLabelText('Modern (2006+) — Free'), { key: ' ' });
      expect(onChange).toHaveBeenCalledWith('modern');
      expect(onUpgrade).not.toHaveBeenCalled();
    });

    it('ignores unrelated keydowns (LS-6084)', () => {
      const onChange = jest.fn();
      const onUpgrade = jest.fn();
      const { getByLabelText } = render(
        <EraFilterGrid
          {...baseProps}
          onChange={onChange}
          onUpgrade={onUpgrade}
          isPremium={false}
        />,
      );
      fireEvent.keyDown(getByLabelText('Modern (2006+) — Free'), { key: 'a' });
      expect(onChange).not.toHaveBeenCalled();
      expect(onUpgrade).not.toHaveBeenCalled();
    });
  });

  describe('WaiverSystemField', () => {
    beforeEach(() => jest.clearAllMocks());

    it('routes FAAB selection to onUpgrade for free users', () => {
      const onChange = jest.fn();
      const onUpgrade = jest.fn();
      const { getByText } = render(
        <WaiverSystemField
          value="standard"
          onChange={onChange}
          isPremium={false}
          onUpgrade={onUpgrade}
        />,
      );
      fireEvent.click(getByText(/FAAB/));
      expect(onUpgrade).toHaveBeenCalledTimes(1);
      expect(onChange).not.toHaveBeenCalled();
    });

    it('selects FAAB for premium users', () => {
      const onChange = jest.fn();
      const onUpgrade = jest.fn();
      const { getByText } = render(
        <WaiverSystemField
          value="standard"
          onChange={onChange}
          isPremium
          onUpgrade={onUpgrade}
        />,
      );
      fireEvent.click(getByText(/FAAB/));
      expect(onChange).toHaveBeenCalledWith('faab');
      expect(onUpgrade).not.toHaveBeenCalled();
    });

    it('shows a proactive lock on the FAAB option for free users (LS-5173)', () => {
      // The mocked Lock icon renders with data-testid="Lock"; WaiverSystemField
      // renders exactly one lock — the gated FAAB option.
      const { getByTestId } = render(
        <WaiverSystemField
          value="standard"
          onChange={jest.fn()}
          isPremium={false}
          onUpgrade={jest.fn()}
        />,
      );
      expect(getByTestId('Lock')).toBeTruthy();
    });

    it('does not lock the FAAB option for premium users (LS-5173)', () => {
      const { queryByTestId } = render(
        <WaiverSystemField
          value="standard"
          onChange={jest.fn()}
          isPremium
          onUpgrade={jest.fn()}
        />,
      );
      expect(queryByTestId('Lock')).toBeNull();
    });

    // LS-6100 — a premium viewer toggling FAAB while entitlement is still
    // resolving must not have the upgrade modal fired at them.
    it('does not route a FAAB tap to onUpgrade while loading, even if isPremium is currently false', () => {
      const onChange = jest.fn();
      const onUpgrade = jest.fn();
      const { getByText } = render(
        <WaiverSystemField
          value="standard"
          onChange={onChange}
          isPremium={false}
          loading
          onUpgrade={onUpgrade}
        />,
      );
      fireEvent.click(getByText(/FAAB/));
      expect(onUpgrade).not.toHaveBeenCalled();
      expect(onChange).not.toHaveBeenCalled();
    });

    it('does not show the proactive lock on FAAB while loading (LS-6100)', () => {
      const { queryByTestId } = render(
        <WaiverSystemField
          value="standard"
          onChange={jest.fn()}
          isPremium={false}
          loading
          onUpgrade={jest.fn()}
        />,
      );
      expect(queryByTestId('Lock')).toBeNull();
    });
  });

  describe('SalaryCapField', () => {
    const baseProps = {
      enabled: false,
      onToggleEnabled: jest.fn(),
      onAmountChange: jest.fn(),
      onUpgrade: jest.fn(),
    };

    beforeEach(() => jest.clearAllMocks());

    it('disables the toggle for free users so no activation path reaches it (LS-6114)', () => {
      // PremiumGate only blocks pointer events on the wrapper; the toggle must
      // be hard-disabled too so keyboard/programmatic activation can't reach
      // it either.
      const onToggleEnabled = jest.fn();
      const onUpgrade = jest.fn();
      const { getByText } = render(
        <SalaryCapField
          {...baseProps}
          onToggleEnabled={onToggleEnabled}
          onUpgrade={onUpgrade}
          isPremium={false}
        />,
      );
      fireEvent.click(getByText('On'));
      expect(onToggleEnabled).not.toHaveBeenCalled();
      expect(onUpgrade).not.toHaveBeenCalled();
    });

    it('disables the cap amount input for free users (LS-6114)', () => {
      const { getByPlaceholderText } = render(
        <SalaryCapField {...baseProps} enabled isPremium={false} />,
      );
      expect(getByPlaceholderText('e.g. 50000000')).toBeDisabled();
    });

    it('enables the cap for premium users', () => {
      const onToggleEnabled = jest.fn();
      const { getByText } = render(
        <SalaryCapField
          {...baseProps}
          onToggleEnabled={onToggleEnabled}
          isPremium
        />,
      );
      fireEvent.click(getByText('On'));
      expect(onToggleEnabled).toHaveBeenCalledWith(true);
    });

    it('shows the cap amount input once enabled', () => {
      const { getByPlaceholderText } = render(
        <SalaryCapField {...baseProps} enabled isPremium />,
      );
      expect(getByPlaceholderText('e.g. 50000000')).toBeTruthy();
    });

    // LS-6119 — advanced fields (floor, luxury tax, min salary, escalation/decay)
    it('does not render advanced fields when their onChange handlers are omitted', () => {
      const { queryByPlaceholderText } = render(
        <SalaryCapField {...baseProps} enabled isPremium />,
      );
      expect(queryByPlaceholderText('e.g. 40000000')).toBeNull();
      expect(queryByPlaceholderText('e.g. 60000000')).toBeNull();
      expect(queryByPlaceholderText('e.g. 1')).toBeNull();
      expect(queryByPlaceholderText('e.g. 10')).toBeNull();
      expect(queryByPlaceholderText('e.g. 25')).toBeNull();
    });

    it('renders and wires up advanced fields when handlers are provided', () => {
      const onSalaryFloorChange = jest.fn();
      const onLuxuryTaxThresholdChange = jest.fn();
      const onMinSalaryChange = jest.fn();
      const onSalaryEscalationPctChange = jest.fn();
      const onSalaryDecayPctChange = jest.fn();
      const { getByPlaceholderText } = render(
        <SalaryCapField
          {...baseProps}
          enabled
          isPremium
          salaryFloor={40000000}
          onSalaryFloorChange={onSalaryFloorChange}
          luxuryTaxThreshold={60000000}
          onLuxuryTaxThresholdChange={onLuxuryTaxThresholdChange}
          minSalary={1}
          onMinSalaryChange={onMinSalaryChange}
          salaryEscalationPct={10}
          onSalaryEscalationPctChange={onSalaryEscalationPctChange}
          salaryDecayPct={25}
          onSalaryDecayPctChange={onSalaryDecayPctChange}
        />,
      );

      fireEvent.change(getByPlaceholderText('e.g. 40000000'), {
        target: { value: '45000000' },
      });
      expect(onSalaryFloorChange).toHaveBeenCalledWith(45000000);

      fireEvent.change(getByPlaceholderText('e.g. 60000000'), {
        target: { value: '65000000' },
      });
      expect(onLuxuryTaxThresholdChange).toHaveBeenCalledWith(65000000);

      fireEvent.change(getByPlaceholderText('e.g. 1'), {
        target: { value: '2' },
      });
      expect(onMinSalaryChange).toHaveBeenCalledWith(2);

      fireEvent.change(getByPlaceholderText('e.g. 10'), {
        target: { value: '15' },
      });
      expect(onSalaryEscalationPctChange).toHaveBeenCalledWith(15);

      fireEvent.change(getByPlaceholderText('e.g. 25'), {
        target: { value: '30' },
      });
      expect(onSalaryDecayPctChange).toHaveBeenCalledWith(30);
    });

    it('surfaces validation errors on advanced fields', () => {
      const { getByText } = render(
        <SalaryCapField
          {...baseProps}
          enabled
          isPremium
          onMinSalaryChange={jest.fn()}
          minSalaryError="Minimum salary must be at least 1."
        />,
      );
      expect(getByText('Minimum salary must be at least 1.')).toBeTruthy();
    });

    it('does not show a suggested-cap hint when roster size is unknown', () => {
      const { queryByText } = render(
        <SalaryCapField {...baseProps} enabled isPremium />,
      );
      expect(queryByText(/Suggested:/)).toBeNull();
    });

    it('shows a suggested-cap hint derived from roster size and team count (LS-6118)', () => {
      const { getByText } = render(
        <SalaryCapField
          {...baseProps}
          enabled
          isPremium
          numberOfTeams={12}
          maxRosterSize={25}
        />,
      );
      expect(
        getByText(
          'Suggested: $25,000,000 based on your 25-man roster (12 teams)',
        ),
      ).toBeTruthy();
    });

    it('recalculates the suggested-cap hint when roster size or team count changes (LS-6118)', () => {
      const { getByText, queryByText, rerender } = render(
        <SalaryCapField
          {...baseProps}
          enabled
          isPremium
          numberOfTeams={12}
          maxRosterSize={25}
        />,
      );
      expect(
        getByText(
          'Suggested: $25,000,000 based on your 25-man roster (12 teams)',
        ),
      ).toBeTruthy();

      rerender(
        <SalaryCapField
          {...baseProps}
          enabled
          isPremium
          numberOfTeams={10}
          maxRosterSize={30}
        />,
      );
      expect(
        queryByText(
          'Suggested: $25,000,000 based on your 25-man roster (12 teams)',
        ),
      ).toBeNull();
      expect(
        getByText(
          'Suggested: $30,000,000 based on your 30-man roster (10 teams)',
        ),
      ).toBeTruthy();
    });
  });

  describe('DraftSlotTradingField (LS-8675)', () => {
    const baseProps = {
      enabled: false,
      onToggleEnabled: jest.fn(),
      onUpgrade: jest.fn(),
    };

    beforeEach(() => jest.clearAllMocks());

    it('renders the toggle with its label and hint', () => {
      const { getByText } = render(
        <DraftSlotTradingField {...baseProps} isPremium />,
      );
      expect(getByText('Draft Slot Trading')).toBeTruthy();
      expect(
        getByText(
          'Let managers propose draft position swaps before the draft starts',
        ),
      ).toBeTruthy();
    });

    it('routes an enable tap to onUpgrade for free users (locked-tap pattern)', () => {
      const onToggleEnabled = jest.fn();
      const onUpgrade = jest.fn();
      const { getByText } = render(
        <DraftSlotTradingField
          {...baseProps}
          onToggleEnabled={onToggleEnabled}
          onUpgrade={onUpgrade}
          isPremium={false}
        />,
      );
      fireEvent.click(getByText('On'));
      expect(onUpgrade).toHaveBeenCalledTimes(1);
      expect(onToggleEnabled).not.toHaveBeenCalled();
    });

    it('shows a proactive lock for free users and hides it for premium users', () => {
      const { getByTestId, rerender, queryByTestId } = render(
        <DraftSlotTradingField {...baseProps} isPremium={false} />,
      );
      expect(getByTestId('Lock')).toBeTruthy();

      rerender(<DraftSlotTradingField {...baseProps} isPremium />);
      expect(queryByTestId('Lock')).toBeNull();
    });

    // LS-6100 — a premium viewer toggling while entitlement is still
    // resolving must not have the upgrade modal fired at them.
    it('does not route an enable tap to onUpgrade while loading, even if isPremium is currently false', () => {
      const onToggleEnabled = jest.fn();
      const onUpgrade = jest.fn();
      const { getByText } = render(
        <DraftSlotTradingField
          {...baseProps}
          onToggleEnabled={onToggleEnabled}
          onUpgrade={onUpgrade}
          isPremium={false}
          loading
        />,
      );
      fireEvent.click(getByText('On'));
      expect(onUpgrade).not.toHaveBeenCalled();
      expect(onToggleEnabled).not.toHaveBeenCalled();
    });

    it('does not show the proactive lock while loading (LS-6100)', () => {
      const { queryByTestId } = render(
        <DraftSlotTradingField {...baseProps} isPremium={false} loading />,
      );
      expect(queryByTestId('Lock')).toBeNull();
    });

    it('enables slot trading for premium users', () => {
      const onToggleEnabled = jest.fn();
      const { getByText } = render(
        <DraftSlotTradingField
          {...baseProps}
          onToggleEnabled={onToggleEnabled}
          isPremium
        />,
      );
      fireEvent.click(getByText('On'));
      expect(onToggleEnabled).toHaveBeenCalledWith(true);
    });

    it('disables slot trading for premium users', () => {
      const onToggleEnabled = jest.fn();
      const { getByText } = render(
        <DraftSlotTradingField
          {...baseProps}
          enabled
          onToggleEnabled={onToggleEnabled}
          isPremium
        />,
      );
      fireEvent.click(getByText('Off'));
      expect(onToggleEnabled).toHaveBeenCalledWith(false);
    });

    it('respects an explicit disabled prop even for premium users', () => {
      const onToggleEnabled = jest.fn();
      const { getByText } = render(
        <DraftSlotTradingField
          {...baseProps}
          onToggleEnabled={onToggleEnabled}
          isPremium
          disabled
        />,
      );
      fireEvent.click(getByText('On'));
      expect(onToggleEnabled).not.toHaveBeenCalled();
    });
  });

  describe('RosterContinuityField (LS-8672)', () => {
    const baseProps = {
      rosterContinuity: 'redraft' as const,
      onRosterContinuityChange: jest.fn(),
      selectionMethod: 'standard' as const,
      onKeeperCountChange: jest.fn(),
      onCostModelChange: jest.fn(),
      onMaxConsecutiveKeepsChange: jest.fn(),
      rookieExempt: false,
      onRookieExemptChange: jest.fn(),
      onUpgrade: jest.fn(),
    };

    beforeEach(() => jest.clearAllMocks());

    it('renders the Redraft/Keeper toggle', () => {
      const { getByText } = render(
        <RosterContinuityField {...baseProps} isPremium={false} />,
      );
      expect(getByText('Redraft')).toBeTruthy();
      expect(getByText('Keeper')).toBeTruthy();
    });

    it('does not render keeper sub-fields when rosterContinuity is redraft', () => {
      const { queryByPlaceholderText } = render(
        <RosterContinuityField {...baseProps} isPremium />,
      );
      expect(queryByPlaceholderText('e.g. 3')).toBeNull();
    });

    it('enables Keeper mode for premium users', () => {
      const onRosterContinuityChange = jest.fn();
      const { getByText } = render(
        <RosterContinuityField
          {...baseProps}
          onRosterContinuityChange={onRosterContinuityChange}
          isPremium
        />,
      );
      fireEvent.click(getByText('Keeper'));
      expect(onRosterContinuityChange).toHaveBeenCalledWith('keeper');
    });

    it('shows keeper sub-fields once rosterContinuity is keeper', () => {
      const { getByPlaceholderText } = render(
        <RosterContinuityField
          {...baseProps}
          rosterContinuity="keeper"
          isPremium
        />,
      );
      expect(getByPlaceholderText('e.g. 3')).toBeTruthy();
      expect(getByPlaceholderText('Unlimited')).toBeTruthy();
    });

    // LS-6114-style hard disable: PremiumGate only blocks pointer events on
    // the wrapper, so the toggle itself must also be disabled for free users
    // — mirrors SalaryCapField's precedent (the same PillToggle + onUpgrade
    // wiring); no activation path (click, keyboard, programmatic) can flip
    // the toggle or invoke onUpgrade once it's hard-disabled.
    it('disables the toggle for free users so no activation path reaches it', () => {
      const onRosterContinuityChange = jest.fn();
      const onUpgrade = jest.fn();
      const { getByText } = render(
        <RosterContinuityField
          {...baseProps}
          onRosterContinuityChange={onRosterContinuityChange}
          onUpgrade={onUpgrade}
          isPremium={false}
        />,
      );
      fireEvent.click(getByText('Keeper'));
      expect(onRosterContinuityChange).not.toHaveBeenCalled();
      expect(onUpgrade).not.toHaveBeenCalled();
    });

    it('does not let a premium user enable Keeper mode when selectionMethod is random', () => {
      const onRosterContinuityChange = jest.fn();
      const { getByText } = render(
        <RosterContinuityField
          {...baseProps}
          onRosterContinuityChange={onRosterContinuityChange}
          selectionMethod="random"
          isPremium
        />,
      );
      fireEvent.click(getByText('Keeper'));
      expect(onRosterContinuityChange).not.toHaveBeenCalled();
    });

    it('hides keeper sub-fields when a stale keeper league is stranded on selectionMethod random', () => {
      const { queryByPlaceholderText } = render(
        <RosterContinuityField
          {...baseProps}
          rosterContinuity="keeper"
          selectionMethod="random"
          isPremium
        />,
      );
      expect(queryByPlaceholderText('e.g. 3')).toBeNull();
    });

    it('turns Keeper mode back off without routing through onUpgrade', () => {
      const onRosterContinuityChange = jest.fn();
      const onUpgrade = jest.fn();
      const { getByText } = render(
        <RosterContinuityField
          {...baseProps}
          rosterContinuity="keeper"
          onRosterContinuityChange={onRosterContinuityChange}
          onUpgrade={onUpgrade}
          isPremium
        />,
      );
      fireEvent.click(getByText('Redraft'));
      expect(onRosterContinuityChange).toHaveBeenCalledWith('redraft');
      expect(onUpgrade).not.toHaveBeenCalled();
    });

    it('enters a keeper count', () => {
      const onKeeperCountChange = jest.fn();
      const { getByPlaceholderText } = render(
        <RosterContinuityField
          {...baseProps}
          rosterContinuity="keeper"
          onKeeperCountChange={onKeeperCountChange}
          isPremium
        />,
      );
      fireEvent.change(getByPlaceholderText('e.g. 3'), {
        target: { value: '3' },
      });
      expect(onKeeperCountChange).toHaveBeenCalledWith(3);
    });

    it('surfaces a keeper count validation error', () => {
      const { getByText } = render(
        <RosterContinuityField
          {...baseProps}
          rosterContinuity="keeper"
          isPremium
          keeperCountError="Keeper count must be between 1 and 10."
        />,
      );
      expect(getByText('Keeper count must be between 1 and 10.')).toBeTruthy();
    });

    it('only offers the cost model matching the selected selectionMethod (standard)', () => {
      const onCostModelChange = jest.fn();
      const { getByText } = render(
        <RosterContinuityField
          {...baseProps}
          rosterContinuity="keeper"
          selectionMethod="standard"
          onCostModelChange={onCostModelChange}
          isPremium
        />,
      );
      fireEvent.click(getByText('Round Penalty'));
      expect(onCostModelChange).toHaveBeenCalledWith('round-penalty');
      fireEvent.click(getByText('Auction Budget'));
      expect(onCostModelChange).not.toHaveBeenCalledWith('auction-budget');
    });

    it('only offers the cost model matching the selected selectionMethod (auction)', () => {
      const onCostModelChange = jest.fn();
      const { getByText } = render(
        <RosterContinuityField
          {...baseProps}
          rosterContinuity="keeper"
          selectionMethod="auction"
          onCostModelChange={onCostModelChange}
          isPremium
        />,
      );
      fireEvent.click(getByText('Auction Budget'));
      expect(onCostModelChange).toHaveBeenCalledWith('auction-budget');
      fireEvent.click(getByText('Round Penalty'));
      expect(onCostModelChange).not.toHaveBeenCalledWith('round-penalty');
    });

    it('enters max consecutive keeps', () => {
      const onMaxConsecutiveKeepsChange = jest.fn();
      const { getByPlaceholderText } = render(
        <RosterContinuityField
          {...baseProps}
          rosterContinuity="keeper"
          onMaxConsecutiveKeepsChange={onMaxConsecutiveKeepsChange}
          isPremium
        />,
      );
      fireEvent.change(getByPlaceholderText('Unlimited'), {
        target: { value: '2' },
      });
      expect(onMaxConsecutiveKeepsChange).toHaveBeenCalledWith(2);
    });

    it('toggles rookie exempt', () => {
      const onRookieExemptChange = jest.fn();
      const { getByText } = render(
        <RosterContinuityField
          {...baseProps}
          rosterContinuity="keeper"
          onRookieExemptChange={onRookieExemptChange}
          isPremium
        />,
      );
      fireEvent.click(getByText('Yes'));
      expect(onRookieExemptChange).toHaveBeenCalledWith(true);
    });
  });

  describe('CustomEraRange (LS-6083)', () => {
    const baseProps = {
      onChangeStart: jest.fn(),
      onChangeEnd: jest.fn(),
    };

    beforeEach(() => jest.clearAllMocks());

    it('shows no per-field errors when both years are valid 4-digit years', () => {
      const { queryByText } = render(
        <CustomEraRange {...baseProps} startYear={1940} endYear={1960} />,
      );
      expect(queryByText('Year cannot be negative.')).toBeNull();
      expect(queryByText('Enter a 4-digit year.')).toBeNull();
    });

    it('flags a negative start year with a per-field message', () => {
      const { getByText } = render(
        <CustomEraRange {...baseProps} startYear={-1940} endYear={1960} />,
      );
      expect(getByText('Year cannot be negative.')).toBeTruthy();
    });

    it('flags a negative end year with a per-field message', () => {
      const { getByText } = render(
        <CustomEraRange {...baseProps} startYear={1940} endYear={-1960} />,
      );
      expect(getByText('Year cannot be negative.')).toBeTruthy();
    });

    it('flags a non-4-digit start year with a per-field message', () => {
      const { getByText } = render(
        <CustomEraRange {...baseProps} startYear={194} endYear={1960} />,
      );
      expect(getByText('Enter a 4-digit year.')).toBeTruthy();
    });

    it('flags a non-4-digit end year with a per-field message', () => {
      const { getByText } = render(
        <CustomEraRange {...baseProps} startYear={1940} endYear={19600} />,
      );
      expect(getByText('Enter a 4-digit year.')).toBeTruthy();
    });

    it('shows no per-field error when a year is unset', () => {
      const { queryByText } = render(
        <CustomEraRange {...baseProps} startYear={undefined} endYear={1960} />,
      );
      expect(queryByText('Year cannot be negative.')).toBeNull();
      expect(queryByText('Enter a 4-digit year.')).toBeNull();
    });
  });

  describe('FaabBudgetField', () => {
    beforeEach(() => jest.clearAllMocks());

    it('renders the existing presets unchanged, plus a Custom option', () => {
      const { getByText } = render(
        <FaabBudgetField value={100} onChange={jest.fn()} />,
      );
      expect(getByText('$50')).toBeTruthy();
      expect(getByText('$500')).toBeTruthy();
      expect(getByText('Custom')).toBeTruthy();
    });

    it('selects a preset amount without entering custom mode', () => {
      const onChange = jest.fn();
      const { getByText, queryByPlaceholderText } = render(
        <FaabBudgetField value={100} onChange={onChange} />,
      );
      fireEvent.click(getByText('$250'));
      expect(onChange).toHaveBeenCalledWith(250);
      expect(queryByPlaceholderText('Enter amount')).toBeNull();
    });

    it('reveals a numeric input when Custom is selected, without changing the committed value', () => {
      const onChange = jest.fn();
      const { getByText, getByPlaceholderText } = render(
        <FaabBudgetField value={100} onChange={onChange} />,
      );
      fireEvent.click(getByText('Custom'));
      expect(getByPlaceholderText('Enter amount')).toBeTruthy();
      expect(onChange).not.toHaveBeenCalled();
    });

    it('calls onChange with the parsed integer when typing a custom amount', () => {
      const onChange = jest.fn();
      const { getByText, getByPlaceholderText } = render(
        <FaabBudgetField value={100} onChange={onChange} />,
      );
      fireEvent.click(getByText('Custom'));
      fireEvent.change(getByPlaceholderText('Enter amount'), {
        target: { value: '175' },
      });
      expect(onChange).toHaveBeenCalledWith(175);
    });

    it('does not call onChange for non-numeric custom input', () => {
      const onChange = jest.fn();
      const { getByText, getByPlaceholderText } = render(
        <FaabBudgetField value={100} onChange={onChange} />,
      );
      fireEvent.click(getByText('Custom'));
      fireEvent.change(getByPlaceholderText('Enter amount'), {
        target: { value: 'abc' },
      });
      expect(onChange).not.toHaveBeenCalled();
    });

    it('opens directly in Custom mode and pre-fills a non-preset value', () => {
      const { getByPlaceholderText } = render(
        <FaabBudgetField value={175} onChange={jest.fn()} />,
      );
      expect(getByPlaceholderText('Enter amount')).toHaveValue('175');
    });

    it('shows a validation error for an out-of-range custom amount', () => {
      const { getByText, getByPlaceholderText } = render(
        <FaabBudgetField
          value={100}
          onChange={jest.fn()}
          error="FAAB budget must be 1–100000."
        />,
      );
      fireEvent.click(getByText('Custom'));
      expect(getByText('FAAB budget must be 1–100000.')).toBeTruthy();
      expect(getByPlaceholderText('Enter amount')).toBeTruthy();
    });
  });

  describe('constants', () => {
    it('keeps the free baseball eras stable', () => {
      expect([...FREE_ERA_IDS_BY_SPORT.baseball].sort()).toEqual([
        'all',
        'modern',
      ]);
    });
  });
});
