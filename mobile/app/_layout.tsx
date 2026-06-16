import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerTitleStyle: {
            fontWeight: '600'
          }
        }}
      >
        <Stack.Screen name="index" options={{ title: 'Memories' }} />
        <Stack.Screen name="add" options={{ title: 'Add Memory' }} />
        <Stack.Screen name="memories/[id]" options={{ title: 'Memory' }} />
      </Stack>
    </SafeAreaProvider>
  );
}
