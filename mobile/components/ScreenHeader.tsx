import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors } from "../styles/theme";

/** Go back, or land on Home when the screen was opened without history (deep link, reload). */
export const goBack = () => {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace("/(tabs)");
  }
};

type ScreenHeaderProps = {
  icon?: "back" | "close";
  title?: string;
};

export function ScreenHeader({ icon = "back", title }: ScreenHeaderProps) {
  return (
    <View style={styles.header}>
      <Pressable
        accessibilityLabel={icon === "close" ? "Close" : "Go back"}
        accessibilityRole="button"
        hitSlop={8}
        onPress={goBack}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      >
        <Ionicons color={colors.text} name={icon === "close" ? "close" : "chevron-back"} size={22} />
      </Pressable>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      <View style={styles.spacer} />
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    minHeight: 56,
  },
  pressed: { opacity: 0.7 },
  spacer: { width: 40 },
  title: {
    color: colors.text,
    flex: 1,
    fontSize: 17,
    fontWeight: "600",
    textAlign: "center",
  },
});
