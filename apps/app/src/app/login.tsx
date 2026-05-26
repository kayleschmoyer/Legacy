import React, { useEffect, useState } from 'react';
import { Animated, Platform } from 'react-native';
import { KeyboardAvoidingView } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Card, Spinner, Text, Theme, XStack, YStack } from 'tamagui';
import { useAuthHandlers } from '../common/auth/AuthHooks';

const Login: React.FC = () => {
  const router = useRouter();

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(
    undefined,
  );
  const [fadeAnim] = useState(new Animated.Value(0));

  useEffect(() => {
    Animated.timing(fadeAnim, {
      duration: 500,
      toValue: 1,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

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

  const onLogin = () => {
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
          <Animated.View style={[{ width: '100%' }, { opacity: fadeAnim }]}>
            <Card
              bordered
              padding="$5"
              borderRadius="$3"
              backgroundColor="#111B2F"
              borderColor="#24324A"
            >
              <YStack gap="$4" alignItems="center">
                <YStack gap="$2" alignItems="center" width="100%">
                  <Text
                    testID="login-title"
                    fontSize="$8"
                    fontWeight="800"
                    color="#F8FAFC"
                    textAlign="center"
                  >
                    Legacy Sports
                  </Text>
                  <Text fontSize="$4" color="#C5A55A" textAlign="center">
                    Sign in to access your fantasy leagues
                  </Text>
                </YStack>

                {errorMessage ? (
                  <XStack
                    testID="login-error"
                    width="100%"
                    padding="$3"
                    borderRadius="$2"
                    backgroundColor="#3A1420"
                    borderColor="#C41E3A"
                    borderWidth={1}
                  >
                    <Text color="#FCA5A5" textAlign="center" width="100%">
                      {errorMessage}
                    </Text>
                  </XStack>
                ) : null}

                <Button
                  testID="login-button"
                  width="100%"
                  height={52}
                  backgroundColor="#1B3A5C"
                  borderRadius="$2"
                  borderColor="#C5A55A"
                  borderWidth={1}
                  disabled={isLoading}
                  opacity={isLoading ? 0.7 : 1}
                  onPress={onLogin}
                  pressStyle={{ backgroundColor: '#244B74' }}
                >
                  <Text color="#FFFFFF" fontSize="$5" fontWeight="700">
                    {isLoading ? 'Signing in...' : 'Sign in with Google'}
                  </Text>
                </Button>

                {isLoading && (
                  <YStack
                    testID="login-loading"
                    alignItems="center"
                    marginTop="$2"
                  >
                    <Spinner size="large" color="#C5A55A" />
                  </YStack>
                )}
              </YStack>
            </Card>
          </Animated.View>
        </YStack>
      </KeyboardAvoidingView>
    </Theme>
  );
};

export default Login;
