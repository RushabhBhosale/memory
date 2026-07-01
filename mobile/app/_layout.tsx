import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { colors } from '../styles/theme';
import '../services/locationIntelligence';
import { startScreenshotWatcher } from '../services/screenshotWatcher';

export default function RootLayout() {
  useEffect(() => {
    void startScreenshotWatcher();
  }, []);

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
        <Stack.Screen name="app-usage" options={{ title: 'App Usage' }} />
        <Stack.Screen name="daily-summaries" options={{ headerShown: false }} />
        <Stack.Screen name="daily-summaries/[date]" options={{ headerShown: false }} />
        <Stack.Screen name="expense-add" options={{ headerShown: false }} />
        <Stack.Screen name="location" options={{ headerShown: false }} />
        <Stack.Screen name="screenshots" options={{ headerShown: false }} />
        <Stack.Screen name="settings" options={{ headerShown: false }} />
        <Stack.Screen name="sms-tracking-debug" options={{ headerShown: false }} />
        <Stack.Screen name="summary/daily" options={{ headerShown: false }} />
        <Stack.Screen name="activity/[type]/[id]" options={{ title: 'Details' }} />
        <Stack.Screen name="activity-list/[filter]" options={{ headerShown: false }} />
        <Stack.Screen name="memories/[id]" options={{ title: 'Memory' }} />
        <Stack.Screen name="vault-add" options={{ headerShown: false }} />
        <Stack.Screen name="vault-settings" options={{ headerShown: false }} />
      </Stack>
    </SafeAreaProvider>
  );
}
