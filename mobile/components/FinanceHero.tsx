import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors } from "../styles/theme";

type FinanceHeroProps = {
  actionIcon?: keyof typeof Ionicons.glyphMap;
  actionLabel?: string;
  label: string;
  onAction?: () => void;
  title?: string;
  value?: string;
  rightContent?: ReactNode;
};

export function FinanceHero({
  actionIcon,
  actionLabel,
  label,
  onAction,
  rightContent,
  title,
  value,
}: FinanceHeroProps) {
  return (
    <View style={styles.hero}>
      <View pointerEvents="none" style={styles.orbitLarge} />
      <View pointerEvents="none" style={styles.orbitSmall} />
      <View style={styles.copy}>
        {title ? <Text style={styles.title}>{title}</Text> : null}
        <Text style={styles.label}>{label}</Text>
        {value ? <Text style={styles.value}>{value}</Text> : null}
      </View>
      {rightContent ??
        (actionIcon && onAction ? (
          <Pressable accessibilityLabel={actionLabel || label} accessibilityRole="button" onPress={onAction} style={styles.action}>
            <Ionicons color={colors.primaryDark} name={actionIcon} size={24} />
          </Pressable>
        ) : null)}
    </View>
  );
}

const styles = StyleSheet.create({
  action: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderRadius: 10,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  copy: {
    flex: 1,
  },
  hero: {
    alignItems: "center",
    backgroundColor: colors.primaryDark,
    flexDirection: "row",
    minHeight: 142,
    overflow: "hidden",
    paddingBottom: 30,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  label: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 12,
    lineHeight: 18,
  },
  orbitLarge: {
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 250,
    borderWidth: 1,
    height: 310,
    position: "absolute",
    right: -95,
    top: -205,
    width: 310,
  },
  orbitSmall: {
    borderColor: "rgba(255,255,255,0.10)",
    borderRadius: 180,
    borderWidth: 1,
    height: 220,
    position: "absolute",
    right: 15,
    top: -120,
    width: 220,
  },
  title: {
    color: colors.white,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
  },
  value: {
    color: colors.white,
    fontSize: 23,
    fontWeight: "800",
    letterSpacing: -0.4,
    lineHeight: 30,
  },
});
