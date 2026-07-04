import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppHeader } from "../../components/AppHeader";
import { colors } from "../../styles/theme";

type MoreDestination = {
  detail: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
  title: string;
};

const primaryDestinations: MoreDestination[] = [
  {
    detail: "Transactions, approvals, and monthly spend.",
    icon: "wallet-outline",
    route: "/(tabs)/expenses",
    title: "Expenses",
  },
  {
    detail: "Private credentials and sensitive saved items.",
    icon: "key-outline",
    route: "/(tabs)/vault",
    title: "Vault",
  },
  {
    detail: "Preferences, permissions, privacy, and sync.",
    icon: "settings-outline",
    route: "/settings",
    title: "Settings",
  },
];

const supportingDestinations: MoreDestination[] = [
  {
    detail: "Review screenshots before saving.",
    icon: "images-outline",
    route: "/screenshots",
    title: "Screenshots",
  },
  {
    detail: "Daily recaps and imported briefs.",
    icon: "calendar-clear-outline",
    route: "/daily-summaries",
    title: "Daily Summaries",
  },
  {
    detail: "Phone and desktop usage context.",
    icon: "analytics-outline",
    route: "/app-usage",
    title: "App Usage",
  },
];

export default function MoreScreen() {
  return (
    <SafeAreaView edges={["top"]} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <AppHeader title="More" />

        <View style={styles.intro}>
          <Text style={styles.title}>Everything else, one tap away.</Text>
          <Text style={styles.subtitle}>Expenses, vault, settings, and supporting tools stay close without crowding the main tabs.</Text>
        </View>

        <View style={styles.primaryGrid}>
          {primaryDestinations.map((item) => (
            <Pressable
              key={item.title}
              accessibilityRole="button"
              style={styles.primaryTile}
              onPress={() => router.push(item.route as never)}
            >
              <View style={styles.primaryIcon}>
                <Ionicons color={colors.white} name={item.icon} size={23} />
              </View>
              <Text style={styles.primaryTitle}>{item.title}</Text>
              <Text numberOfLines={2} style={styles.primaryDetail}>
                {item.detail}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Supporting tools</Text>
        <View style={styles.list}>
          {supportingDestinations.map((item) => (
            <DestinationRow key={item.title} item={item} />
          ))}
        </View>

        <View style={styles.footerSpace} />
      </ScrollView>
    </SafeAreaView>
  );
}

function DestinationRow({ item }: { item: MoreDestination }) {
  return (
    <Pressable
      accessibilityRole="button"
      style={styles.row}
      onPress={() => router.push(item.route as never)}
    >
      <View style={styles.rowIcon}>
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
    paddingBottom: 118,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  footerSpace: {
    height: 8,
  },
  intro: {
    marginBottom: 18,
  },
  list: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden",
  },
  primaryDetail: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
    marginTop: 8,
  },
  primaryGrid: {
    gap: 10,
    marginBottom: 24,
  },
  primaryIcon: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 999,
    height: 46,
    justifyContent: "center",
    width: 46,
  },
  primaryTile: {
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
    borderRadius: 18,
    borderWidth: 1,
    minHeight: 128,
    padding: 16,
  },
  primaryTitle: {
    color: colors.text,
    fontSize: 19,
    fontWeight: "900",
    marginTop: 14,
  },
  row: {
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 74,
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
  rowIcon: {
    alignItems: "center",
    backgroundColor: colors.backgroundSoft,
    borderRadius: 14,
    height: 44,
    justifyContent: "center",
    width: 44,
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
  sectionTitle: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0,
    marginBottom: 10,
    textTransform: "uppercase",
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
