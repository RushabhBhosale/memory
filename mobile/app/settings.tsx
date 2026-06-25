import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ScreenHeader } from "../components/ScreenHeader";
import {
  hasUsageAccessPermission,
  openUsageAccessSettings,
} from "../services/appUsage";
import {
  hasExpenseSmsPermissions,
  requestExpenseSmsPermissions,
} from "../services/expenses";
import {
  defaultLocationSettings,
  readLocationSettings,
  requestLocationPermissionFlow,
  saveLocationSettings,
  type LocationSettings,
} from "../services/locationIntelligence";
import {
  getNotificationPermissionStatus,
  requestNotificationPermissions,
} from "../services/notifications";
import {
  hasScreenshotPermissions,
  requestScreenshotPermissions,
  startScreenshotWatcher,
} from "../services/screenshotWatcher";
import { colors } from "../styles/theme";

type IconName = keyof typeof Ionicons.glyphMap;

type PermissionKey =
  | "notifications"
  | "sms"
  | "foregroundLocation"
  | "backgroundLocation"
  | "screenshots"
  | "appUsage";

type PermissionState = Record<PermissionKey, string>;

const initialPermissions: PermissionState = {
  appUsage: "checking",
  backgroundLocation: "checking",
  foregroundLocation: "checking",
  notifications: "checking",
  screenshots: "checking",
  sms: "checking",
};

const statusCopy = (status: string) => {
  if (status === "granted") {
    return "Allowed";
  }

  if (status === "unavailable") {
    return "Unavailable";
  }

  if (status === "checking") {
    return "Checking";
  }

  return "Needs access";
};

const isAllowed = (status: string) => status === "granted";

export default function SettingsScreen() {
  const [permissions, setPermissions] = useState<PermissionState>(initialPermissions);
  const [locationSettings, setLocationSettings] =
    useState<LocationSettings>(defaultLocationSettings);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyKey, setBusyKey] = useState("");

  const loadSettings = useCallback(async (options?: { refreshing?: boolean }) => {
    try {
      if (options?.refreshing) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const [
        notificationStatus,
        smsGranted,
        screenshotGranted,
        usageGranted,
        foregroundLocation,
        backgroundLocation,
        storedLocationSettings,
      ] = await Promise.all([
        getNotificationPermissionStatus().catch(() => "unavailable"),
        hasExpenseSmsPermissions().catch(() => false),
        hasScreenshotPermissions().catch(() => false),
        hasUsageAccessPermission().catch(() => false),
        Location.getForegroundPermissionsAsync().catch(() => ({ status: "unavailable" })),
        Location.getBackgroundPermissionsAsync().catch(() => ({ status: "unavailable" })),
        readLocationSettings(),
      ]);

      setPermissions({
        appUsage: usageGranted ? "granted" : Platform.OS === "android" ? "denied" : "unavailable",
        backgroundLocation: backgroundLocation.status,
        foregroundLocation: foregroundLocation.status,
        notifications: notificationStatus,
        screenshots: screenshotGranted ? "granted" : Platform.OS === "android" ? "denied" : "unavailable",
        sms: smsGranted ? "granted" : Platform.OS === "android" ? "denied" : "unavailable",
      });
      setLocationSettings(storedLocationSettings);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadSettings();
    }, [loadSettings]),
  );

  const runAction = async (key: string, action: () => Promise<void> | void) => {
    try {
      setBusyKey(key);
      await action();
      await loadSettings({ refreshing: true });
    } catch (err) {
      Alert.alert("Settings unavailable", err instanceof Error ? err.message : "Try again.");
    } finally {
      setBusyKey("");
    }
  };

  const requestLocation = () =>
    runAction("location", async () => {
      const result = await requestLocationPermissionFlow();

      if (result.foreground.status !== Location.PermissionStatus.GRANTED) {
        Alert.alert("Location blocked", "Allow location from system settings to enable places.");
        return;
      }

      if (result.background?.status !== Location.PermissionStatus.GRANTED) {
        Alert.alert(
          "Background location",
          "Allow background location from Android settings for geofences.",
          [
            { text: "Later", style: "cancel" },
            { text: "Open Settings", onPress: () => void Linking.openSettings() },
          ],
        );
      }
    });

  const requestScreenshots = () =>
    runAction("screenshots", async () => {
      const granted = await requestScreenshotPermissions();

      if (granted) {
        await startScreenshotWatcher();
      }
    });

  const updateLocationSetting = (key: keyof LocationSettings, value: boolean) =>
    runAction(`location-setting-${key}`, async () => {
      if (value && !isAllowed(permissions.backgroundLocation)) {
        const result = await requestLocationPermissionFlow();

        if (
          result.foreground.status !== Location.PermissionStatus.GRANTED ||
          result.background?.status !== Location.PermissionStatus.GRANTED
        ) {
          Alert.alert("Location access needed", "Enable location before turning this on.");
          return;
        }
      }

      const next = {
        ...locationSettings,
        [key]: value,
      };

      setLocationSettings(next);
      await saveLocationSettings(next);
    });

  if (loading) {
    return (
      <SafeAreaView edges={["top"]} style={styles.screen}>
        <View style={styles.loadingState}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.loadingText}>Loading settings...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top"]} style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            colors={[colors.primary]}
            refreshing={refreshing}
            tintColor={colors.primary}
            onRefresh={() => void loadSettings({ refreshing: true })}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader mode="back" title="Settings" />

        <View style={styles.introPanel}>
          <Text style={styles.introTitle}>App controls</Text>
          <Text style={styles.introText}>
            Manage device permissions, location intelligence, and system shortcuts.
          </Text>
        </View>

        <SectionTitle
          title="Permissions"
          detail="Device access used by reminders, screenshots, expenses, and tracking."
        />
        <View style={styles.panel}>
          <PermissionRow
            busy={busyKey === "notifications"}
            icon="notifications-outline"
            status={permissions.notifications}
            title="Notifications"
            onPress={() =>
              void runAction("notifications", async () => {
                await requestNotificationPermissions();
              })
            }
          />
          <PermissionRow
            busy={busyKey === "sms"}
            icon="chatbubble-ellipses-outline"
            status={permissions.sms}
            title="SMS transactions"
            onPress={() =>
              void runAction("sms", async () => {
                await requestExpenseSmsPermissions();
              })
            }
          />
          <PermissionRow
            busy={busyKey === "location"}
            icon="location-outline"
            status={
              isAllowed(permissions.foregroundLocation) &&
              isAllowed(permissions.backgroundLocation)
                ? "granted"
                : "denied"
            }
            subtitle={`Foreground ${statusCopy(
              permissions.foregroundLocation,
            ).toLowerCase()} · background ${statusCopy(
              permissions.backgroundLocation,
            ).toLowerCase()}`}
            title="Location"
            onPress={() => void requestLocation()}
          />
          <PermissionRow
            busy={busyKey === "screenshots"}
            icon="images-outline"
            status={permissions.screenshots}
            title="Screenshot inbox"
            onPress={() => void requestScreenshots()}
          />
          <PermissionRow
            busy={busyKey === "appUsage"}
            icon="bar-chart-outline"
            status={permissions.appUsage}
            title="App usage"
            onPress={() =>
              void runAction("appUsage", () => {
                openUsageAccessSettings();
              })
            }
          />
          <PermissionRow
            icon="finger-print-outline"
            status="granted"
            title="Vault security"
            onPress={() => router.push("/vault-settings")}
          />
        </View>

        <SectionTitle
          title="Location Features"
          detail="Controls for geofence reminders, timelines, and summaries."
        />
        <View style={styles.panel}>
          <SettingToggle
            busy={busyKey === "location-setting-locationReminders"}
            label="Location reminders"
            value={locationSettings.locationReminders}
            onValueChange={(value) => void updateLocationSetting("locationReminders", value)}
          />
          <SettingToggle
            busy={busyKey === "location-setting-placeTimeline"}
            label="Place timeline"
            value={locationSettings.placeTimeline}
            onValueChange={(value) => void updateLocationSetting("placeTimeline", value)}
          />
          <SettingToggle
            busy={busyKey === "location-setting-workHoursTracking"}
            label="Work hours"
            value={locationSettings.workHoursTracking}
            onValueChange={(value) => void updateLocationSetting("workHoursTracking", value)}
          />
          <SettingToggle
            busy={busyKey === "location-setting-homeArrivalSummary"}
            label="Home arrival summary"
            value={locationSettings.homeArrivalSummary}
            onValueChange={(value) => void updateLocationSetting("homeArrivalSummary", value)}
          />
          <SettingToggle
            busy={busyKey === "location-setting-frequentPlaceSuggestions"}
            label="Frequent place suggestions"
            value={locationSettings.frequentPlaceSuggestions}
            onValueChange={(value) =>
              void updateLocationSetting("frequentPlaceSuggestions", value)
            }
          />
        </View>

        <SectionTitle title="App Settings" detail="Open related settings and management screens." />
        <View style={styles.panel}>
          <NavRow
            icon="location-outline"
            title="Places"
            onPress={() => router.push("/(tabs)/location")}
          />
          <NavRow
            icon="wallet-outline"
            title="Expenses"
            onPress={() => router.push("/(tabs)/expenses")}
          />
          <NavRow
            icon="images-outline"
            title="Screenshot inbox"
            onPress={() => router.push("/screenshots")}
          />
          <NavRow
            icon="settings-outline"
            title="System settings"
            onPress={() => void Linking.openSettings()}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionTitle({ detail, title }: { detail?: string; title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {detail ? <Text style={styles.sectionDetail}>{detail}</Text> : null}
    </View>
  );
}

function PermissionRow({
  busy,
  icon,
  onPress,
  status,
  subtitle,
  title,
}: {
  busy?: boolean;
  icon: IconName;
  onPress: () => void;
  status: string;
  subtitle?: string;
  title: string;
}) {
  const allowed = isAllowed(status);

  return (
    <Pressable style={styles.row} onPress={onPress}>
      <View style={[styles.iconBubble, allowed && styles.iconBubbleAllowed]}>
        <Ionicons color={allowed ? colors.success : colors.primary} name={icon} size={19} />
      </View>
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle}>{title}</Text>
        {subtitle ? <Text style={styles.rowMeta}>{subtitle}</Text> : null}
      </View>
      {busy ? (
        <ActivityIndicator color={colors.primary} size="small" />
      ) : (
        <View style={[styles.statusPill, allowed && styles.statusPillAllowed]}>
          <Text style={[styles.statusText, allowed && styles.statusTextAllowed]}>
            {statusCopy(status)}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

function SettingToggle({
  busy,
  label,
  onValueChange,
  value,
}: {
  busy?: boolean;
  label: string;
  onValueChange: (value: boolean) => void;
  value: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowTitle}>{label}</Text>
      {busy ? (
        <ActivityIndicator color={colors.primary} size="small" />
      ) : (
        <Switch
          ios_backgroundColor={colors.borderStrong}
          thumbColor={colors.white}
          trackColor={{ false: colors.borderStrong, true: colors.primary }}
          value={value}
          onValueChange={onValueChange}
        />
      )}
    </View>
  );
}

function NavRow({
  icon,
  onPress,
  title,
}: {
  icon: IconName;
  onPress: () => void;
  title: string;
}) {
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <View style={styles.iconBubble}>
        <Ionicons color={colors.primary} name={icon} size={19} />
      </View>
      <Text style={styles.rowTitle}>{title}</Text>
      <Ionicons color={colors.textSoft} name="chevron-forward" size={18} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: 34,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  iconBubble: {
    alignItems: "center",
    backgroundColor: colors.backgroundSoft,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  iconBubbleAllowed: {
    backgroundColor: colors.successSurface,
  },
  loadingState: {
    alignItems: "center",
    flex: 1,
    gap: 12,
    justifyContent: "center",
  },
  loadingText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: "800",
  },
  introPanel: {
    backgroundColor: "#111217",
    borderRadius: 18,
    marginBottom: 22,
    padding: 18,
  },
  introText: {
    color: "rgba(255,255,255,0.68)",
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 21,
    marginTop: 6,
  },
  introTitle: {
    color: colors.white,
    fontSize: 23,
    fontWeight: "900",
    lineHeight: 28,
  },
  panel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 20,
    overflow: "hidden",
  },
  row: {
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 64,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rowCopy: {
    flex: 1,
    gap: 3,
  },
  rowMeta: {
    color: colors.textSoft,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 16,
  },
  rowTitle: {
    color: colors.text,
    flex: 1,
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 20,
  },
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  sectionDetail: {
    color: colors.textSoft,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
    marginTop: 3,
  },
  sectionHeader: {
    marginBottom: 10,
    marginTop: 2,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900",
  },
  statusPill: {
    alignItems: "center",
    backgroundColor: colors.dangerSurface,
    borderRadius: 999,
    minWidth: 92,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  statusPillAllowed: {
    backgroundColor: colors.successSurface,
  },
  statusText: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: "900",
  },
  statusTextAllowed: {
    color: colors.success,
  },
});
