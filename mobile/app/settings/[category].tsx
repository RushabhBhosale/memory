import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppHeader } from "../../components/AppHeader";
import { syncChatGptDailyBrief } from "../../services/api";
import { colors } from "../../styles/theme";

type IconName = keyof typeof Ionicons.glyphMap;

type SettingAction = {
  detail: string;
  icon: IconName;
  key: string;
  route?: string;
  systemAction?: "phone-settings" | "sync-daily-brief";
  title: string;
};

type CategoryConfig = {
  description: string;
  title: string;
  actions: SettingAction[];
};

const categoryConfig: Record<string, CategoryConfig> = {
  "backup-sync": {
    title: "Backup & Sync",
    description: "Imports, exports, and account sync status.",
    actions: [
      {
        detail: "Pull the latest daily brief into Memory.",
        icon: "cloud-download-outline",
        key: "daily-brief-sync",
        systemAction: "sync-daily-brief",
        title: "Sync ChatGPT daily brief",
      },
      {
        detail: "Saved daily recaps and imported briefs.",
        icon: "calendar-clear-outline",
        key: "daily-summaries",
        route: "/daily-summaries",
        title: "Daily summaries",
      },
    ],
  },
  about: {
    title: "About",
    description: "Version, support, and legal information.",
    actions: [
      {
        detail: "Memory mobile app",
        icon: "phone-portrait-outline",
        key: "app-info",
        title: "App",
      },
      {
        detail: "Privacy policy and data handling.",
        icon: "document-text-outline",
        key: "privacy-policy",
        title: "Privacy policy",
      },
    ],
  },
  ai: {
    title: "AI",
    description: "Assistant behavior, search scope, and brief imports.",
    actions: [
      {
        detail: "Search across memories, tasks, expenses, and summaries.",
        icon: "sparkles-outline",
        key: "ask-memory",
        route: "/(tabs)/search",
        title: "Ask Memory",
      },
      {
        detail: "Review imported ChatGPT daily briefs.",
        icon: "calendar-clear-outline",
        key: "briefs",
        route: "/daily-summaries",
        title: "Daily brief history",
      },
    ],
  },
  appearance: {
    title: "Appearance",
    description: "Theme, density, and display preferences.",
    actions: [
      {
        detail: "Light interface optimized for readability.",
        icon: "sunny-outline",
        key: "theme",
        title: "Theme",
      },
      {
        detail: "Comfortable spacing and large touch targets.",
        icon: "resize-outline",
        key: "density",
        title: "Layout density",
      },
    ],
  },
  notifications: {
    title: "Notifications",
    description: "Reminder delivery and quiet behavior.",
    actions: [
      {
        detail: "Manage notification permission in phone settings.",
        icon: "notifications-outline",
        key: "phone-notifications",
        systemAction: "phone-settings",
        title: "Notification access",
      },
      {
        detail: "Create a reminder with native date and time controls.",
        icon: "alarm-outline",
        key: "new-reminder",
        route: "/add?mode=reminder",
        title: "Reminder defaults",
      },
    ],
  },
  privacy: {
    title: "Privacy",
    description: "Vault security and sensitive memory controls.",
    actions: [
      {
        detail: "Biometric lock and PIN settings.",
        icon: "key-outline",
        key: "vault-security",
        route: "/vault-settings",
        title: "Vault security",
      },
      {
        detail: "Private credentials and sensitive saved items.",
        icon: "lock-closed-outline",
        key: "vault",
        route: "/(tabs)/vault",
        title: "Open Vault",
      },
    ],
  },
  profile: {
    title: "Profile",
    description: "Name, personal context, and account basics.",
    actions: [
      {
        detail: "Local app profile for personalization.",
        icon: "person-outline",
        key: "profile-details",
        title: "Personal context",
      },
      {
        detail: "Connected Memory API endpoint and account context.",
        icon: "server-outline",
        key: "api-connection",
        title: "Connection",
      },
    ],
  },
};

const fallbackConfig: CategoryConfig = {
  title: "Settings",
  description: "Preference category.",
  actions: [],
};

const getParamValue = (value?: string | string[]) =>
  Array.isArray(value) ? value[0] : value;

export default function SettingsCategoryScreen() {
  const params = useLocalSearchParams<{ category?: string }>();
  const [busyKey, setBusyKey] = useState("");
  const category = getParamValue(params.category) || "";
  const config = useMemo(
    () => categoryConfig[category] || fallbackConfig,
    [category],
  );

  const runSystemAction = async (item: SettingAction) => {
    try {
      setBusyKey(item.key);

      if (item.systemAction === "phone-settings") {
        await Linking.openSettings();
      }

      if (item.systemAction === "sync-daily-brief") {
        const result = await syncChatGptDailyBrief();

        Alert.alert(
          "Daily brief synced",
          `${result.message || "Sync complete"} for ${result.date}.`,
          [
            { text: "View", onPress: () => router.push("/daily-summaries") },
            { text: "OK" },
          ],
        );
      }
    } catch (err) {
      Alert.alert("Setting unavailable", err instanceof Error ? err.message : "Try again.");
    } finally {
      setBusyKey("");
    }
  };

  const handleAction = (item: SettingAction) => {
    if (item.systemAction) {
      void runSystemAction(item);
      return;
    }

    if (item.route) {
      router.push(item.route as never);
      return;
    }

    Alert.alert(item.title, item.detail);
  };

  return (
    <SafeAreaView edges={["top"]} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <AppHeader title={config.title} showBackButton />

        <View style={styles.intro}>
          <Text style={styles.title}>{config.title}</Text>
          <Text style={styles.subtitle}>{config.description}</Text>
        </View>

        <View style={styles.panel}>
          {config.actions.map((item) => (
            <Pressable
              key={item.key}
              accessibilityRole="button"
              style={styles.row}
              onPress={() => handleAction(item)}
            >
              <View style={styles.iconBubble}>
                <Ionicons color={colors.primary} name={item.icon} size={20} />
              </View>
              <View style={styles.rowCopy}>
                <Text style={styles.rowTitle}>{item.title}</Text>
                <Text numberOfLines={2} style={styles.rowDetail}>
                  {item.detail}
                </Text>
              </View>
              {busyKey === item.key ? (
                <ActivityIndicator color={colors.primary} size="small" />
              ) : (
                <Ionicons color={colors.textSoft} name="chevron-forward" size={18} />
              )}
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: 36,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  iconBubble: {
    alignItems: "center",
    backgroundColor: colors.backgroundSoft,
    borderRadius: 14,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  intro: {
    marginBottom: 18,
  },
  panel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden",
  },
  row: {
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 76,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rowCopy: {
    flex: 1,
  },
  rowDetail: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
    marginTop: 3,
  },
  rowTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900",
  },
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 22,
    marginTop: 6,
  },
  title: {
    color: colors.text,
    fontSize: 31,
    fontWeight: "900",
    lineHeight: 37,
  },
});
