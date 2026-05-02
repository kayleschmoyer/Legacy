import type { Meta, StoryObj } from '@storybook/react';
import { YStack } from 'tamagui';
import { Input, Textarea } from './Input';

const meta: Meta<typeof Input> = {
  title: 'Components/Input',
  component: Input,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { placeholder: 'Brooklyn Bridegrooms' },
};

export const WithLabel: Story = {
  args: { label: 'League Name', placeholder: 'Cooperstown Society' },
};

export const Error: Story = {
  args: {
    label: 'League Name',
    placeholder: 'Cooperstown Society',
    error: 'A league with this name already exists',
  },
};

export const Disabled: Story = {
  args: { placeholder: 'Disabled', disabled: true, value: 'Read only' },
};

export const States: Story = {
  render: () => (
    <YStack gap="$3" width={320}>
      <Input label="Default" placeholder="Dead Ball Dynasty" />
      <Input
        label="With helper"
        placeholder="1923 Bambinos"
        helperText="Use 3–32 characters"
      />
      <Input
        label="Error"
        placeholder="1923 Bambinos"
        error="Name must be unique"
      />
      <Input label="Disabled" placeholder="—" disabled />
      <Textarea
        label="Description"
        placeholder="Tell your league's origin story…"
      />
    </YStack>
  ),
};
