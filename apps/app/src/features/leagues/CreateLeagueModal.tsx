import React, { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Modal, View } from 'react-native';
import {
  Button,
  Checkbox,
  Input,
  Spinner,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import { Check } from '@tamagui/lucide-icons';
import { addDays } from '../../common/utilities/DateUtilities';
import { useCreateLeagueMutation } from '../../api/db/leagues/Leagues.generated';
import { Dropdown, DropdownItem } from '../../common/components/Dropdown';
import { handleError } from '../../common/utilities/ErrorHandler';

// DraftType enum constants since it's not exported from generated types
const DraftType = {
  Normal: 'NORMAL' as const,
  Blind: 'BLIND' as const,
} as const;

const DROPDOWN_TEAM_COUNT_ITEMS = Object.freeze<DropdownItem[]>([
  { text: '6', value: '6' },
  { text: '8', value: '8' },
  { text: '10', value: '10' },
  { text: '12', value: '12' },
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
  const [draftType, setDraftType] = useState<'NORMAL' | 'BLIND'>('NORMAL');
  const [numberOfTeams, setNumberOfTeams] = useState(10);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
  const router = useRouter();

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const [createLeague, { data, loading, error }] = useCreateLeagueMutation({
    variables: {
      input: {
        draftType: draftType,
        leagueName: leagueName,
        numberOfTeams: numberOfTeams,
        startDate: addDays(new Date(), 5).toISOString(),
      },
    },
  });

  useEffect(() => {
    if (error) {
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

  const submit = () => {
    createLeague().catch(handleError);
  };

  useEffect(() => {
    if (data?.createLeagueAndTeams?.league) {
      onOpenChange(false);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      router.navigate({
        params: {
          leagueId: data.createLeagueAndTeams.league.id,
        },
        pathname: './league/[leagueId]',
      });
    }
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
            <XStack alignItems="center" space="$2">
              <Checkbox
                checked={draftType === DraftType.Blind}
                onCheckedChange={(v) =>
                  setDraftType(v ? DraftType.Blind : DraftType.Normal)
                }
              >
                <Checkbox.Indicator>
                  <Check />
                </Checkbox.Indicator>
              </Checkbox>
              <Text>Use Blind Draft?</Text>
            </XStack>

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
