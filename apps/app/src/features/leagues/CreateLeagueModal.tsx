import React, { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Modal, StyleSheet, View } from 'react-native';
import { Button, Checkbox, Input, Spinner, Text } from 'tamagui';
import { Check } from '@tamagui/lucide-icons';
import { DraftType } from '../../api/db/graphql.generated';
import { addDays } from '../../common/utilities/DateUtilities';
import { useCreateLeagueMutation } from '../../api/db/leagues/Leagues.generated';
import { useAuthorizedUserInfo } from '../../common/auth/AuthorizedUserContext';
import { Dropdown, DropdownItem } from '../../common/components/Dropdown';
import { handleError } from '../../common/utilities/ErrorHandler';

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
  props: CreateLeagueModalProps
): React.JSX.Element {
  const { onOpenChange, open } = props;
  const [leagueName, setLeagueName] = useState('');
  const [draftType, setDraftType] = useState(DraftType.Normal);
  const [numberOfTeams, setNumberOfTeams] = useState(10);
  const currentUserInfo = useAuthorizedUserInfo();
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
  const router = useRouter();

  const [createLeague, { data, loading, error }] = useCreateLeagueMutation({
    variables: {
      input: {
        draftDate: addDays(new Date(), 5),
        draftType: draftType,
        leagueName: leagueName,
        numberOfTeams: numberOfTeams,
        userId: currentUserInfo.id,
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
      <View style={styles.modalContainer}>
        <View style={styles.modalContentDark}>
          <View>
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

            <View>
              <Button onPress={() => onOpenChange(false)}>Close</Button>

              <Button
                onPress={submit}
                accessoryLeft={
                  loading ? () => <Spinner size="small" /> : undefined
                }
              >
                Submit
              </Button>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bannerImage: {
    alignItems: 'center',
    borderRadius: 15,
    height: 180,
    justifyContent: 'center',
    marginBottom: 30,
    width: '100%',
  },
  buttonGroup: {
    color: '#FF8C00',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
    width: '100%',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  closeModalButton: {
    backgroundColor: '#555',
    borderRadius: 10,
    marginTop: 15,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  closeModalText: {
    color: '#FFF',
    fontSize: 16,
  },
  container: {
    backgroundColor: '#0D0D0D',
    flexGrow: 1,
    padding: 20,
    width: '100%',
  },
  draftButton: {
    alignItems: 'center',
    backgroundColor: '#FF4500',
    borderRadius: 10,
    marginBottom: 15,
    paddingHorizontal: 25,
    paddingVertical: 15,
    width: '100%',
  },
  draftButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  gradientButton: {
    backgroundColor: '#FF4500',
    borderRadius: 10,
    elevation: 5,
    flex: 1,
    marginHorizontal: 5,
    paddingHorizontal: 20,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: {
      height: 4,
      width: 0,
    },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  heading: {
    color: '#FF8C00',
    fontSize: 30,
    fontWeight: 'bold',
    marginTop: 40,
    textAlign: 'center',
  },
  input: {
    backgroundColor: '#333',
    borderRadius: 10,
    color: '#FFFFFF',
    fontSize: 16,
    marginBottom: 20,
    padding: 15,
    width: '100%',
  },
  leagueSection: {
    backgroundColor: '#1E1E1E',
    borderRadius: 10,
    marginVertical: 20,
    padding: 10,
  },
  leagueText: {
    color: '#FF8C00',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 10,
  },
  longList: {
    marginTop: 10,
    paddingBottom: 50,
  },
  modalButton: {
    alignItems: 'center',
    backgroundColor: '#FF8C00',
    borderRadius: 10,
    flex: 1,
    marginRight: 10,
    paddingVertical: 15,
  },
  modalButtonGroup: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  modalButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  modalCancelButton: {
    alignItems: 'center',
    backgroundColor: '#555',
    borderRadius: 10,
    flex: 1,
    paddingVertical: 15,
  },
  modalCancelText: {
    color: '#FFF',
    fontSize: 16,
  },
  modalContainer: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    flex: 1,
    justifyContent: 'center',
  },
  modalContentDark: {
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    borderRadius: 20,
    padding: 30,
    width: '90%',
  },
  modalSubtitle: {
    color: '#CCCCCC',
    fontSize: 16,
    marginBottom: 20,
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  placeholder: {
    backgroundColor: '#333',
    borderRadius: 10,
    height: 50,
    marginVertical: 5,
  },
  placeholderText: {
    color: '#888',
    fontSize: 14,
    marginVertical: 10,
    textAlign: 'center',
  },
  sectionTitle: {
    color: '#FF4500',
    fontSize: 24,
    fontWeight: 'bold',
    marginVertical: 15,
  },
  subHeading: {
    color: '#FFFFFF',
    fontSize: 18,
    marginTop: 10,
    textAlign: 'center',
    textShadowColor: '#000',
    textShadowOffset: {
      height: 1,
      width: 1,
    },
    textShadowRadius: 3,
  },
});
