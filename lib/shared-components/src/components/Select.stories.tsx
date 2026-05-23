import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { YStack } from 'tamagui';
import { Select } from './Select';

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
