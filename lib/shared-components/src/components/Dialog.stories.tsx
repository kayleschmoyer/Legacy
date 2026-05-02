import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { Button, Text, XStack } from 'tamagui';
import { Dialog } from './Dialog';

const meta: Meta<typeof Dialog> = {
  title: 'Components/Dialog',
  component: Dialog,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

function DefaultDemo(): React.JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <XStack>
      <Button onPress={() => setOpen(true)}>Open dialog</Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Confirm trade"
        description="Send Babe Ruth + Cy Young in exchange for Mike Trout? Trades cannot be reversed once accepted."
        confirmLabel="Send Trade"
        cancelLabel="Cancel"
        onConfirm={() => setOpen(false)}
        onCancel={() => setOpen(false)}
      >
        <Text fontFamily="$body" color="$color" fontSize={14}>
          League veto window: 24 hours.
        </Text>
      </Dialog>
    </XStack>
  );
}

function DestructiveDemo(): React.JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <XStack>
      <Button onPress={() => setOpen(true)}>Delete league</Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Delete Cooperstown Society?"
        description="This permanently removes the league, its draft history, and all matchup records. This action cannot be undone."
        confirmLabel="Delete League"
        destructive
        onConfirm={() => setOpen(false)}
        onCancel={() => setOpen(false)}
      />
    </XStack>
  );
}

export const Default: Story = { render: () => <DefaultDemo /> };
export const Destructive: Story = { render: () => <DestructiveDemo /> };
