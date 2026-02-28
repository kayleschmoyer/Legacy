import React, { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Modal, View } from 'react-native';
import { Button, Input, Spinner, XStack, YStack } from 'tamagui';
import { addDays } from '../../common/utilities/DateUtilities';
import { useCreateLeagueMutation } from '../../api/db/graphql.generated';
import { Dropdown, DropdownItem } from '../../common/components/Dropdown';
import { handleError } from '../../common/utilities/ErrorHandler';

// Draft field constants
const PLAYER_POOL_ITEMS = Object.freeze<DropdownItem[]>([
  { text: 'All MLB', value: 'all' },
  { text: 'National League', value: 'nl' },
  { text: 'American League', value: 'al' },
]);

const DRAFT_MODE_ITEMS = Object.freeze<DropdownItem[]>([
  { text: 'Live Draft', value: 'live' },
  { text: 'Automated Draft', value: 'automated' },
]);

const SELECTION_METHOD_ITEMS = Object.freeze<DropdownItem[]>([
  { text: 'Standard', value: 'standard' },
  { text: 'Auction', value: 'auction' },
  { text: 'Random', value: 'random' },
]);

const DROPDOWN_DRAFT_ORDER_ITEMS = Object.freeze<DropdownItem[]>([
  { text: 'Snake', value: 'snake' },
  { text: 'Linear', value: 'linear' },
]);

const DROPDOWN_TEAM_COUNT_ITEMS = Object.freeze<DropdownItem[]>([
  { text: '6', value: '6' },
  { text: '8', value: '8' },
  { text: '10', value: '10' },
  { text: '12', value: '12' },
  { text: '14', value: '14' },
  { text: '16', value: '16' },
]);

const DIVISION_COUNT_ITEMS = Object.freeze<DropdownItem[]>([
  { text: '1 Division', value: '1' },
  { text: '2 Divisions', value: '2' },
  { text: '3 Divisions', value: '3' },
  { text: '4 Divisions', value: '4' },
]);

const SCHEDULING_STRATEGY_ITEMS = Object.freeze<DropdownItem[]>([
  { text: 'Divisional', value: 'divisional' },
  { text: 'Round Robin', value: 'round-robin' },
  { text: 'Random', value: 'random' },
]);

export interface CreateLeagueModalProps {
  open: boolean;
  onOpenChange: (newValue: boolean) => void;
}

export default function CreateLeagueModal(
  props: CreateLeagueModalProps,
): React.JSX.Element {
  const { onOpenChange, open } = props;
  const [leagueName, setLeagueName] = useState('');
  const [playerPool, setPlayerPool] = useState<'all' | 'nl' | 'al'>('all');
  const [draftMode, setDraftMode] = useState<'live' | 'automated'>('live');
  const [selectionMethod, setSelectionMethod] = useState<
    'standard' | 'auction' | 'random'
  >('standard');
  const [draftOrder, setDraftOrder] = useState<'snake' | 'linear'>('snake');
  const [numberOfTeams, setNumberOfTeams] = useState(12);
  const [numberOfDivisions, setNumberOfDivisions] = useState(2);
  const [schedulingStrategy, setSchedulingStrategy] = useState<
    'divisional' | 'round-robin' | 'random'
  >('divisional');
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
  const router = useRouter();

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const [createLeague, { data, loading, error }] = useCreateLeagueMutation({
    variables: {
      input: {
        playerPool: playerPool,
        draftMode: draftMode,
        selectionMethod: selectionMethod,
        draftOrder: draftOrder,
        leagueName: leagueName,
        numberOfTeams: numberOfTeams,
        numberOfDivisions: numberOfDivisions,
        schedulingStrategy: schedulingStrategy,
        startDate: addDays(new Date(), 5).toISOString(),
      },
    },
  });

  useEffect(() => {
    if (error) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      handleError(error.message);
    }
  }, [error]);

  const onNumberOfTeamsChanged = (v: string) => {
    const numVal = parseInt(v, 10);

    if (isNaN(numVal)) {
      return;
    }

    setNumberOfTeams(numVal);
  };

  const onNumberOfDivisionsChanged = (v: string) => {
    const numVal = parseInt(v, 10);

    if (isNaN(numVal)) {
      return;
    }

    setNumberOfDivisions(numVal);
  };

  const submit = () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    createLeague().catch(handleError);
  };

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (data?.createLeagueAndTeams?.league) {
      onOpenChange(false);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
      router.navigate({
        params: {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
          leagueId: data.createLeagueAndTeams.league.id,
        },
        pathname: './league/[leagueId]',
      });
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  }, [data?.createLeagueAndTeams?.league, router, onOpenChange]);

  return (
    <Modal visible={open} onRequestClose={() => onOpenChange(false)}>
      <View
        backgroundColor="rgba(0, 0, 0, 0.8)"
        flex={1}
        justifyContent="center"
        alignItems="center"
        padding="$4"
      >
        <YStack
          backgroundColor="$gray2"
          borderRadius="$4"
          padding="$4"
          width="90%"
          maxWidth={400}
          space="$4"
        >
          <YStack space="$3">
            <Input
              placeholder="League Name"
              value={leagueName}
              onChangeText={setLeagueName}
            />
            <Dropdown
              value={numberOfTeams.toString()}
              onChange={onNumberOfTeamsChanged}
              items={DROPDOWN_TEAM_COUNT_ITEMS}
            />
            <Dropdown
              value={playerPool}
              onChange={(value) => setPlayerPool(value as 'all' | 'nl' | 'al')}
              items={PLAYER_POOL_ITEMS}
            />
            <Dropdown
              value={draftMode}
              onChange={(value) => {
                const mode = value as 'live' | 'automated';
                setDraftMode(mode);
                // Automated drafts only support 'random' selection method
                if (mode === 'automated') {
                  setSelectionMethod('random');
                }
              }}
              items={DRAFT_MODE_ITEMS}
            />
            <Dropdown
              value={selectionMethod}
              onChange={(value) =>
                setSelectionMethod(value as 'standard' | 'auction' | 'random')
              }
              items={SELECTION_METHOD_ITEMS}
              disabled={draftMode === 'automated'}
            />
            <Dropdown
              value={draftOrder}
              onChange={(value) => setDraftOrder(value as 'snake' | 'linear')}
              items={DROPDOWN_DRAFT_ORDER_ITEMS}
            />
            <Dropdown
              value={numberOfDivisions.toString()}
              onChange={onNumberOfDivisionsChanged}
              items={DIVISION_COUNT_ITEMS}
            />
            <Dropdown
              value={schedulingStrategy}
              onChange={(value) =>
                setSchedulingStrategy(
                  value as 'divisional' | 'round-robin' | 'random',
                )
              }
              items={SCHEDULING_STRATEGY_ITEMS}
            />

            <XStack space="$2" justifyContent="space-between">
              <Button
                flex={1}
                onPress={() => onOpenChange(false)}
                variant="outlined"
              >
                Close
              </Button>

              <Button
                flex={1}
                onPress={submit}
                accessoryLeft={
                  loading ? () => <Spinner size="small" /> : undefined
                }
              >
                Submit
              </Button>
            </XStack>
          </YStack>
        </YStack>
      </View>
    </Modal>
  );
}
