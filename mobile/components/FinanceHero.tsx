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
            <Ionicons color={colors.primary} name={actionIcon} size={22} />
          </Pressable>
        ) : null)}
    </View>
  );
}

const styles = StyleSheet.create({
  action: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.10)",
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 12,
    borderWidth: 1,
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
    minHeight: 158,
    overflow: "hidden",
    paddingBottom: 36,
    paddingHorizontal: 18,
    paddingTop: 20,
  },
  label: {
    color: "rgba(255,255,255,0.66)",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.3,
    lineHeight: 18,
    textTransform: "uppercase",
  },
  orbitLarge: {
    borderColor: "rgba(111,224,171,0.13)",
    borderRadius: 250,
    borderWidth: 1,
    height: 310,
    position: "absolute",
    right: -95,
    top: -205,
    width: 310,
  },
  orbitSmall: {
    borderColor: "rgba(111,224,171,0.10)",
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
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 10,
  },
  value: {
    color: colors.white,
    fontSize: 29,
    fontWeight: "900",
    letterSpacing: -0.7,
    lineHeight: 36,
  },
});
