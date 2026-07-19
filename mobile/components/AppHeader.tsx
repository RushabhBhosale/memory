import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors } from "../styles/theme";

type HeaderIconProps = {
  accessibilityLabel?: string;
  name: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
};

type AppHeaderProps = {
  title?: string;
  showBackButton?: boolean;
  rightIcons?: ReactNode;
};

export const HeaderIcon = ({ accessibilityLabel, name, onPress }: HeaderIconProps) => (
  <Pressable accessibilityLabel={accessibilityLabel || name} accessibilityRole="button" hitSlop={8} onPress={onPress} style={styles.headerIcon}>
    <Ionicons color={colors.white} name={name} size={19} />
  </Pressable>
);

export function AppHeader({
  rightIcons,
  showBackButton = false,
  title,
}: AppHeaderProps) {
  const router = useRouter();

  return (
    <View style={styles.header}>
      <View style={styles.leftSlot}>
        {showBackButton ? (
          <Pressable hitSlop={8} onPress={() => router.back()} style={styles.backButton}>
            <Ionicons color={colors.textMuted} name="chevron-back" size={22} />
          </Pressable>
        ) : (
          <Text style={styles.wordmark}>{title}</Text>
        )}
      </View>

      {showBackButton ? (
        <Text pointerEvents="none" style={styles.centerTitle}>
          {title}
        </Text>
      ) : null}

      {rightIcons ? (
        <View style={styles.rightSlot}>{rightIcons}</View>
      ) : (
        <View style={styles.emptyRightSlot} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  backButton: {
    alignItems: "center",
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  centerTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "500",
    left: 0,
    position: "absolute",
    right: 0,
    textAlign: "center",
  },
  emptyRightSlot: {
    width: 36,
  },
  header: {
    alignItems: "center",
    backgroundColor: "transparent",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  headerIcon: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.10)",
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 10,
    borderWidth: 1,
    height: 38,
    justifyContent: "center",
    marginLeft: 7,
    width: 38,
  },
  leftSlot: {
    minWidth: 36,
    zIndex: 1,
  },
  rightSlot: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "flex-end",
    minWidth: 36,
    zIndex: 1,
  },
  wordmark: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "500",
    letterSpacing: 0,
  },
});
