import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
} from 'react-native';
import { useAuthHandlers } from '../common/auth/AuthHooks';
import { useRouter } from 'expo-router';

const Login: React.FC = () => {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(
    undefined,
  );
  const [fadeAnim] = useState(new Animated.Value(0));

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  const { googleLogin } = useAuthHandlers({
    onSuccess: () => {
      setIsLoading(false);
      router.replace('/');
    },
    onFailure: (err) => {
      setIsLoading(false);
      setErrorMessage(err);
    },
  });

  const onLogin = () => {
    setIsLoading(true);
    googleLogin();
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Text style={styles.title}>Welcome to Legacy Sports!</Text>

      <Animated.View style={[styles.formContainer, { opacity: fadeAnim }]}>
        {errorMessage ? (
          <Text style={styles.errorMessage}>{errorMessage}</Text>
        ) : null}

        <TouchableOpacity style={styles.loginButton} onPress={onLogin}>
          <Text style={styles.loginButtonText}>Login</Text>
        </TouchableOpacity>

        {isLoading && (
          <ActivityIndicator
            size="large"
            color="blue"
            style={styles.loadingIndicator}
          />
        )}
      </Animated.View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  logo: {
    width: 200,
    height: 200,
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 30,
  },
  formContainer: {
    width: '100%',
  },
  input: {
    width: '100%',
    height: 40,
    borderWidth: 1,
    borderColor: 'gray',
    marginBottom: 10,
    paddingHorizontal: 10,
  },
  loginButton: {
    backgroundColor: 'green',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 5,
    marginTop: 20,
  },
  loginButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  registerLinkContainer: {
    marginTop: 15,
  },
  registerLinkText: {
    fontSize: 16,
  },
  registerLink: {
    color: 'blue',
    textDecorationLine: 'underline',
  },
  errorMessage: {
    color: 'red',
    marginTop: 10,
  },
  loadingIndicator: {
    marginTop: 20,
  },
});

export default Login;
