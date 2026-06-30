import { SafeAreaView } from 'react-native';

interface SafeScreenProps {
  children: React.ReactNode;
  backgroundColor?: string;
}

export function SafeScreen({
  children,
  backgroundColor = '#0A0F1A',
}: SafeScreenProps): React.JSX.Element {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor }}>{children}</SafeAreaView>
  );
}
