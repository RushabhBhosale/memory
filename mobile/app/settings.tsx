import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppHeader } from "../components/AppHeader";
import { colors } from "../styles/theme";

type IconName = keyof typeof Ionicons.glyphMap;

type SettingCategory = {
  detail: string;
  icon: IconName;
  id: string;
  route?: string;
  title: string;
};

const categories: SettingCategory[] = [
  {
    detail: "Name, personal context, and account basics.",
    icon: "person-circle-outline",
    id: "profile",
    title: "Profile",
  },
  {
    detail: "Theme, density, and display preferences.",
    icon: "color-palette-outline",
    id: "appearance",
    title: "Appearance",
  },
  {
    detail: "Reminder delivery and quiet behavior.",
    icon: "notifications-outline",
    id: "notifications",
    title: "Notifications",
  },
  {
    detail: "Device access for SMS, screenshots, location, and notifications.",
    icon: "shield-checkmark-outline",
    id: "permissions",
    route: "/settings/permissions",
    title: "Permissions",
  },
  {
    detail: "Vault security and sensitive memory controls.",
    icon: "lock-closed-outline",
    id: "privacy",
    title: "Privacy",
  },
  {
    detail: "Assistant behavior, search scope, and brief imports.",
    icon: "sparkles-outline",
    id: "ai",
    title: "AI",
  },
  {
    detail: "Android wake word, speech replies, and listening controls.",
    icon: "mic-circle-outline",
    id: "jarvis-assistant",
    route: "/settings/jarvis-assistant",
    title: "Jarvis Assistant",
  },
  {
    detail: "Sync status, imports, exports, and backup choices.",
    icon: "cloud-outline",
    id: "backup-sync",
    title: "Backup & Sync",
  },
  {
    detail: "Version, support, and legal information.",
    icon: "information-circle-outline",
    id: "about",
    title: "About",
  },
];

export default function SettingsScreen() {
  return (
    <SafeAreaView edges={["top"]} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <AppHeader title="Settings" showBackButton />

        <View style={styles.intro}>
          <Text style={styles.title}>Preferences</Text>
          <Text style={styles.subtitle}>Account, permissions, privacy, and app behavior.</Text>
        </View>

        <View style={styles.panel}>
          {categories.map((item) => (
            <CategoryRow key={item.id} item={item} />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function CategoryRow({ item }: { item: SettingCategory }) {
  const route = item.route || `/settings/${item.id}`;

  return (
    <Pressable
      accessibilityRole="button"
      style={styles.row}
      onPress={() => router.push(route as never)}
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
      <Ionicons color={colors.textSoft} name="chevron-forward" size={18} />
    </Pressable>
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
