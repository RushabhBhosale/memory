import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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

import { AppHeader, HeaderIcon } from "../../components/AppHeader";
import {
  listLocalExpenses,
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
        const nextTransactions = await listLocalExpenses();
        setTransactions(nextTransactions);
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
    <SafeAreaView edges={["top"]} style={styles.screen}>
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
      >
        <AppHeader
          title="Money"
          rightIcons={
            <HeaderIcon
              name="settings-outline"
              onPress={() => router.push("/settings")}
            />
          }
        />

        {error ? (
          <Pressable style={styles.errorPanel} onPress={() => void loadTransactions()}>
            <Text style={styles.errorText}>{error}</Text>
            <Text style={styles.errorAction}>Tap to retry</Text>
          </Pressable>
        ) : null}

        <View style={styles.balanceCard}>
          <View style={styles.balanceHeader}>
            <View>
              <Text style={styles.eyebrow}>This month</Text>
              <Text style={styles.balanceLabel}>Net balance</Text>
            </View>
            <View style={styles.balanceIcon}>
              <Ionicons color={colors.white} name="wallet-outline" size={23} />
            </View>
          </View>
          <Text style={[styles.balanceValue, balance < 0 && styles.negativeValue]}>
            {formatCurrency(balance)}
          </Text>
          <Text style={styles.balanceDetail}>
            {transactions.length
              ? `${transactions.length} saved transaction${transactions.length === 1 ? "" : "s"}`
              : "Your saved income and expenses will appear here."}
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

  return (
    <View style={styles.transactionRow}>
      <View style={[styles.transactionIcon, isIncome ? styles.incomeSurface : styles.expenseSurface]}>
        <Ionicons
          color={isIncome ? colors.success : colors.primary}
          name={isIncome ? "arrow-down-outline" : "arrow-up-outline"}
          size={18}
        />
      </View>
      <View style={styles.transactionCopy}>
        <Text numberOfLines={1} style={styles.transactionTitle}>
          {transaction.merchant}
        </Text>
        <Text numberOfLines={1} style={styles.transactionMeta}>
          {transaction.category} • {formatDate(transaction.timestamp)}
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
  balanceCard: {
    ...subtleShadow,
    backgroundColor: colors.black,
    borderRadius: 24,
    marginBottom: 14,
    padding: 22,
  },
  balanceDetail: {
    color: "rgba(255,255,255,0.68)",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 8,
  },
  balanceHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  balanceIcon: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 14,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  balanceLabel: {
    color: colors.white,
    fontSize: 16,
    fontWeight: "800",
    marginTop: 3,
  },
  balanceValue: {
    color: colors.white,
    fontSize: 38,
    fontWeight: "900",
    letterSpacing: -1,
    marginTop: 22,
  },
  content: {
    gap: 16,
    paddingBottom: 122,
    paddingHorizontal: 16,
    paddingTop: 10,
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
    borderRadius: 20,
    borderWidth: 1,
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
  eyebrow: {
    color: "rgba(255,255,255,0.62)",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase",
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
  negativeValue: {
    color: "#FDBA74",
  },
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
    borderRadius: 18,
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
    borderRadius: 18,
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
    borderRadius: 18,
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
    borderRadius: 20,
    borderWidth: 1,
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
