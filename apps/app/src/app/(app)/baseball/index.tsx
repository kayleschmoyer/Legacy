import React, { useState } from 'react';
import { Alert, ImageBackground, Modal } from 'react-native';
import { NavigationProp } from '@react-navigation/native';
import { Link } from 'expo-router';
import {
  Button,
  H1,
  H2,
  H3,
  Input,
  ScrollView,
  Spinner,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import CreateLeagueModal from '../../../features/leagues/CreateLeagueModal';
import { useAuthorizedUserInfo } from '../../../common/auth/AuthorizedUserContext';
import { useGetUserLeaguesQuery } from '../../../api/db/graphql.generated';

type RootStackParamList = {
  LeagueHome: { leagueName: string };
};

interface BaseballHomeProps {
  navigation: NavigationProp<RootStackParamList>;
}

export default function BaseballHome({
  navigation: _navigation,
}: BaseballHomeProps) {
  const [modalVisible, setModalVisible] = useState(false);
  const [inviteModalVisible, setInviteModalVisible] = useState(false);
  const [emailOrPhone, setEmailOrPhone] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const userInfo = useAuthorizedUserInfo();

  const { data, loading: loadingLeagues } = useGetUserLeaguesQuery({
    // Only run the query if user is authenticated
    skip: !userInfo?.id,
  });

  const openDraftModal = () => setModalVisible(true);

  const openInviteModal = () => setInviteModalVisible(true);
  const closeInviteModal = () => setInviteModalVisible(false);

  const sendInvite = () => {
    if (!emailOrPhone) {
      Alert.alert('Error', 'Please enter an email address or phone number');
      return;
    }

    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      Alert.alert('Success', `Invite sent to ${emailOrPhone}`);
      closeInviteModal();
      setEmailOrPhone('');
    }, 2000);
  };

  const leagues = data?.userLeagues || [];

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
      <YStack
        backgroundColor="$background"
        flexGrow={1}
        padding="$5"
        space="$5"
      >
        {/* Hero section */}
        <ImageBackground
          source="baseball_banner.jpg"
          style={{
            alignItems: 'center',
            borderRadius: 15,
            height: 180,
            justifyContent: 'center',
            marginBottom: 30,
            width: '100%',
          }}
          imageStyle={{ borderRadius: 15, opacity: 0.2 }}
        >
          <H1
            color="$orange9"
            fontSize="$9"
            fontWeight="bold"
            marginTop="$10"
            textAlign="center"
          >
            Baseball Fantasy
          </H1>
          <Text color="$color" fontSize="$6" marginTop="$2" textAlign="center">
            Where Legends Are Made
          </Text>
        </ImageBackground>

        {/* Invite Friends */}
        <XStack space="$3" width="100%">
          <Button
            flex={1}
            backgroundColor="$orange9"
            borderRadius="$3"
            onPress={openInviteModal}
          >
            <Text color="$white" fontSize="$5" fontWeight="bold">
              Invite Friends
            </Text>
          </Button>
        </XStack>

        {/* League management section */}
        <H2
          color="$orange9"
          fontSize="$8"
          fontWeight="bold"
          marginVertical="$3"
        >
          Manage Your Leagues
        </H2>
        <XStack justifyContent="space-between" space="$3" width="100%">
          <Button
            flex={1}
            backgroundColor="$orange9"
            borderRadius="$3"
            onPress={openDraftModal}
          >
            <Text color="$white" fontSize="$5" fontWeight="bold">
              Create New League
            </Text>
          </Button>
          <Button flex={1} backgroundColor="$orange9" borderRadius="$3">
            <Text color="$white" fontSize="$5" fontWeight="bold">
              Join League
            </Text>
          </Button>
        </XStack>

        {/* Current Leagues Section */}
        <H2
          color="$orange9"
          fontSize="$8"
          fontWeight="bold"
          marginVertical="$3"
        >
          Your Current Leagues
        </H2>
        <YStack
          backgroundColor="$gray2"
          borderRadius="$3"
          padding="$3"
          space="$2"
        >
          {loadingLeagues ? (
            <Spinner />
          ) : !leagues ? (
            <Text>Could not retrieve leagues.</Text>
          ) : (
            leagues.map((l) => (
              <Link
                href={{
                  params: {
                    leagueId: l?.id,
                  },
                  pathname: './league/[leagueId]',
                }}
                asChild={true}
                key={l?.id}
              >
                <Text
                  color="$orange9"
                  fontSize="$6"
                  fontWeight="600"
                  marginBottom="$2"
                >
                  {l?.name}
                </Text>
              </Link>
            ))
          )}
        </YStack>

        {/* Invite Friends Modal */}
        <Modal
          animationType="slide"
          transparent={true}
          visible={inviteModalVisible}
          onRequestClose={closeInviteModal}
        >
          <YStack
            alignItems="center"
            backgroundColor="rgba(0, 0, 0, 0.9)"
            flex={1}
            justifyContent="center"
          >
            <YStack
              alignItems="center"
              backgroundColor="$gray2"
              borderRadius="$5"
              padding="$7"
              width="90%"
              space="$4"
            >
              <H3 color="$color" fontSize="$8" fontWeight="bold">
                Invite Friends
              </H3>
              <Text color="$gray11" fontSize="$4">
                Enter an email address or phone number
              </Text>

              <Input
                backgroundColor="$gray8"
                borderRadius="$3"
                color="$color"
                fontSize="$4"
                placeholder="Email or Phone Number"
                placeholderTextColor="$gray10"
                value={emailOrPhone}
                onChangeText={setEmailOrPhone}
                keyboardType="email-address"
                autoCapitalize="none"
                width="100%"
              />

              <XStack justifyContent="space-between" space="$3" width="100%">
                <Button
                  flex={1}
                  backgroundColor="$orange9"
                  borderRadius="$3"
                  onPress={sendInvite}
                >
                  <Text color="$white" fontSize="$4" fontWeight="bold">
                    {isLoading ? 'Sending...' : 'Send Invite'}
                  </Text>
                </Button>

                <Button
                  flex={1}
                  backgroundColor="$gray8"
                  borderRadius="$3"
                  onPress={closeInviteModal}
                >
                  <Text color="$white" fontSize="$4">
                    Cancel
                  </Text>
                </Button>
              </XStack>
            </YStack>
          </YStack>
        </Modal>

        {/* Draft Modal */}
        <CreateLeagueModal open={modalVisible} onOpenChange={setModalVisible} />
      </YStack>
    </ScrollView>
  );
}
