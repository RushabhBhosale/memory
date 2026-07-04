import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppHeader } from "../../components/AppHeader";
import {
  hasUsageAccessPermission,
  openUsageAccessSettings,
} from "../../services/appUsage";
import {
  hasExpenseSmsPermissions,
  requestExpenseSmsPermissions,
} from "../../services/expenses";
import {
  getNotificationPermissionStatus,
  requestNotificationPermissions,
} from "../../services/notifications";
import {
  hasScreenshotPermissions,
  requestScreenshotPermissions,
  startScreenshotWatcher,
} from "../../services/screenshotWatcher";
import { colors } from "../../styles/theme";

type IconName = keyof typeof Ionicons.glyphMap;

type PermissionKey = "notifications" | "sms" | "screenshots" | "appUsage";
type PermissionState = Record<PermissionKey, string>;

const initialPermissions: PermissionState = {
  appUsage: "checking",
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

export default function PermissionsScreen() {
  const [permissions, setPermissions] = useState<PermissionState>(initialPermissions);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyKey, setBusyKey] = useState("");

  const loadPermissions = useCallback(async (options?: { refreshing?: boolean }) => {
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
      ] = await Promise.all([
        getNotificationPermissionStatus().catch(() => "unavailable"),
        hasExpenseSmsPermissions().catch(() => false),
        hasScreenshotPermissions().catch(() => false),
        hasUsageAccessPermission().catch(() => false),
      ]);

      setPermissions({
        appUsage: usageGranted ? "granted" : Platform.OS === "android" ? "denied" : "unavailable",
        notifications: notificationStatus,
        screenshots: screenshotGranted ? "granted" : Platform.OS === "android" ? "denied" : "unavailable",
        sms: smsGranted ? "granted" : Platform.OS === "android" ? "denied" : "unavailable",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadPermissions();
    }, [loadPermissions]),
  );

  const runAction = async (key: string, action: () => Promise<void> | void) => {
    try {
      setBusyKey(key);
      await action();
      await loadPermissions({ refreshing: true });
    } catch (err) {
      Alert.alert("Permission unavailable", err instanceof Error ? err.message : "Try again.");
    } finally {
      setBusyKey("");
    }
  };

  const requestScreenshots = () =>
    runAction("screenshots", async () => {
      const granted = await requestScreenshotPermissions();

      if (granted) {
        await startScreenshotWatcher();
      }
    });

  if (loading) {
    return (
      <SafeAreaView edges={["top"]} style={styles.screen}>
        <View style={styles.loadingState}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.loadingText}>Loading permissions...</Text>
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
            onRefresh={() => void loadPermissions({ refreshing: true })}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <AppHeader title="Permissions" showBackButton />

        <View style={styles.hero}>
          <Text style={styles.heroTitle}>Device access</Text>
          <Text style={styles.heroText}>Only the active app workflows are listed here.</Text>
        </View>

        <View style={styles.panel}>
          <PermissionRow
            busy={busyKey === "notifications"}
            icon="notifications-outline"
            status={permissions.notifications}
            title="Notifications"
            detail="Time reminders and workflow alerts"
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
            detail="Detects transaction messages for Spend"
            onPress={() =>
              void runAction("sms", async () => {
                await requestExpenseSmsPermissions();
              })
            }
          />
          <PermissionRow
            busy={busyKey === "screenshots"}
            icon="images-outline"
            status={permissions.screenshots}
            title="Screenshot inbox"
            detail="Lets you review screenshots before saving them"
            onPress={() => void requestScreenshots()}
          />
          <PermissionRow
            busy={busyKey === "appUsage"}
            icon="bar-chart-outline"
            status={permissions.appUsage}
            title="App usage"
            detail="Optional Android usage access for device insights"
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
            detail="Managed from Vault settings"
            onPress={() => router.push("/vault-settings")}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function PermissionRow({
  busy,
  detail,
  icon,
  onPress,
  status,
  title,
}: {
  busy?: boolean;
  detail: string;
  icon: IconName;
  onPress: () => void;
  status: string;
  title: string;
}) {
  const allowed = isAllowed(status);

  return (
    <Pressable accessibilityRole="button" style={styles.row} onPress={onPress}>
      <View style={[styles.iconBubble, allowed && styles.iconBubbleAllowed]}>
        <Ionicons color={allowed ? colors.success : colors.primary} name={icon} size={19} />
      </View>
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text numberOfLines={2} style={styles.rowDetail}>{detail}</Text>
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

const styles = StyleSheet.create({
  content: {
    paddingBottom: 36,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  hero: {
    backgroundColor: "#111217",
    borderRadius: 18,
    marginBottom: 18,
    padding: 18,
  },
  heroText: {
    color: "rgba(255,255,255,0.68)",
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 21,
    marginTop: 6,
  },
  heroTitle: {
    color: colors.white,
    fontSize: 24,
    fontWeight: "900",
    lineHeight: 29,
  },
  iconBubble: {
    alignItems: "center",
    backgroundColor: colors.accentSurface,
    borderRadius: 12,
    height: 40,
    justifyContent: "center",
    width: 40,
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
  panel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  row: {
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 72,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rowCopy: {
    flex: 1,
    gap: 4,
  },
  rowDetail: {
    color: colors.textSoft,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
  },
  rowTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900",
  },
  screen: {
    backgroundColor: colors.background,
    flex: 1,
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
