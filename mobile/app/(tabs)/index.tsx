import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  AppState,
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
import {
  fetchAllRemoteExpenses,
  listLocalExpenses,
  mergeExpenseEntries,
  subscribeToExpenseChanges,
  type ExpenseEntry,
} from "../../services/expenses";
import { colors, subtleShadow } from "../../styles/theme";
import { formatCurrency } from "../../utils/localization";
const getDateKey = (value: number | Date) => {
  const date = value instanceof Date ? value : new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
};

const getMonthKey = (value: number | Date) => {
  const date = value instanceof Date ? value : new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};

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
  const [transactions, setTransactions] = useState<ExpenseEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadTransactions = useCallback(
    async (options?: { refreshing?: boolean; silent?: boolean }) => {
      if (options?.refreshing) {
        setRefreshing(true);
      } else if (!options?.silent) {
        setLoading(true);
      }

      try {
        setError("");
        const local = await listLocalExpenses();
        setTransactions(local);

        try {
          const remote = await fetchAllRemoteExpenses(100);
          setTransactions(mergeExpenseEntries(local, remote.data));
        } catch (err) {
          setError(
            err instanceof Error
              ? `${err.message}. Showing transactions saved on this device.`
              : "Unable to load cloud transactions. Showing transactions saved on this device.",
          );
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load transactions");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [],
  );

  useFocusEffect(
    useCallback(() => {
      void loadTransactions();
    }, [loadTransactions]),
  );

  useEffect(() => {
    const expenseSubscription = subscribeToExpenseChanges(() => {
      void loadTransactions({ silent: true });
    });
    const appStateSubscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void loadTransactions({ silent: true });
      }
    });

    return () => {
      expenseSubscription.remove();
      appStateSubscription.remove();
    };
  }, [loadTransactions]);

  const summary = useMemo(() => getSummary(transactions), [transactions]);
  const balance = summary.monthIncome - summary.monthExpense;
  const spendRatio = summary.monthIncome > 0
    ? Math.min((summary.monthExpense / summary.monthIncome) * 100, 100)
    : 0;
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
          label="This month balance"
          onAction={() => router.push("/settings")}
          title="Money"
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
          <View style={styles.sectionHeader}>
            <Text style={styles.cashflowTitle}>Monthly cash flow</Text>
            <Text style={styles.cashflowPercent}>{spendRatio.toFixed(0)}% spent</Text>
          </View>
          <View style={styles.cashflowTrack}>
            <View style={[styles.cashflowFill, { width: `${spendRatio}%` as `${number}%` }]} />
          </View>
          <Text style={styles.cashflowDetail}>
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

        <Pressable style={styles.portfolioBanner} onPress={() => router.push("/(tabs)/investments")}>
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
  body: { gap: 16, marginTop: -24, paddingBottom: 122, paddingHorizontal: 16 },
  cashflowCard: { ...subtleShadow, backgroundColor: colors.surface, borderRadius: 10, padding: 14 },
  cashflowDetail: { color: colors.textMuted, fontSize: 11, marginTop: 8 },
  cashflowFill: { backgroundColor: colors.primary, borderRadius: 3, height: 4 },
  cashflowPercent: { color: colors.textMuted, fontSize: 11 },
  cashflowTitle: { color: colors.text, fontSize: 16, fontWeight: "700" },
  cashflowTrack: { backgroundColor: colors.background, borderRadius: 3, height: 4, marginTop: 13, overflow: "hidden" },
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
    backgroundColor: "#E7F5F2",
  },
  incomeAmount: {
    color: colors.success,
    fontSize: 14,
    fontWeight: "900",
  },
  incomeSurface: {
    backgroundColor: colors.successSurface,
  },
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
  portfolioBanner: { alignItems: "center", backgroundColor: colors.surface, borderRadius: 10, flexDirection: "row", gap: 11, padding: 13 },
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
    borderColor: "#FED7AA",
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
    borderRadius: 10,
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
    borderRadius: 10,
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
    borderRadius: 10,
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
