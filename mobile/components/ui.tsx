import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps, ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { getTransactionCategory } from "../constants/transactionCategories";
import type { ExpenseEntry } from "../services/expenses";
import { colors, radius, type } from "../styles/theme";
import { getDateKey } from "../utils/financeAnalytics";
import { formatCurrency } from "../utils/localization";

export type IconName = ComponentProps<typeof Ionicons>["name"];

/** Bottom padding so content clears the floating tab bar. */
export const TAB_BAR_CLEARANCE = 120;

export function PageHeader({
  right,
  subtitle,
  title,
}: {
  right?: ReactNode;
  subtitle?: string;
  title: string;
}) {
  return (
    <View style={styles.pageHeader}>
      <View style={styles.flex}>
        {subtitle ? <Text style={styles.pageSubtitle}>{subtitle}</Text> : null}
        <Text style={styles.pageTitle}>{title}</Text>
      </View>
      {right ? <View style={styles.row8}>{right}</View> : null}
    </View>
  );
}

export function IconButton({
  accessibilityLabel,
  disabled,
  icon,
  onPress,
  tone = "default",
}: {
  accessibilityLabel: string;
  disabled?: boolean;
  icon: IconName;
  onPress: () => void;
  tone?: "default" | "primary";
}) {
  const isPrimary = tone === "primary";
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      disabled={disabled}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        isPrimary && styles.iconButtonPrimary,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Ionicons color={isPrimary ? colors.white : colors.text} name={icon} size={20} />
    </Pressable>
  );
}

export function Card({ children, padded = true, style }: { children: ReactNode; padded?: boolean; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, padded && styles.cardPadded, style]}>{children}</View>;
}

export function SectionHeader({
  actionLabel,
  onAction,
  title,
}: {
  actionLabel?: string;
  onAction?: () => void;
  title: string;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {actionLabel && onAction ? (
        <Pressable hitSlop={8} onPress={onAction}>
          <Text style={styles.sectionAction}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function IconBadge({
  color,
  icon,
  size = 40,
  surface,
}: {
  color: string;
  icon: IconName;
  size?: number;
  surface: string;
}) {
  return (
    <View style={[styles.iconBadge, { backgroundColor: surface, borderRadius: size * 0.32, height: size, width: size }]}>
      <Ionicons color={color} name={icon} size={size * 0.46} />
    </View>
  );
}

export function Button({
  disabled,
  icon,
  label,
  loading,
  onPress,
  style,
  variant = "primary",
}: {
  disabled?: boolean;
  icon?: IconName;
  label: string;
  loading?: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  variant?: "primary" | "secondary" | "danger";
}) {
  const textColor = variant === "primary" ? colors.white : variant === "danger" ? colors.danger : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === "primary" && styles.buttonPrimary,
        variant === "secondary" && styles.buttonSecondary,
        variant === "danger" && styles.buttonDanger,
        pressed && styles.pressed,
        (disabled || loading) && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <>
          {icon ? <Ionicons color={textColor} name={icon} size={18} /> : null}
          <Text style={[styles.buttonText, { color: textColor }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

export function Segmented<T extends string>({
  onChange,
  options,
  value,
}: {
  onChange: (value: T) => void;
  options: { label: string; value: T }[];
  value: T;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected }}
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[styles.segment, selected && styles.segmentSelected]}
          >
            <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Chip({
  color,
  icon,
  label,
  onPress,
  selected,
}: {
  color?: string;
  icon?: IconName;
  label: string;
  onPress: () => void;
  selected: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      {icon ? <Ionicons color={selected ? colors.white : color || colors.textMuted} name={icon} size={14} /> : null}
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

export function EmptyState({
  actionLabel,
  icon,
  message,
  onAction,
  title,
}: {
  actionLabel?: string;
  icon: IconName;
  message: string;
  onAction?: () => void;
  title: string;
}) {
  return (
    <View style={styles.empty}>
      <IconBadge color={colors.primary} icon={icon} size={52} surface={colors.primarySurface} />
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyText}>{message}</Text>
      {actionLabel && onAction ? (
        <Button icon="add" label={actionLabel} onPress={onAction} style={styles.emptyButton} />
      ) : null}
    </View>
  );
}

export function Banner({
  message,
  onPress,
  tone = "danger",
}: {
  message: string;
  onPress?: () => void;
  tone?: "danger" | "info";
}) {
  const isDanger = tone === "danger";
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      style={[styles.banner, { backgroundColor: isDanger ? colors.dangerSurface : colors.primarySurface }]}
    >
      <Ionicons
        color={isDanger ? colors.danger : colors.primary}
        name={isDanger ? "alert-circle-outline" : "information-circle-outline"}
        size={18}
      />
      <Text style={[styles.bannerText, { color: isDanger ? colors.danger : colors.primary }]}>{message}</Text>
      {onPress ? <Ionicons color={isDanger ? colors.danger : colors.primary} name="refresh" size={16} /> : null}
    </Pressable>
  );
}

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

export function TransactionRow({
  last,
  onPress,
  showTime = true,
  transaction,
}: {
  last?: boolean;
  onPress?: () => void;
  showTime?: boolean;
  transaction: ExpenseEntry;
}) {
  const isIncome = transaction.type === "income";
  const category = getTransactionCategory(transaction.category);
  const meta = showTime
    ? `${category.label} · ${timeFormat.format(new Date(transaction.timestamp))}`
    : category.label;

  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.txRow, !last && styles.txDivider, pressed && styles.txPressed]}
    >
      <IconBadge color={category.color} icon={category.icon} surface={category.surface} />
      <View style={styles.flex}>
        <Text numberOfLines={1} style={styles.txTitle}>{transaction.merchant}</Text>
        <Text numberOfLines={1} style={styles.txMeta}>
          {transaction.note ? `${meta} · ${transaction.note}` : meta}
        </Text>
      </View>
      <Text style={[styles.txAmount, isIncome && styles.txIncome]}>
        {isIncome ? "+" : "−"}
        {formatCurrency(transaction.amount, transaction.currency)}
      </Text>
    </Pressable>
  );
}

const dayHeaderFormat = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", weekday: "short" });

export const getDayLabel = (timestamp: number) => {
  const key = getDateKey(timestamp);
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (key === getDateKey(today)) return "Today";
  if (key === getDateKey(yesterday)) return "Yesterday";
  return dayHeaderFormat.format(new Date(timestamp));
};

export const groupByDay = (transactions: ExpenseEntry[]) => {
  const groups: { items: ExpenseEntry[]; key: string; label: string; net: number }[] = [];
  transactions.forEach((transaction) => {
    const key = getDateKey(transaction.timestamp);
    let group = groups[groups.length - 1];
    if (!group || group.key !== key) {
      group = { items: [], key, label: getDayLabel(transaction.timestamp), net: 0 };
      groups.push(group);
    }
    group.items.push(transaction);
    group.net += transaction.type === "income" ? transaction.amount : -transaction.amount;
  });
  return groups;
};

const styles = StyleSheet.create({
  banner: { alignItems: "center", borderRadius: radius.md, flexDirection: "row", gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
  bannerText: { ...type.label, flex: 1, lineHeight: 18 },
  button: { alignItems: "center", borderRadius: radius.md, flexDirection: "row", gap: 8, justifyContent: "center", minHeight: 52, paddingHorizontal: 20 },
  buttonDanger: { backgroundColor: colors.dangerSurface },
  buttonPrimary: { backgroundColor: colors.primary },
  buttonSecondary: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
  buttonText: { fontSize: 16, fontWeight: "600" },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth },
  cardPadded: { padding: 16 },
  chip: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.pill, borderWidth: 1, flexDirection: "row", gap: 6, height: 36, paddingHorizontal: 14 },
  chipSelected: { backgroundColor: colors.text, borderColor: colors.text },
  chipText: { ...type.label, color: colors.text },
  chipTextSelected: { color: colors.white },
  disabled: { opacity: 0.5 },
  empty: { alignItems: "center", gap: 6, paddingHorizontal: 24, paddingVertical: 32 },
  emptyButton: { alignSelf: "stretch", marginTop: 14 },
  emptyText: { ...type.label, color: colors.textMuted, lineHeight: 19, textAlign: "center" },
  emptyTitle: { ...type.heading, color: colors.text, marginTop: 8 },
  flex: { flex: 1 },
  iconBadge: { alignItems: "center", justifyContent: "center" },
  iconButton: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.pill, borderWidth: 1, height: 42, justifyContent: "center", width: 42 },
  iconButtonPrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
  pageHeader: { alignItems: "flex-end", flexDirection: "row", gap: 12, paddingBottom: 6, paddingTop: 8 },
  pageSubtitle: { ...type.label, color: colors.textMuted, marginBottom: 2 },
  pageTitle: { ...type.title, color: colors.text },
  pressed: { opacity: 0.75 },
  row8: { flexDirection: "row", gap: 8 },
  sectionAction: { ...type.label, color: colors.primary, fontWeight: "600" },
  sectionHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginTop: 10 },
  sectionTitle: { ...type.heading, color: colors.text },
  segment: { alignItems: "center", borderRadius: radius.sm, flex: 1, justifyContent: "center", minHeight: 36 },
  segmentSelected: { backgroundColor: colors.surface, shadowColor: "#0F1426", shadowOffset: { height: 1, width: 0 }, shadowOpacity: 0.08, shadowRadius: 3, elevation: 1 },
  segmentText: { ...type.label, color: colors.textMuted, fontWeight: "600" },
  segmentTextSelected: { color: colors.text },
  segmented: { backgroundColor: colors.surfaceMuted, borderRadius: radius.md, flexDirection: "row", padding: 3 },
  txAmount: { color: colors.text, fontSize: 15, fontVariant: ["tabular-nums"], fontWeight: "600" },
  txDivider: { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
  txIncome: { color: colors.success },
  txMeta: { ...type.caption, color: colors.textMuted, marginTop: 3 },
  txPressed: { backgroundColor: colors.backgroundSoft },
  txRow: { alignItems: "center", flexDirection: "row", gap: 12, minHeight: 66, paddingHorizontal: 16, paddingVertical: 12 },
  txTitle: { color: colors.text, fontSize: 15, fontWeight: "600" },
});
