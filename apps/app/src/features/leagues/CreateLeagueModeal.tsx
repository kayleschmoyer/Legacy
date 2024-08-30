import React, { useEffect, useState } from 'react';
import {
  Button,
  Dialog,
  Form,
  Input,
  Spinner,
  ThemeParsed,
  useTheme,
  View,
  XStack,
  YStack,
} from 'tamagui';
import Toast from 'react-native-toast-message';
import { useRouter } from 'expo-router';
import { StyleSheet } from 'react-native';
import { CheckboxWithLabel } from '../../common/components/CheckboxWithLabel';
import { DraftType } from '../../api/db/graphql.generated';
import { addDays } from '../../common/utilities/DateUtilities';
import { useCreateLeagueMutation } from '../../api/db/leagues/Leagues.generated';
import { useAuthorizedUserInfo } from '../../common/auth/AuthorizedUserContext';
import { Dropdown, DropdownItem } from '../../common/components/Dropdown';

const DROPDOWN_TEAM_COUNT_ITEMS = Object.freeze<DropdownItem[]>([
  { text: '6', value: 6 },
  { text: '8', value: 8 },
  { text: '10', value: 10 },
  { text: '12', value: 12 },
]);

export interface CreateLeagueModalProps {
  open: boolean;
  onOpenChange(newValue: boolean): void;
}

export default function CreateLeagueModal(
  props: CreateLeagueModalProps,
): JSX.Element {
  const { onOpenChange, open } = props;
  const [leagueName, setLeagueName] = useState('');
  const [draftType, setDraftType] = useState(DraftType.Normal);
  const [numberOfTeams, setNumberOfTeams] = useState(10);
  const currentUserInfo = useAuthorizedUserInfo();
  const router = useRouter();

  const [createLeague, { data, loading, error }] = useCreateLeagueMutation({
    variables: {
      input: {
        leagueName: leagueName,
        numberOfTeams: numberOfTeams,
        userId: currentUserInfo.internalInfo.id,
        draftType: draftType,
        draftDate: addDays(new Date(), 5),
      },
    },
  });

  useEffect(() => {
    if (error) {
      Toast.show({
        type: 'error',
        text1: error.message,
      });
    }
  }, [error]);

  const onNumberOfTeamsChanged = (v: number | string) => {
    const numVal = typeof v === 'number' ? v : parseInt(v, 10);

    if (isNaN(numVal)) {
      return;
    }

    setNumberOfTeams(numVal);
  };

  const submit = async () => {
    await createLeague();
  };

  useEffect(() => {
    if (data?.createLeagueAndTeams?.league) {
      onOpenChange(false);
      router.navigate({
        pathname: './league/[leagueId]',
        params: {
          leagueId: data.createLeagueAndTeams.league.id,
        },
      });
    }
  }, [data?.createLeagueAndTeams?.league, router, onOpenChange]);

  return (
    <Dialog modal={true} open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Form onSubmit={submit}>
          <View style={styles.modalContainer}>
            <View style={styles.modalContentDark}>
              <YStack>
                <Input
                  flex={1}
                  placeholder="League Name"
                  value={leagueName}
                  onChangeText={setLeagueName}
                />
                <Dropdown
                  value={numberOfTeams}
                  onChange={onNumberOfTeamsChanged}
                  items={DROPDOWN_TEAM_COUNT_ITEMS}
                />
                <CheckboxWithLabel
                  checked={draftType === DraftType.Blind}
                  onCheckedChange={(v) =>
                    setDraftType(v ? DraftType.Blind : DraftType.Normal)
                  }
                  label="Use Blind Draft?"
                />

                <XStack width="100%">
                  <Button flexGrow={1} onPress={() => onOpenChange(false)}>
                    Close
                  </Button>
                  <Form.Trigger
                    asChild
                    disabled={loading}
                    alignSelf="flex-end"
                    flexGrow={1}
                  >
                    <Button
                      icon={loading ? () => <Spinner /> : undefined}
                    >
                      Submit
                    </Button>
                  </Form.Trigger>
                </XStack>
              </YStack>
            </View>
          </View>
        </Form>
      </Dialog.Portal>
    </Dialog>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#0D0D0D',
    padding: 20,
    width: '100%',
  },
  heading: {
    fontSize: 30,
    fontWeight: 'bold',
    color: '#FF8C00',
    textAlign: 'center',
    marginTop: 40,
  },
  subHeading: {
    fontSize: 18,
    color: '#FFFFFF',
    textAlign: 'center',
    marginTop: 10,
    textShadowColor: '#000',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  bannerImage: {
    width: '100%',
    height: 180,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 30,
    borderRadius: 15,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FF4500',
    marginVertical: 15,
  },
  buttonGroup: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
    color: '#FF8C00',
    width: '100%',
  },
  gradientButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: '#FF4500',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 5,
    marginHorizontal: 5,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  leagueSection: {
    marginVertical: 20,
    padding: 10,
    borderRadius: 10,
    backgroundColor: '#1E1E1E',
  },
  leagueText: {
    color: '#FF8C00',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 10,
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
  },
  modalContentDark: {
    backgroundColor: '#1E1E1E',
    borderRadius: 20,
    padding: 30,
    width: '90%',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 10,
  },
  modalSubtitle: {
    fontSize: 16,
    color: '#CCCCCC',
    marginBottom: 20,
  },
  input: {
    width: '100%',
    padding: 15,
    borderRadius: 10,
    backgroundColor: '#333',
    color: '#FFFFFF',
    fontSize: 16,
    marginBottom: 20,
  },
  modalButtonGroup: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  modalButton: {
    flex: 1,
    backgroundColor: '#FF8C00',
    paddingVertical: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginRight: 10,
  },
  modalButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  modalCancelButton: {
    flex: 1,
    backgroundColor: '#555',
    paddingVertical: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  modalCancelText: {
    color: '#FFF',
    fontSize: 16,
  },
  draftButton: {
    backgroundColor: '#FF4500',
    paddingVertical: 15,
    paddingHorizontal: 25,
    borderRadius: 10,
    marginBottom: 15,
    width: '100%',
    alignItems: 'center',
  },
  draftButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  closeModalButton: {
    backgroundColor: '#555',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    marginTop: 15,
  },
  closeModalText: {
    color: '#FFF',
    fontSize: 16,
  },
  placeholder: {
    marginVertical: 5,
    height: 50,
    backgroundColor: '#333',
    borderRadius: 10,
  },
  placeholderText: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginVertical: 10,
  },
  longList: {
    marginTop: 10,
    paddingBottom: 50,
  },
});
