import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { colors } from '../styles/theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          contentStyle: {
            backgroundColor: colors.background
          },
          headerStyle: {
            backgroundColor: colors.background
          },
          headerShadowVisible: false,
          headerTintColor: colors.text,
          headerTitleStyle: {
            fontWeight: '700'
          }
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="add" options={{ title: 'Add Memory' }} />
        <Stack.Screen name="memories/[id]" options={{ title: 'Memory' }} />
        <Stack.Screen name="projects/[id]" options={{ title: 'Project' }} />
      </Stack>
    </SafeAreaProvider>
  );
}
