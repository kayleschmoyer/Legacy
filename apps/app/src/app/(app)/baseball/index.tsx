import React, { useState } from 'react';
import {
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { NavigationProp } from '@react-navigation/native';
import { ImageBackground } from 'expo-image';

import { Link } from 'expo-router';
import { Spinner } from 'tamagui';
import CreateLeagueModal from '../../../features/leagues/CreateLeagueModal';
import { useAuthorizedUserInfo } from '../../../common/auth/AuthorizedUserContext';
import { useGetLeaguesForUserQuery } from '../../../api/db/users/Users.generated';

type RootStackParamList = {
  LeagueHome: { leagueName: string };
};

interface BaseballHomeProps {
  navigation: NavigationProp<RootStackParamList>;
}

export default function BaseballHome({ navigation }: BaseballHomeProps) {
  const [modalVisible, setModalVisible] = useState(false);
  const [inviteModalVisible, setInviteModalVisible] = useState(false);
  const [emailOrPhone, setEmailOrPhone] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const userInfo = useAuthorizedUserInfo();

  const { data, loading: loadingLeagues } = useGetLeaguesForUserQuery({
    variables: {
      id: userInfo.internalInfo.id,
    },
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

  const leagues = data?.user?.leagueMembers.nodes;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Hero section */}
      <ImageBackground
        source="baseball-banner.jpg"
        style={styles.bannerImage}
        imageStyle={{ borderRadius: 15, opacity: 0.2 }}
      >
        <Text style={styles.heading}>Baseball Fantasy</Text>
        <Text style={styles.subHeading}>Where Legends Are Made</Text>
      </ImageBackground>

      {/* Invite Friends */}
      <View style={styles.buttonGroup}>
        <TouchableOpacity
          style={styles.gradientButton}
          onPress={openInviteModal}
        >
          <Text style={styles.buttonText}>Invite Friends</Text>
        </TouchableOpacity>
      </View>

      {/* League management section */}
      <Text style={styles.sectionTitle}>Manage Your Leagues</Text>
      <View style={styles.buttonGroup}>
        <TouchableOpacity
          style={styles.gradientButton}
          onPress={openDraftModal}
        >
          <Text style={styles.buttonText}>Create New League</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.gradientButton}>
          <Text style={styles.buttonText}>Join League</Text>
        </TouchableOpacity>
      </View>

      {/* Current Leagues Section */}
      <Text style={styles.sectionTitle}>Your Current Leagues</Text>
      <View style={styles.leagueSection}>
        {loadingLeagues ? (
          <Spinner />
        ) : !leagues ? (
          <Text>Could not retrieve leagues.</Text>
        ) : (
          leagues.map((l) => (
            <Link
              href={{
                pathname: './league/[leagueId]',
                params: {
                  leagueId: l?.league?.id,
                },
              }}
              asChild={true}
              key={l?.league?.id}
            >
              <Text style={styles.leagueText}>{l?.league?.name}</Text>
            </Link>
          ))
        )}
      </View>

      {/* Invite Friends Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={inviteModalVisible}
        onRequestClose={closeInviteModal}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContentDark}>
            <Text style={styles.modalTitle}>Invite Friends</Text>
            <Text style={styles.modalSubtitle}>
              Enter an email address or phone number
            </Text>

            <TextInput
              style={styles.input}
              placeholder="Email or Phone Number"
              placeholderTextColor="#999"
              value={emailOrPhone}
              onChangeText={setEmailOrPhone}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <View style={styles.modalButtonGroup}>
              <TouchableOpacity style={styles.modalButton} onPress={sendInvite}>
                <Text style={styles.modalButtonText}>
                  {isLoading ? 'Sending...' : 'Send Invite'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={closeInviteModal}
                style={styles.modalCancelButton}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Draft Modal */}
      <CreateLeagueModal open={modalVisible} onOpenChange={setModalVisible} />
    </ScrollView>
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
