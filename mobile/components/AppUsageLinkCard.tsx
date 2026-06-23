import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { colors, subtleShadow } from "../styles/theme";

export function AppUsageLinkCard() {
  return (
    <Pressable style={styles.card} onPress={() => router.push("/app-usage")}>
      <View style={styles.iconWrap}>
        <Ionicons color={colors.workTag} name="phone-portrait-outline" size={20} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.title}>App usage stats</Text>
        <Text style={styles.subtitle}>See Android app time for today, this week, and this month.</Text>
      </View>
      <Ionicons color={colors.textSoft} name="chevron-forward" size={18} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    marginBottom: 18,
    padding: 16,
    ...subtleShadow,
  },
  iconWrap: {
    alignItems: "center",
    backgroundColor: "#EEF5FF",
    borderRadius: 14,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  copy: {
    flex: 1,
  },
  title: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900",
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
    marginTop: 4,
  },
});
