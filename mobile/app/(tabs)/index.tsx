import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useMemo } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { FinanceHero } from "../../components/FinanceHero";
import { getTransactionCategory } from "../../constants/transactionCategories";
import { useAuth } from "../../context/AuthContext";
import { useExpenseData } from "../../hooks/useExpenseData";
import type { ExpenseEntry } from "../../services/expenses";
import { colors, subtleShadow } from "../../styles/theme";
import { getDateKey, getMonthKey } from "../../utils/financeAnalytics";
import { formatCurrency } from "../../utils/localization";

const formatDate = (timestamp: number) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));

const getSummary = (transactions: ExpenseEntry[]) => {
  const now = new Date();
  const todayKey = getDateKey(now);
  const monthKey = getMonthKey(now);

  const monthIncome = transactions
    .filter(
      (item) => item.type === "income" && getMonthKey(item.timestamp) === monthKey,
    )
    .reduce((total, item) => total + item.amount, 0);
  const monthExpense = transactions
    .filter(
      (item) => item.type === "expense" && getMonthKey(item.timestamp) === monthKey,
    )
    .reduce((total, item) => total + item.amount, 0);
  const todayExpense = transactions
    .filter(
      (item) => item.type === "expense" && getDateKey(item.timestamp) === todayKey,
    )
    .reduce((total, item) => total + item.amount, 0);
  const todayIncome = transactions
    .filter(
      (item) => item.type === "income" && getDateKey(item.timestamp) === todayKey,
    )
    .reduce((total, item) => total + item.amount, 0);

  return {
    monthExpense,
    monthIncome,
    todayExpense,
    todayIncome,
  };
};

export default function HomeScreen() {
  const { session } = useAuth();
  const { error, loading, loadTransactions, refreshing, transactions } = useExpenseData();

  const summary = useMemo(() => getSummary(transactions), [transactions]);
  const balance = summary.monthIncome - summary.monthExpense;
  const spendRatio = summary.monthIncome > 0
    ? Math.min((summary.monthExpense / summary.monthIncome) * 100, 100)
    : 0;
  const today = new Date();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const daysRemaining = Math.max(daysInMonth - today.getDate() + 1, 1);
  const safeToSpend = Math.max(balance, 0) / daysRemaining;
  const recentTransactions = transactions.slice(0, 6);

  if (loading && !transactions.length) {
    return (
      <SafeAreaView edges={["top"]} style={styles.screen}>
        <View style={styles.centerState}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.mutedText}>Syncing transactions…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            colors={[colors.primary]}
            onRefresh={() => void loadTransactions({ refreshing: true })}
            refreshing={refreshing}
            tintColor={colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
        style={styles.scroll}
      >
        <FinanceHero
          actionIcon="settings-outline"
          actionLabel="Open settings"
          label="Available this month"
          onAction={() => router.push("/settings")}
          title={`Hi, ${session?.user.username || "there"}`}
          value={formatCurrency(balance)}
        />

        <View style={styles.body}>

        {error ? (
          <Pressable style={styles.errorPanel} onPress={() => void loadTransactions()}>
            <Text style={styles.errorText}>{error}</Text>
            <Text style={styles.errorAction}>Tap to retry</Text>
          </Pressable>
        ) : null}

        <View style={styles.cashflowCard}>
          <View style={styles.safeSpendHeader}>
            <View style={styles.safeSpendIcon}>
              <Ionicons color={colors.primary} name="speedometer-outline" size={20} />
            </View>
            <View style={styles.safeSpendCopy}>
              <Text style={styles.cashflowTitle}>Safe to spend today</Text>
              <Text style={styles.cashflowDetail}>Based on this month’s remaining balance</Text>
            </View>
            <View style={styles.daysBadge}>
              <Text style={styles.daysBadgeText}>{daysRemaining} days</Text>
            </View>
          </View>
          <Text style={styles.safeSpendValue}>{formatCurrency(safeToSpend)}</Text>
          <View style={styles.sectionHeader}>
            <Text style={styles.cashflowDetail}>Monthly spending</Text>
            <Text style={styles.cashflowPercent}>{spendRatio.toFixed(0)}%</Text>
          </View>
          <View style={styles.cashflowTrack}>
            <View style={[styles.cashflowFill, { width: `${spendRatio}%` as `${number}%` }]} />
          </View>
          <Text style={styles.cashflowFooter}>
            {formatCurrency(summary.monthExpense)} of {formatCurrency(summary.monthIncome)} income
          </Text>
        </View>

        <View style={styles.summaryGrid}>
          <SummaryCard
            icon="arrow-down-outline"
            label="Income"
            value={formatCurrency(summary.monthIncome)}
            tone="income"
          />
          <SummaryCard
            icon="arrow-up-outline"
            label="Expenses"
            value={formatCurrency(summary.monthExpense)}
            tone="expense"
          />
        </View>

        <Pressable
          accessibilityLabel="Open spending insights"
          accessibilityRole="button"
          style={styles.insightsBanner}
          onPress={() => router.push("/(tabs)/analytics" as never)}
        >
          <View style={styles.insightsIcon}>
            <Ionicons color={colors.white} name="stats-chart" size={20} />
          </View>
          <View style={styles.portfolioCopy}>
            <Text style={styles.insightsTitle}>Explore spending insights</Text>
            <Text style={styles.insightsText}>Calendar, cash flow, and category trends</Text>
          </View>
          <Ionicons color={colors.textSoft} name="chevron-forward" size={18} />
        </Pressable>

        <Pressable
          accessibilityLabel="Open investment portfolio"
          accessibilityRole="button"
          style={styles.portfolioBanner}
          onPress={() => router.push("/(tabs)/investments")}
        >
          <View style={styles.portfolioIcon}>
            <Ionicons color={colors.primary} name="pie-chart-outline" size={21} />
          </View>
          <View style={styles.portfolioCopy}>
            <Text style={styles.portfolioTitle}>Your investment portfolio</Text>
            <Text style={styles.portfolioText}>Track holdings, allocation, and returns</Text>
          </View>
          <Ionicons color={colors.accent} name="chevron-forward" size={18} />
        </Pressable>

        <View style={styles.todayPanel}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Today</Text>
            <Text style={styles.sectionCaption}>
              {formatCurrency(summary.todayIncome - summary.todayExpense)} net
            </Text>
          </View>
          <View style={styles.todayRow}>
            <TodayMetric label="Received" value={formatCurrency(summary.todayIncome)} tone="income" />
            <TodayMetric label="Spent" value={formatCurrency(summary.todayExpense)} tone="expense" />
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent transactions</Text>
          <Pressable onPress={() => router.push("/(tabs)/expenses")}>
            <Text style={styles.linkText}>View all</Text>
          </Pressable>
        </View>

        {recentTransactions.length ? (
          <View style={styles.transactionPanel}>
            {recentTransactions.map((transaction) => (
              <TransactionRow key={transaction.id} transaction={transaction} />
            ))}
          </View>
        ) : (
          <View style={styles.emptyPanel}>
            <Ionicons color={colors.textSoft} name="receipt-outline" size={28} />
            <Text style={styles.emptyTitle}>No transactions yet</Text>
            <Text style={styles.mutedText}>Add income or expenses to start your ledger.</Text>
            <Pressable style={styles.primaryButton} onPress={() => router.push("/expense-add")}>
              <Text style={styles.primaryButtonText}>Add transaction</Text>
              <Ionicons color={colors.white} name="arrow-forward" size={17} />
            </Pressable>
          </View>
        )}

        {Platform.OS === "android" ? (
          <Pressable style={styles.smsBanner} onPress={() => router.push("/settings")}>
            <View style={styles.smsIcon}>
              <Ionicons color={colors.primary} name="chatbubble-ellipses-outline" size={20} />
            </View>
            <View style={styles.smsCopy}>
              <Text style={styles.smsTitle}>Import transaction SMS</Text>
              <Text style={styles.smsDetail}>Review bank alerts before they enter your ledger.</Text>
            </View>
            <Ionicons color={colors.textSoft} name="chevron-forward" size={18} />
          </Pressable>
        ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SummaryCard({
  icon,
  label,
  tone,
  value,
}: {
  icon: IconName;
  label: string;
  tone: "expense" | "income";
  value: string;
}) {
  return (
    <View style={styles.summaryCard}>
      <View style={[styles.metricIcon, tone === "income" ? styles.incomeSurface : styles.expenseSurface]}>
        <Ionicons color={tone === "income" ? colors.success : colors.primary} name={icon} size={18} />
      </View>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function TodayMetric({ label, tone, value }: { label: string; tone: "expense" | "income"; value: string }) {
  return (
    <View style={styles.todayMetric}>
      <Text style={styles.todayLabel}>{label}</Text>
      <Text style={[styles.todayValue, tone === "income" ? styles.incomeAmount : styles.expenseAmount]}>
        {value}
      </Text>
    </View>
  );
}

function TransactionRow({ transaction }: { transaction: ExpenseEntry }) {
  const isIncome = transaction.type === "income";
  const category = getTransactionCategory(transaction.category);

  return (
    <View style={styles.transactionRow}>
      <View style={[styles.transactionIcon, { backgroundColor: isIncome ? colors.successSurface : category.surface }]}>
        <Ionicons
          color={isIncome ? colors.success : category.color}
          name={isIncome ? "arrow-down-outline" : category.icon}
          size={18}
        />
      </View>
      <View style={styles.transactionCopy}>
        <Text numberOfLines={1} style={styles.transactionTitle}>
          {transaction.merchant}
        </Text>
        <Text numberOfLines={1} style={styles.transactionMeta}>
          {category.label} • {formatDate(transaction.timestamp)}
        </Text>
      </View>
      <Text style={isIncome ? styles.incomeAmount : styles.expenseAmount}>
        {isIncome ? "+" : "−"}
        {formatCurrency(transaction.amount, transaction.currency)}
      </Text>
    </View>
  );
}

type IconName = keyof typeof Ionicons.glyphMap;

const styles = StyleSheet.create({
  body: { gap: 14, marginTop: -24, paddingBottom: 126, paddingHorizontal: 14 },
  cashflowCard: { ...subtleShadow, backgroundColor: colors.surface, borderRadius: 16, padding: 16 },
  cashflowDetail: { color: colors.textMuted, fontSize: 11, marginTop: 8 },
  cashflowFill: { backgroundColor: colors.primary, borderRadius: 4, height: 6 },
  cashflowFooter: { color: colors.textMuted, fontSize: 10, marginTop: 8 },
  cashflowPercent: { color: colors.primary, fontSize: 11, fontWeight: "800" },
  cashflowTitle: { color: colors.text, fontSize: 14, fontWeight: "800" },
  cashflowTrack: { backgroundColor: colors.surfaceMuted, borderRadius: 4, height: 6, marginTop: 8, overflow: "hidden" },
  content: {
    backgroundColor: colors.background,
  },
  centerState: {
    alignItems: "center",
    flex: 1,
    gap: 10,
    justifyContent: "center",
  },
  emptyPanel: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 10,
    gap: 8,
    padding: 24,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900",
  },
  errorAction: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "900",
    marginTop: 6,
  },
  errorPanel: {
    backgroundColor: colors.dangerSurface,
    borderColor: "#FECACA",
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: "800",
  },
  expenseAmount: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: "900",
  },
  expenseSurface: {
    backgroundColor: colors.accentSurface,
  },
  daysBadge: { backgroundColor: colors.primarySurface, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 6 },
  daysBadgeText: { color: colors.primary, fontSize: 10, fontWeight: "800" },
  incomeAmount: {
    color: colors.success,
    fontSize: 14,
    fontWeight: "900",
  },
  incomeSurface: {
    backgroundColor: colors.successSurface,
  },
  insightsBanner: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 14, borderWidth: 1, flexDirection: "row", gap: 11, padding: 13 },
  insightsIcon: { alignItems: "center", backgroundColor: colors.primaryDark, borderRadius: 10, height: 42, justifyContent: "center", width: 42 },
  insightsText: { color: colors.textMuted, fontSize: 11, marginTop: 3 },
  insightsTitle: { color: colors.text, fontSize: 14, fontWeight: "800" },
  linkText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "900",
  },
  metricIcon: {
    alignItems: "center",
    borderRadius: 12,
    height: 36,
    justifyContent: "center",
    marginBottom: 12,
    width: 36,
  },
  metricLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "800",
  },
  metricValue: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900",
    marginTop: 4,
  },
  mutedText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },
  portfolioBanner: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 14, borderWidth: 1, flexDirection: "row", gap: 11, padding: 13 },
  portfolioCopy: { flex: 1 },
  portfolioIcon: { alignItems: "center", backgroundColor: colors.primarySurface, borderRadius: 9, height: 42, justifyContent: "center", width: 42 },
  portfolioText: { color: colors.textMuted, fontSize: 11, marginTop: 3 },
  portfolioTitle: { color: colors.text, fontSize: 14, fontWeight: "800" },
  primaryButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 999,
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
    minHeight: 46,
    paddingHorizontal: 17,
  },
  primaryButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: "900",
  },
  safeSpendCopy: { flex: 1 },
  safeSpendHeader: { alignItems: "center", flexDirection: "row", gap: 10 },
  safeSpendIcon: { alignItems: "center", backgroundColor: colors.primarySurface, borderRadius: 10, height: 40, justifyContent: "center", width: 40 },
  safeSpendValue: { color: colors.text, fontSize: 30, fontWeight: "900", letterSpacing: -0.7, marginBottom: 18, marginTop: 16 },
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  scroll: { backgroundColor: colors.background },
  safeArea: { backgroundColor: colors.primaryDark, flex: 1 },
  sectionCaption: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "800",
  },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900",
  },
  smsBanner: {
    alignItems: "center",
    backgroundColor: colors.accentSurface,
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 14,
  },
  smsCopy: {
    flex: 1,
  },
  smsDetail: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 17,
    marginTop: 3,
  },
  smsIcon: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderRadius: 12,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  smsTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "900",
  },
  summaryCard: {
    ...subtleShadow,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    padding: 15,
  },
  summaryGrid: {
    flexDirection: "row",
    gap: 12,
  },
  todayLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "800",
  },
  todayMetric: {
    flex: 1,
    gap: 5,
  },
  todayPanel: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 14,
    padding: 16,
  },
  todayRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 15,
  },
  todayValue: {
    fontSize: 16,
  },
  transactionCopy: {
    flex: 1,
  },
  transactionIcon: {
    alignItems: "center",
    borderRadius: 12,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  transactionMeta: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "600",
    marginTop: 4,
  },
  transactionPanel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 14,
    overflow: "hidden",
  },
  transactionRow: {
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 11,
    minHeight: 72,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  transactionTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "900",
  },
});
