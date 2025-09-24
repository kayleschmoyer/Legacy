import React, { useEffect, useState } from 'react';
import { Animated, Platform } from 'react-native';
import { KeyboardAvoidingView } from 'react-native';
import { Button, Input, Spinner, Text, YStack } from 'tamagui';

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [fadeAnim] = useState(new Animated.Value(0));

  useEffect(() => {
    Animated.timing(fadeAnim, {
      duration: 500,
      toValue: 1,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  const handleLogin = () => {
    setIsLoading(true);

    try {
      // TODO: Implement authentication logic here
      console.log('Login successful!');
      // Navigate to the main app screen after successful login
    } catch (error) {
      console.error('Login failed:', error);
      setErrorMessage('Login failed. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
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
        <Input
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          borderColor="$gray8"
          borderWidth={1}
          height={40}
          marginBottom="$3"
          paddingHorizontal="$3"
          width="100%"
        />
        <Input
          placeholder="Password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          borderColor="$gray8"
          borderWidth={1}
          height={40}
          marginBottom="$3"
          paddingHorizontal="$3"
          width="100%"
        />

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
          onPress={handleLogin}
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

        <Button
          backgroundColor="transparent"
          marginTop="$4"
          onPress={() => {
            // TODO: Implement registration navigation
          }}
        >
          <Text fontSize="$4" textAlign="center">
            Don't have an account?{' '}
            <Text color="$blue10" textDecorationLine="underline">
              Register here
            </Text>
          </Text>
        </Button>
      </Animated.View>
    </KeyboardAvoidingView>
  );
};

export default Login;
