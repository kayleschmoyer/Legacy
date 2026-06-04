import React, { useState } from 'react';
import { Platform } from 'react-native';
import { KeyboardAvoidingView } from 'react-native';
import { useRouter } from 'expo-router';
import { Theme, YStack } from 'tamagui';
import { LoginPage } from '@legacy-sports/shared-components';
import { useAuthHandlers } from '../common/auth/AuthHooks';

const Login: React.FC = () => {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(
    undefined,
  );

  const { googleLogin } = useAuthHandlers({
    onFailure: (err) => {
      setIsLoading(false);
      setErrorMessage(err);
    },
    onSuccess: () => {
      setIsLoading(false);
      router.replace('/');
    },
  });

  const handleGoogleSignIn = () => {
    setIsLoading(true);
    void googleLogin();
  };

  return (
    <Theme name="legacy_dark">
      <KeyboardAvoidingView
        testID="login-screen"
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <YStack
          flex={1}
          justifyContent="center"
          padding="$5"
          backgroundColor="#0A0F1A"
        >
          <LoginPage
            onGoogleSignIn={handleGoogleSignIn}
            isGoogleLoading={isLoading}
            errorMessage={errorMessage}
          />
        </YStack>
      </KeyboardAvoidingView>
    </Theme>
  );
};

export default Login;
