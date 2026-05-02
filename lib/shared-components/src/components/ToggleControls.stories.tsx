import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { Checkbox, Radio, SegmentedControl, Switch } from './ToggleControls';

const meta: Meta = {
  title: 'Components/ToggleControls',
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj;

const noop = (_value: string): void => {
  // story-only no-op handler
};

export const Switches: Story = {
  render: () => (
    <YStack gap="$2">
      <Switch label="Notifications" defaultChecked />
      <Switch label="Email digests" />
      <Switch label="Disabled" disabled />
    </YStack>
  ),
};

export const Checkboxes: Story = {
  render: () => (
    <YStack gap="$2">
      <Checkbox label="Allow trades" defaultChecked />
      <Checkbox label="Indeterminate" indeterminate checked="indeterminate" />
      <Checkbox label="Off" />
      <Checkbox label="Disabled" disabled />
    </YStack>
  ),
};

function RadiosDemo(): React.JSX.Element {
  const [v, set] = useState('h2h');
  return (
    <Radio
      value={v}
      onValueChange={set}
      options={[
        { value: 'h2h', label: 'Head-to-Head' },
        { value: 'roto', label: 'Rotisserie' },
        { value: 'points', label: 'Points (Total)' },
        { value: 'beta', label: 'Cooperstown Beta', disabled: true },
      ]}
    />
  );
}

function SegmentedDemo(): React.JSX.Element {
  const [era, setEra] = useState('live');
  return (
    <YStack gap="$3">
      <Text
        fontFamily="$heading"
        letterSpacing={1.2}
        fontSize={11}
        color="$textMuted"
      >
        ERA
      </Text>
      <SegmentedControl
        value={era}
        onValueChange={setEra}
        options={[
          { value: 'dead', label: 'Dead Ball' },
          { value: 'live', label: 'Live Ball' },
          { value: 'modern', label: 'Modern' },
        ]}
      />
      <SegmentedControl
        size="sm"
        value="pm"
        onValueChange={noop}
        options={[
          { value: 'am', label: 'AM' },
          { value: 'pm', label: 'PM' },
        ]}
      />
    </YStack>
  );
}

export const Radios: Story = { render: () => <RadiosDemo /> };
export const Segmented: Story = { render: () => <SegmentedDemo /> };

export const All: Story = {
  render: () => (
    <XStack gap="$6">
      <YStack gap="$2">
        <Text
          fontFamily="$heading"
          letterSpacing={1.2}
          fontSize={11}
          color="$textMuted"
        >
          SWITCH
        </Text>
        <Switch label="On" defaultChecked />
        <Switch label="Off" />
      </YStack>
      <YStack gap="$2">
        <Text
          fontFamily="$heading"
          letterSpacing={1.2}
          fontSize={11}
          color="$textMuted"
        >
          CHECKBOX
        </Text>
        <Checkbox label="Checked" defaultChecked />
        <Checkbox label="Indeterminate" indeterminate checked="indeterminate" />
        <Checkbox label="Off" />
      </YStack>
    </XStack>
  ),
};
