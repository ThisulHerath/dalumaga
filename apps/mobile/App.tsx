import { APP_NAME } from '@dalumaga/shared';
import { useState } from 'react';
import { Button, StyleSheet, Text, View } from 'react-native';
import { checkApi } from './src/check-api';
export default function App() {
  const [status, setStatus] = useState('Unchecked');
  async function connect() {
    setStatus('Checking…');
    try {
      await checkApi(process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:3000/v1');
      setStatus('Connected');
    } catch {
      setStatus('Unavailable');
    }
  }
  return (
    <View style={styles.screen}>
      <Text accessibilityRole="header" style={styles.title}>
        {APP_NAME} · දළුමඟ
      </Text>
      <Button title="Check API / සම්බන්ධතාව බලන්න" onPress={connect} />
      <Text accessibilityLiveRegion="polite">{status}</Text>
    </View>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', padding: 24, gap: 16 },
  title: { fontSize: 28, fontWeight: '600' },
});
