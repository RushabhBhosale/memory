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
  index: { active: "home", inactive: "home-outline", label: "Home" },
  expenses: { active: "list", inactive: "list-outline", label: "Activity" },
  create: { active: "add", inactive: "add", label: "Add" },
  analytics: { active: "pie-chart", inactive: "pie-chart-outline", label: "Insights" },
  investments: { active: "trending-up", inactive: "trending-up-outline", label: "Portfolio" },
};

function FinanceTabBar({ state, descriptors, navigation }: FinanceTabBarProps) {
  const insets = useSafeAreaInsets();
  const visibleRoutes = state.routes.filter((route) => tabConfig[route.name]);

  return (
    <View style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      {visibleRoutes.map((route) => {
        const isFocused = state.routes[state.index]?.key === route.key;
        const options = descriptors[route.key].options;
        const config = tabConfig[route.name];

        if (route.name === "create") {
          return (
            <View key={route.key} style={styles.tabItem}>
              <Pressable
                accessibilityLabel="Add transaction"
                accessibilityRole="button"
                onPress={() => router.push("/expense-add")}
                style={({ pressed }) => [styles.addButton, pressed && styles.addPressed]}
              >
                <Ionicons color={colors.white} name="add" size={28} />
              </Pressable>
            </View>
          );
        }

        const onPress = () => {
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
            accessibilityLabel={options.tabBarAccessibilityLabel ?? config.label}
            accessibilityRole="button"
            accessibilityState={isFocused ? { selected: true } : {}}
            key={route.key}
            onPress={onPress}
            style={styles.tabItem}
            testID={options.tabBarButtonTestID}
          >
            <Ionicons
              color={isFocused ? colors.text : colors.textSoft}
              name={isFocused ? config.active : config.inactive}
              size={22}
            />
            <Text style={[styles.tabLabel, isFocused && styles.activeTabLabel]}>
              {config.label}
            </Text>
          </Pressable>
        );
      })}
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
      <Tabs.Screen name="expenses" options={{ title: "Activity" }} />
      <Tabs.Screen name="create" options={{ title: "Add" }} />
      <Tabs.Screen name="analytics" options={{ title: "Insights" }} />
      <Tabs.Screen name="investments" options={{ title: "Portfolio" }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  activeTabLabel: {
    color: colors.text,
  },
  addButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 18,
    height: 50,
    justifyContent: "center",
    shadowColor: colors.primary,
    shadowOffset: { height: 6, width: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    width: 50,
    elevation: 4,
  },
  addPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.96 }],
  },
  tabBar: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    bottom: 0,
    flexDirection: "row",
    left: 0,
    paddingTop: 8,
    position: "absolute",
    right: 0,
  },
  tabItem: {
    alignItems: "center",
    flex: 1,
    gap: 4,
    justifyContent: "center",
    minHeight: 52,
  },
  tabLabel: {
    color: colors.textSoft,
    fontSize: 11,
    fontWeight: "500",
  },
});
