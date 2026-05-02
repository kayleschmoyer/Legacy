import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { Button, Text, YStack } from 'tamagui';
import { Sheet } from './Sheet';
import { Chip } from './Chip';

const meta: Meta<typeof Sheet> = {
  title: 'Components/Sheet',
  component: Sheet,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

function FilterPickerDemo(): React.JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <YStack>
      <Button onPress={() => setOpen(true)}>Open filters</Button>
      <Sheet open={open} onOpenChange={setOpen} title="Filter Players">
        <YStack gap="$3">
          <Text
            fontFamily="$heading"
            fontSize={11}
            letterSpacing={1.6}
            color="$textMuted"
          >
            POSITIONS
          </Text>
          <YStack flexDirection="row" flexWrap="wrap" gap="$2">
            <Chip label="P" tone="P" selected />
            <Chip label="C" tone="C" />
            <Chip label="IF" tone="IF" />
            <Chip label="OF" tone="OF" />
            <Chip label="U" tone="U" />
          </YStack>

          <Text
            fontFamily="$heading"
            fontSize={11}
            letterSpacing={1.6}
            color="$textMuted"
          >
            ERA
          </Text>
          <YStack flexDirection="row" flexWrap="wrap" gap="$2">
            <Chip label="Dead Ball" />
            <Chip label="Live Ball" selected />
            <Chip label="Modern" />
            <Chip label="Negro Leagues" />
          </YStack>
        </YStack>
      </Sheet>
    </YStack>
  );
}

export const FilterPicker: Story = { render: () => <FilterPickerDemo /> };
