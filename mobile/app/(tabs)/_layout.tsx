import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '../../styles/theme';

type IconName = keyof typeof Ionicons.glyphMap;

type TabIconConfig = {
  active: IconName;
  inactive: IconName;
};

type TabRoute = {
  key: string;
  name: string;
  params?: object;
};

type TabDescriptor = {
  options: {
    tabBarAccessibilityLabel?: string;
    tabBarButtonTestID?: string;
  };
};

type FloatingTabBarProps = {
  descriptors: Record<string, TabDescriptor>;
  navigation: {
    emit: (event: {
      type: 'tabPress';
      target: string;
      canPreventDefault: true;
    }) => { defaultPrevented: boolean };
    navigate: (name: string, params?: object) => void;
  };
  state: {
    index: number;
    routes: TabRoute[];
  };
};

const tabIcons: Record<string, TabIconConfig> = {
  calendar: {
    active: 'calendar',
    inactive: 'calendar-outline'
  },
  index: {
    active: 'home',
    inactive: 'home-outline'
  },
  create: {
    active: 'add',
    inactive: 'add'
  },
  projects: {
    active: 'folder-open',
    inactive: 'folder-open-outline'
  },
  search: {
    active: 'search',
    inactive: 'search-outline'
  }
};

function FloatingTabBar({ state, descriptors, navigation }: FloatingTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      pointerEvents="auto"
      style={[
        styles.tabBarShell,
        {
          paddingBottom: Math.max(insets.bottom, 8)
        }
      ]}
    >
      <View style={styles.tabBar}>
        {state.routes.map((route, index) => {
          const isFocused = state.index === index;
          const options = descriptors[route.key].options;
          const isAdd = route.name === 'create';
          const icon = tabIcons[route.name] ?? tabIcons.index;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };

          return (
            <Pressable
              accessibilityLabel={options.tabBarAccessibilityLabel}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              key={route.key}
              onPress={onPress}
              style={({ pressed }) => [
                styles.tabItem,
                isAdd && styles.addItem,
                pressed && styles.pressedItem
              ]}
              testID={options.tabBarButtonTestID}
            >
              {isAdd ? (
                <View style={styles.addButton}>
                  <Ionicons color={colors.text} name="add" size={31} />
                </View>
              ) : (
                <View style={styles.iconStack}>
                  <Ionicons
                    color={isFocused ? colors.text : stylesConfig.inactiveIcon}
                    name={isFocused ? icon.active : icon.inactive}
                    size={22}
                  />
                  <View style={[styles.activeLine, isFocused && styles.activeLineVisible]} />
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      initialRouteName="index"
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true
      }}
      tabBar={(props) => <FloatingTabBar {...props} />}
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

const stylesConfig = {
  inactiveIcon: colors.textSoft
};

const styles = StyleSheet.create({
  activeLine: {
    backgroundColor: 'transparent',
    borderRadius: 999,
    height: 3,
    marginTop: 8,
    width: 13
  },
  activeLineVisible: {
    backgroundColor: colors.primary
  },
  addButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderColor: '#A8D244',
    borderRadius: 999,
    borderWidth: 2,
    height: 58,
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: {
      width: 0,
      height: 10
    },
    shadowOpacity: 0.32,
    shadowRadius: 14,
    width: 58,
    elevation: 8
  },
  addItem: {
    marginHorizontal: 2,
    transform: [
      {
        translateY: -20
      }
    ]
  },
  iconStack: {
    alignItems: 'center',
    height: 36,
    justifyContent: 'center'
  },
  pressedItem: {
    opacity: 0.76
  },
  tabBar: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    flexDirection: 'row',
    height: 64,
    justifyContent: 'space-around',
    paddingHorizontal: 18,
    width: '100%'
  },
  tabBarShell: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 1,
    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: -8
    },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 10
  },
  tabItem: {
    alignItems: 'center',
    height: 62,
    justifyContent: 'center',
    width: 56
  }
});
