import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { YStack } from 'tamagui';
import { MultiSelect, Select } from './Select';

const meta: Meta<typeof Select> = {
  title: 'Components/Select',
  component: Select,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

const ERAS = [
  { value: 'dead', label: 'Dead Ball Era (1900–1919)' },
  { value: 'live', label: 'Live Ball Era (1920–1941)' },
  { value: 'integration', label: 'Integration Era (1947–1968)' },
  { value: 'free-agent', label: 'Free-Agent Era (1976–1993)' },
  { value: 'modern', label: 'Modern Era (1994–present)' },
  { value: 'preview', label: 'Preview', disabled: true },
];

function DefaultDemo(): React.JSX.Element {
  const [v, set] = useState<string | undefined>();
  return (
    <YStack width={320}>
      <Select
        label="Era"
        placeholder="Choose an era"
        value={v}
        onValueChange={set}
        options={ERAS}
      />
    </YStack>
  );
}

export const Default: Story = { render: () => <DefaultDemo /> };

export const WithSelection: Story = {
  render: () => (
    <YStack width={320}>
      <Select label="Era" value="dead" options={ERAS} />
    </YStack>
  ),
};

export const Disabled: Story = {
  render: () => (
    <YStack width={320}>
      <Select
        label="Era"
        disabled
        placeholder="Locked by commissioner"
        options={ERAS}
      />
    </YStack>
  ),
};

const POSITIONS = [
  { value: 'P', label: 'P', tone: 'P' as const },
  { value: 'C', label: 'C', tone: 'C' as const },
  { value: 'IF', label: 'IF', tone: 'IF' as const },
  { value: 'OF', label: 'OF', tone: 'OF' as const },
  { value: 'U', label: 'U', tone: 'U' as const },
];

const noopMultiSelect = (_value: string[]): void => {
  // story-only no-op handler
};

function MultiSelectDemo(): React.JSX.Element {
  const [v, set] = useState<string[]>(['P', 'OF']);
  return (
    <YStack width={320}>
      <MultiSelect
        label="Positions"
        value={v}
        onValueChange={set}
        options={POSITIONS}
      />
    </YStack>
  );
}

export const MultiSelectChips: Story = {
  render: () => <MultiSelectDemo />,
};

export const MultiSelectDisabled: Story = {
  render: () => (
    <YStack width={320}>
      <MultiSelect
        label="Positions (locked)"
        value={['P']}
        onValueChange={noopMultiSelect}
        options={POSITIONS}
        disabled
      />
    </YStack>
  ),
};
