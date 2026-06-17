import { Tabs } from 'expo-router';
import { Text } from 'react-native';

import { colors } from '../../styles/theme';

function AddTabIcon() {
  return <Text style={{ color: colors.white, fontSize: 22, fontWeight: '900' }}>+</Text>;
}

export default function TabsLayout() {
  return (
    <Tabs
      initialRouteName="index"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textSoft,
        tabBarHideOnKeyboard: true,
        tabBarItemStyle: {
          paddingVertical: 4
        },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderTopWidth: 1,
          height: 66,
          paddingBottom: 8,
          paddingTop: 6
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '900'
        }
      }}
    >
      <Tabs.Screen
        name="calendar"
        options={{
          title: 'Calendar'
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home'
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          tabBarIcon: AddTabIcon,
          tabBarIconStyle: {
            alignItems: 'center',
            backgroundColor: colors.accent,
            borderRadius: 999,
            height: 34,
            justifyContent: 'center',
            marginBottom: 1,
            width: 34
          },
          title: 'Add'
        }}
      />
      <Tabs.Screen
        name="projects"
        options={{
          title: 'Projects'
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Search'
        }}
      />
    </Tabs>
  );
}
