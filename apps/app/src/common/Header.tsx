import { Link } from 'expo-router';
import { View } from 'react-native';

export function Header(): JSX.Element {
  return (
    <View>
      <Link href="/">Home</Link>
      <Link href="view_stats">View Stats</Link>
      <Link href="/football">Football</Link>
      <Link href="/baseball">Baseball</Link>
    </View>
  );
}
