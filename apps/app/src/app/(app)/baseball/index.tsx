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
import { Spinner } from '@ui-kitten/components';
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
      id: userInfo.id,
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
                params: {
                  leagueId: l?.league?.id,
                },
                pathname: './league/[leagueId]',
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
