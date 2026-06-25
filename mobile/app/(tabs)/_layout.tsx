import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  SmartCaptureCenter,
  type SmartCaptureCenterHandle,
} from "../../components/SmartCaptureCenter";
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

type FloatingTabBarProps = {
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
  onCaptureLongPress: () => void;
  onCapturePress: () => void;
};

const tabConfig: Record<
  string,
  { active: IconName; inactive: IconName; label: string }
> = {
  calendar: {
    active: "calendar",
    inactive: "calendar-outline",
    label: "History",
  },
  index: {
    active: "home",
    inactive: "home-outline",
    label: "Home",
  },
  create: {
    active: "add",
    inactive: "add",
    label: "",
  },
  search: {
    active: "search",
    inactive: "search-outline",
    label: "Search",
  },
  vault: {
    active: "key",
    inactive: "key-outline",
    label: "Vault",
  },
};

function FloatingTabBar({
  state,
  descriptors,
  navigation,
  onCaptureLongPress,
  onCapturePress,
}: FloatingTabBarProps) {
  const insets = useSafeAreaInsets();
  const visibleRoutes = state.routes.filter((route) =>
    Boolean(tabConfig[route.name]),
  );

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.tabBarShell,
        {
          bottom: Math.max(insets.bottom, 10),
        },
      ]}
    >
      <View style={styles.tabBar}>
        {visibleRoutes.map((route) => {
          const isFocused = state.routes[state.index]?.key === route.key;
          const options = descriptors[route.key].options;
          const isAdd = route.name === "create";
          const config = tabConfig[route.name] ?? tabConfig.index;

          const onPress = () => {
            if (isAdd) {
              onCapturePress();
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
              onLongPress={isAdd ? onCaptureLongPress : undefined}
              style={({ pressed }) => [
                styles.tabItem,
                isAdd && styles.addItem,
                pressed && styles.pressedItem,
              ]}
              testID={options.tabBarButtonTestID}
            >
              {isAdd ? (
                <View style={styles.captureStack}>
                  <View style={styles.addButton}>
                    <Ionicons
                      color={colors.white}
                      name="aperture-outline"
                      size={32}
                    />
                  </View>
                  <Text style={styles.captureLabel}>Capture</Text>
                </View>
              ) : (
                <View style={styles.iconStack}>
                  <Ionicons
                    color={isFocused ? colors.primary : colors.textSoft}
                    name={isFocused ? config.active : config.inactive}
                    size={22}
                  />
                  <Text
                    style={[
                      styles.tabLabel,
                      isFocused && styles.activeTabLabel,
                    ]}
                  >
                    {config.label}
                  </Text>
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
  const captureRef = useRef<SmartCaptureCenterHandle>(null);

  return (
    <>
      <Tabs
        initialRouteName="index"
        screenOptions={{
          headerShown: false,
          tabBarHideOnKeyboard: true,
        }}
        tabBar={(props) => (
          <FloatingTabBar
            {...props}
            onCaptureLongPress={() => captureRef.current?.openMenu()}
            onCapturePress={() => captureRef.current?.openQuickCapture()}
          />
        )}
      >
        <Tabs.Screen name="index" options={{ title: "Home" }} />
        <Tabs.Screen name="search" options={{ title: "Search" }} />
        <Tabs.Screen name="create" options={{ title: "Capture" }} />
        <Tabs.Screen name="expenses" options={{ title: "Expenses" }} />
        <Tabs.Screen name="calendar" options={{ title: "History" }} />
        <Tabs.Screen name="vault" options={{ title: "Vault" }} />
        <Tabs.Screen name="location" options={{ href: null }} />
      </Tabs>
      <SmartCaptureCenter ref={captureRef} />
    </>
  );
}

const styles = StyleSheet.create({
  addButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderColor: colors.white,
    borderRadius: 999,
    borderWidth: 4,
    height: 58,
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.24,
    shadowRadius: 12,
    width: 58,
    elevation: 9,
  },
  addItem: {
    transform: [
      {
        translateY: -19,
      },
    ],
  },
  activeTabLabel: {
    color: colors.primary,
  },
  captureLabel: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: "900",
    marginTop: 2,
  },
  captureStack: {
    alignItems: "center",
  },
  iconStack: {
    alignItems: "center",
    gap: 4,
    height: 45,
    justifyContent: "center",
  },
  pressedItem: {
    opacity: 0.72,
  },
  tabBar: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderRadius: 34,
    flexDirection: "row",
    height: 72,
    justifyContent: "space-around",
    paddingHorizontal: 12,
    width: "100%",
  },
  tabBarShell: {
    alignSelf: "center",
    borderRadius: 34,
    left: 18,
    position: "absolute",
    right: 18,
    shadowColor: "#000000",
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 12,
  },
  tabItem: {
    alignItems: "center",
    height: 64,
    justifyContent: "center",
    width: 58,
  },
  tabLabel: {
    color: colors.textSoft,
    fontSize: 10,
    fontWeight: "800",
  },
});
