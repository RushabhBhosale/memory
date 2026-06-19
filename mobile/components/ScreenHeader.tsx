import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors } from "../styles/theme";

type ScreenHeaderProps = {
  title?: string;
  eyebrow?: string;
  mode?: "identity" | "back";
};

export function ScreenHeader({
  title,
  eyebrow = "Second Brain",
  mode = "identity",
}: ScreenHeaderProps) {
  if (mode === "back") {
    return (
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Ionicons color={colors.text} name="arrow-back" size={22} />
        </Pressable>
        {title ? <Text style={styles.backTitle}>{title}</Text> : null}
        <View style={styles.backSpacer} />
      </View>
    );
  }

  return (
    <View style={styles.header}>
      <View style={styles.identityRow}>
        <View style={styles.brandMark} />
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        {title ? <Text style={styles.title}>{title}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: "center",
    flexDirection: "row",
    marginBottom: 20,
    minHeight: 68,
  },
  identityRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  backButton: {
    alignItems: "center",
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  backTitle: {
    color: colors.text,
    flex: 1,
    fontSize: 19,
    fontWeight: "700",
    lineHeight: 24,
    textAlign: "center",
  },
  backSpacer: {
    width: 40,
  },
  brandMark: {
    backgroundColor: colors.black,
    borderRadius: 999,
    height: 12,
    width: 12,
  },
  eyebrow: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0,
    lineHeight: 18,
  },
  title: {
    color: colors.text,
    fontSize: 31,
    fontWeight: "500",
    lineHeight: 37,
  },
});
