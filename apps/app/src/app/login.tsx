import React, { useEffect, useState } from 'react';
import { Animated, Platform } from 'react-native';
import { KeyboardAvoidingView } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Spinner, Text, YStack } from 'tamagui';
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
    googleLogin();
  };

  return (
    <KeyboardAvoidingView
      style={{
        alignItems: 'center',
        flex: 1,
        justifyContent: 'center',
        padding: 20,
      }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Text
        fontSize="$8"
        fontWeight="bold"
        marginBottom="$8"
        textAlign="center"
      >
        Welcome to Legacy Sports!
      </Text>

      <Animated.View style={[{ width: '100%' }, { opacity: fadeAnim }]}>
        {errorMessage ? (
          <Text color="$red10" marginTop="$3" textAlign="center">
            {errorMessage}
          </Text>
        ) : null}

        <Button
          backgroundColor="$green10"
          borderRadius="$2"
          marginTop="$6"
          paddingHorizontal="$5"
          paddingVertical="$3"
          onPress={onLogin}
        >
          <Text color="$white" fontSize="$5" fontWeight="bold">
            Login
          </Text>
        </Button>

        {isLoading && (
          <YStack alignItems="center" marginTop="$5">
            <Spinner size="large" color="$blue10" />
          </YStack>
        )}
      </Animated.View>
    </KeyboardAvoidingView>
  );
};

export default Login;
