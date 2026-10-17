import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useMemo } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  Banner,
  Card,
  EmptyState,
  IconButton,
  PageHeader,
  SectionHeader,
  TAB_BAR_CLEARANCE,
  TransactionRow,
} from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { useExpenseData } from "../../hooks/useExpenseData";
import type { ExpenseEntry } from "../../services/expenses";
import { colors, radius, type } from "../../styles/theme";
import { getDateKey, getMonthKey } from "../../utils/financeAnalytics";
import { formatCurrency } from "../../utils/localization";

const getSummary = (transactions: ExpenseEntry[]) => {
  const now = new Date();
  const todayKey = getDateKey(now);
  const monthKey = getMonthKey(now);
  let monthIncome = 0;
  let monthExpense = 0;
  let todayExpense = 0;

  transactions.forEach((item) => {
    if (getMonthKey(item.timestamp) !== monthKey) return;
    if (item.type === "income") {
      monthIncome += item.amount;
    } else {
      monthExpense += item.amount;
      if (getDateKey(item.timestamp) === todayKey) todayExpense += item.amount;
    }
  });

  return { monthExpense, monthIncome, todayExpense };
};

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
};

export default function HomeScreen() {
  const { session } = useAuth();
  const { error, loading, loadTransactions, refreshing, transactions } = useExpenseData();

  const summary = useMemo(() => getSummary(transactions), [transactions]);
  const balance = summary.monthIncome - summary.monthExpense;
  const spendRatio = summary.monthIncome > 0
    ? Math.min(summary.monthExpense / summary.monthIncome, 1)
    : summary.monthExpense > 0 ? 1 : 0;
  const today = new Date();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const daysRemaining = Math.max(daysInMonth - today.getDate() + 1, 1);
  const safeToSpend = Math.max(balance, 0) / daysRemaining;
  const recentTransactions = transactions.slice(0, 5);
  const monthName = new Intl.DateTimeFormat(undefined, { month: "long" }).format(today);

  if (loading && !transactions.length) {
    return (
      <SafeAreaView edges={["top"]} style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top"]} style={styles.screen}>
      <StatusBar style="dark" />
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
        <PageHeader
          right={<IconButton accessibilityLabel="Open settings" icon="person-outline" onPress={() => router.push("/settings")} />}
          subtitle={getGreeting()}
          title={session?.user.username || "Welcome"}
        />

        {error ? <Banner message={error} onPress={() => void loadTransactions()} /> : null}

        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>{monthName} balance</Text>
          <Text adjustsFontSizeToFit numberOfLines={1} style={styles.balanceValue}>
            {formatCurrency(balance)}
          </Text>

          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${spendRatio * 100}%` }]} />
          </View>
          <Text style={styles.progressCaption}>
            {summary.monthIncome > 0
              ? `${Math.round(spendRatio * 100)}% of income spent`
              : "Add income to track your spending ratio"}
          </Text>

          <View style={styles.balanceSplit}>
            <BalanceStat icon="arrow-down" label="Income" value={formatCurrency(summary.monthIncome)} />
            <View style={styles.balanceDivider} />
            <BalanceStat icon="arrow-up" label="Spent" value={formatCurrency(summary.monthExpense)} />
          </View>
        </View>

        <View style={styles.statRow}>
          <Card style={styles.statCard}>
            <Text style={styles.statLabel}>Safe to spend / day</Text>
            <Text numberOfLines={1} adjustsFontSizeToFit style={styles.statValue}>{formatCurrency(Math.round(safeToSpend))}</Text>
            <Text style={styles.statHint}>{daysRemaining} days left</Text>
          </Card>
          <Card style={styles.statCard}>
            <Text style={styles.statLabel}>Spent today</Text>
            <Text numberOfLines={1} adjustsFontSizeToFit style={styles.statValue}>{formatCurrency(summary.todayExpense)}</Text>
            <Text style={styles.statHint}>
              {new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" }).format(today)}
            </Text>
          </Card>
        </View>

        <View style={styles.quickRow}>
          <QuickAction
            icon="remove"
            label="Add expense"
            onPress={() => router.push({ pathname: "/expense-add", params: { type: "expense" } })}
          />
          <QuickAction
            icon="add"
            label="Add income"
            onPress={() => router.push({ pathname: "/expense-add", params: { type: "income" } })}
          />
        </View>

        <SectionHeader
          actionLabel={transactions.length ? "See all" : undefined}
          onAction={() => router.push("/(tabs)/expenses")}
          title="Recent activity"
        />
        <Card padded={false}>
          {recentTransactions.length ? (
            recentTransactions.map((transaction, index) => (
              <TransactionRow
                key={transaction.id}
                last={index === recentTransactions.length - 1}
                transaction={transaction}
              />
            ))
          ) : (
            <EmptyState
              actionLabel="Add transaction"
              icon="receipt-outline"
              message="Your latest income and expenses will show up here."
              onAction={() => router.push("/expense-add")}
              title="No activity yet"
            />
          )}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

function BalanceStat({ icon, label, value }: { icon: "arrow-down" | "arrow-up"; label: string; value: string }) {
  return (
    <View style={styles.balanceStat}>
      <View style={styles.balanceStatIcon}>
        <Ionicons color={colors.white} name={icon} size={14} />
      </View>
      <View style={styles.flex}>
        <Text style={styles.balanceStatLabel}>{label}</Text>
        <Text numberOfLines={1} adjustsFontSizeToFit style={styles.balanceStatValue}>{value}</Text>
      </View>
    </View>
  );
}

function QuickAction({ icon, label, onPress }: { icon: "add" | "remove"; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.quickAction, pressed && styles.pressed]}
    >
      <View style={[styles.quickIcon, icon === "add" && styles.quickIconIncome]}>
        <Ionicons color={icon === "add" ? colors.success : colors.primary} name={icon} size={18} />
      </View>
      <Text style={styles.quickLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  balanceCard: { backgroundColor: colors.ink, borderRadius: radius.xl, padding: 20 },
  balanceDivider: { backgroundColor: colors.inkLine, width: 1 },
  balanceLabel: { ...type.label, color: colors.inkMuted },
  balanceSplit: { borderTopColor: colors.inkLine, borderTopWidth: 1, flexDirection: "row", gap: 14, marginTop: 18, paddingTop: 16 },
  balanceStat: { alignItems: "center", flex: 1, flexDirection: "row", gap: 10 },
  balanceStatIcon: { alignItems: "center", backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 10, height: 32, justifyContent: "center", width: 32 },
  balanceStatLabel: { ...type.caption, color: colors.inkMuted },
  balanceStatValue: { color: colors.white, fontSize: 16, fontVariant: ["tabular-nums"], fontWeight: "600", marginTop: 2 },
  balanceValue: { ...type.display, color: colors.white, fontVariant: ["tabular-nums"], marginTop: 6 },
  center: { alignItems: "center", backgroundColor: colors.background, flex: 1, justifyContent: "center" },
  content: { gap: 12, paddingBottom: TAB_BAR_CLEARANCE, paddingHorizontal: 20 },
  flex: { flex: 1 },
  pressed: { opacity: 0.75 },
  progressCaption: { ...type.caption, color: colors.inkMuted, marginTop: 8 },
  progressFill: { backgroundColor: colors.secondary, borderRadius: 3, height: 6 },
  progressTrack: { backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 3, height: 6, marginTop: 18, overflow: "hidden" },
  quickAction: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, flex: 1, flexDirection: "row", gap: 10, padding: 12 },
  quickIcon: { alignItems: "center", backgroundColor: colors.primarySurface, borderRadius: 10, height: 34, justifyContent: "center", width: 34 },
  quickIconIncome: { backgroundColor: colors.successSurface },
  quickLabel: { color: colors.text, fontSize: 14, fontWeight: "600" },
  quickRow: { flexDirection: "row", gap: 12 },
  screen: { backgroundColor: colors.background, flex: 1 },
  statCard: { flex: 1 },
  statHint: { ...type.caption, color: colors.textSoft, marginTop: 4 },
  statLabel: { ...type.caption, color: colors.textMuted },
  statRow: { flexDirection: "row", gap: 12 },
  statValue: { color: colors.text, fontSize: 20, fontVariant: ["tabular-nums"], fontWeight: "700", marginTop: 6 },
});
