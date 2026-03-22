import type { MockedResponse } from '@apollo/client/testing';
import { MockedProvider } from '@apollo/client/testing/react';
import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { CommissionerNoteControl } from './CommissionerNoteControl';
import {
  UpdateCommissionerNote,
  type UpdateCommissionerNoteMutation,
  type UpdateCommissionerNoteMutationVariables,
} from '../../api/db/graphql.generated';

const updateCommissionerNoteMock: MockedResponse<
  UpdateCommissionerNoteMutation,
  UpdateCommissionerNoteMutationVariables
> = {
  request: {
    query: UpdateCommissionerNote,
  },
  maxUsageCount: Number.MAX_SAFE_INTEGER,
  result: {
    data: {
      updateCommissionerNote: {
        __typename: 'CommissionerActionResult',
        success: true,
        message: 'Note updated',
      },
    },
  },
};

const meta: Meta<typeof CommissionerNoteControl> = {
  title: 'Features/Commissioner/CommissionerNoteControl',
  component: CommissionerNoteControl,
  decorators: [
    (Story) => (
      <MockedProvider mocks={[updateCommissionerNoteMock]}>
        <Story />
      </MockedProvider>
    ),
  ],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Commissioner note management control for persistent league-wide notes. Allows commissioners to set or clear a note visible to all league members.',
      },
    },
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: {
    leagueId: 1,
    currentNote: null,
    onSuccess: fn(),
    onError: fn(),
  },
};

export const WithNote: Story = {
  args: {
    leagueId: 1,
    currentNote: 'Draft is Friday at 8 PM!',
    onSuccess: fn(),
    onError: fn(),
  },
};

export const LongNote: Story = {
  args: {
    leagueId: 1,
    currentNote:
      'Reminder: the trade deadline is March 31. All pending trades must be accepted by then. Also, please check the waiver wire for new additions this week. Commissioner reserves the right to veto any trades deemed unfair.',
    onSuccess: fn(),
    onError: fn(),
  },
};
