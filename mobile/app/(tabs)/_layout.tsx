import { Ionicons } from "@expo/vector-icons";
import { router, Tabs } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors } from "../../styles/theme";

type IconName = keyof typeof Ionicons.glyphMap;

type TabRoute = {
  key: string;
  name: string;
  params?: object;
};

type TabDescriptor = {
  options: {
    tabBarAccessibilityLabel?: string;
    tabBarButtonTestID?: string;
    title?: string;
  };
};

type FinanceTabBarProps = {
  descriptors: Record<string, TabDescriptor>;
  navigation: {
    emit: (event: {
      type: "tabPress";
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

const tabConfig: Record<
  string,
  { active: IconName; inactive: IconName; label: string }
> = {
  expenses: {
    active: "swap-vertical",
    inactive: "swap-vertical-outline",
    label: "Transactions",
  },
  index: {
    active: "home",
    inactive: "home-outline",
    label: "Home",
  },
  create: {
    active: "add-circle",
    inactive: "add-circle-outline",
    label: "Capture",
  },
};

function FinanceTabBar({ state, descriptors, navigation }: FinanceTabBarProps) {
  const insets = useSafeAreaInsets();
  const visibleRoutes = state.routes.filter((route) => tabConfig[route.name]);

  return (
    <View
      pointerEvents="box-none"
      style={[styles.tabBarShell, { bottom: Math.max(insets.bottom, 10) }]}
    >
      <View style={styles.tabBar}>
        {visibleRoutes.map((route) => {
          const isFocused = state.routes[state.index]?.key === route.key;
          const options = descriptors[route.key].options;
          const config = tabConfig[route.name];

          const onPress = () => {
            if (route.name === "create") {
              router.push("/capture" as never);
              return;
            }

            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
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
                pressed && styles.pressedItem,
              ]}
              testID={options.tabBarButtonTestID}
            >
              <Ionicons
                color={route.name === "create" ? colors.primary : isFocused ? colors.primary : colors.textSoft}
                name={isFocused || route.name === "create" ? config.active : config.inactive}
                size={route.name === "create" ? 28 : 22}
              />
              <Text style={[styles.tabLabel, isFocused && styles.activeTabLabel]}>
                {config.label}
              </Text>
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
        tabBarHideOnKeyboard: true,
      }}
      tabBar={(props) => <FinanceTabBar {...props} />}
    >
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="expenses" options={{ title: "Transactions" }} />
      <Tabs.Screen name="create" options={{ title: "Add transaction" }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  activeTabLabel: {
    color: colors.primary,
  },
  pressedItem: {
    opacity: 0.7,
  },
  tabBar: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-around",
    minHeight: 70,
    paddingHorizontal: 12,
  },
  tabBarShell: {
    left: 18,
    position: "absolute",
    right: 18,
  },
  tabItem: {
    alignItems: "center",
    flex: 1,
    gap: 3,
    justifyContent: "center",
    minHeight: 64,
  },
  tabLabel: {
    color: colors.textSoft,
    fontSize: 11,
    fontWeight: "800",
  },
});
