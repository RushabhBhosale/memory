import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { useMemo, useState } from "react";
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

import { CashflowChart } from "../../components/CashflowChart";
import { ExpenseCalendar } from "../../components/ExpenseCalendar";
import {
  Banner,
  Card,
  IconBadge,
  PageHeader,
  Segmented,
  SectionHeader,
  TAB_BAR_CLEARANCE,
  TransactionRow,
} from "../../components/ui";
import { getTransactionCategory } from "../../constants/transactionCategories";
import { useExpenseData } from "../../hooks/useExpenseData";
import { colors, radius, type } from "../../styles/theme";
import {
  buildAllTimeCashflowPoints,
  buildMonthlyCashflowPoints,
  getCashflowTotals,
  getDailyExpenseTotals,
  getDateKey,
  isSameMonth,
} from "../../utils/financeAnalytics";
import { formatCurrency } from "../../utils/localization";

type AnalyticsScope = "month" | "all";

const formatMonth = (date: Date) =>
  new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(date);

const parseDateKey = (dateKey: string) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
};

export default function AnalyticsScreen() {
  const { error, loading, loadTransactions, refreshing, transactions } = useExpenseData();
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [scope, setScope] = useState<AnalyticsScope>("month");
  const [selectedDateKey, setSelectedDateKey] = useState(() => getDateKey(new Date()));

  const monthTransactions = useMemo(
    () => transactions.filter((item) => isSameMonth(item.timestamp, month)),
    [month, transactions],
  );
  const scopeTransactions = useMemo(
    () => scope === "month" ? monthTransactions : transactions,
    [monthTransactions, scope, transactions],
  );
  const totals = useMemo(() => getCashflowTotals(scopeTransactions), [scopeTransactions]);
  const dailyExpenses = useMemo(
    () => getDailyExpenseTotals(monthTransactions),
    [monthTransactions],
  );
  const cashflowPoints = useMemo(
    () => scope === "month"
      ? buildMonthlyCashflowPoints(monthTransactions, month)
      : buildAllTimeCashflowPoints(transactions),
    [month, monthTransactions, scope, transactions],
  );
  const categoryTotals = useMemo(() => {
    const byCategory = new Map<string, number>();
    scopeTransactions
      .filter((item) => item.type === "expense")
      .forEach((item) => {
        byCategory.set(item.category, (byCategory.get(item.category) || 0) + item.amount);
      });

    return [...byCategory.entries()]
      .map(([key, amount]) => ({ amount, category: getTransactionCategory(key) }))
      .sort((left, right) => right.amount - left.amount)
      .slice(0, 5);
  }, [scopeTransactions]);
  const selectedTransactions = useMemo(
    () => transactions
      .filter((item) => getDateKey(item.timestamp) === selectedDateKey)
      .sort((left, right) => right.timestamp - left.timestamp),
    [selectedDateKey, transactions],
  );
  const selectedDayExpense = selectedTransactions
    .filter((item) => item.type === "expense")
    .reduce((sum, item) => sum + item.amount, 0);
  const selectedDate = parseDateKey(selectedDateKey);
  const savingsRate = totals.income > 0 ? Math.round((totals.net / totals.income) * 100) : null;
  const isCurrentMonth = getDateKey(month).slice(0, 7) === getDateKey(new Date()).slice(0, 7);

  const moveMonth = (offset: number) => {
    const nextMonth = new Date(month.getFullYear(), month.getMonth() + offset, 1);
    setMonth(nextMonth);
    setSelectedDateKey(getDateKey(nextMonth));
  };

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
        <PageHeader subtitle="Where your money goes" title="Insights" />

        {error ? <Banner message={error} onPress={() => void loadTransactions()} /> : null}

        <View style={styles.monthSwitcher}>
          <Pressable
            accessibilityLabel="Previous month"
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => moveMonth(-1)}
            style={styles.monthArrow}
          >
            <Ionicons color={colors.text} name="chevron-back" size={18} />
          </Pressable>
          <Text style={styles.monthLabel}>{formatMonth(month)}</Text>
          <Pressable
            accessibilityLabel="Next month"
            accessibilityRole="button"
            disabled={isCurrentMonth}
            hitSlop={8}
            onPress={() => moveMonth(1)}
            style={[styles.monthArrow, isCurrentMonth && styles.disabled]}
          >
            <Ionicons color={colors.text} name="chevron-forward" size={18} />
          </Pressable>
        </View>

        <Segmented
          onChange={setScope}
          options={[
            { label: "This month", value: "month" },
            { label: "All time", value: "all" },
          ]}
          value={scope}
        />

        <Card style={styles.totalsCard}>
          <Text style={styles.totalsLabel}>Net savings</Text>
          <Text
            adjustsFontSizeToFit
            numberOfLines={1}
            style={[styles.totalsValue, { color: totals.net >= 0 ? colors.success : colors.danger }]}
          >
            {totals.net >= 0 ? "+" : "−"}{formatCurrency(Math.abs(totals.net))}
          </Text>
          {savingsRate !== null ? (
            <Text style={styles.totalsHint}>{savingsRate}% of income saved</Text>
          ) : null}
          <View style={styles.totalsSplit}>
            <Metric color={colors.success} label="Income" value={formatCurrency(totals.income)} />
            <Metric color={colors.primary} label="Expenses" value={formatCurrency(totals.expense)} />
          </View>
        </Card>

        <SectionHeader title="Cash flow" />
        <Card>
          <CashflowChart points={cashflowPoints} />
        </Card>

        <SectionHeader title="Top categories" />
        <Card>
          {categoryTotals.length ? (
            <View style={styles.categoryList}>
              {categoryTotals.map(({ amount, category }) => {
                const ratio = totals.expense ? amount / totals.expense : 0;
                return (
                  <View key={category.key} style={styles.categoryRow}>
                    <IconBadge color={category.color} icon={category.icon} size={36} surface={category.surface} />
                    <View style={styles.flex}>
                      <View style={styles.categoryHeader}>
                        <Text style={styles.categoryName}>{category.label}</Text>
                        <Text style={styles.categoryValue}>{formatCurrency(amount)}</Text>
                      </View>
                      <View style={styles.track}>
                        <View
                          style={[
                            styles.trackFill,
                            { backgroundColor: category.color, width: `${Math.max(ratio * 100, 2)}%` },
                          ]}
                        />
                      </View>
                    </View>
                    <Text style={styles.categoryPercent}>{Math.round(ratio * 100)}%</Text>
                  </View>
                );
              })}
            </View>
          ) : (
            <Text style={styles.muted}>No expenses in this period.</Text>
          )}
        </Card>

        <SectionHeader title="Daily spending" />
        <Card>
          <ExpenseCalendar
            dailyExpenses={dailyExpenses}
            month={month}
            onSelectDate={setSelectedDateKey}
            selectedDateKey={selectedDateKey}
          />
        </Card>

        <Card padded={false}>
          <View style={styles.dayHeader}>
            <View>
              <Text style={styles.dayLabel}>
                {new Intl.DateTimeFormat(undefined, { day: "numeric", month: "long", weekday: "long" }).format(selectedDate)}
              </Text>
              <Text style={styles.dayValue}>{formatCurrency(selectedDayExpense)} spent</Text>
            </View>
            <Text style={styles.dayCount}>
              {selectedTransactions.length} item{selectedTransactions.length === 1 ? "" : "s"}
            </Text>
          </View>
          {selectedTransactions.slice(0, 5).map((transaction, index, list) => (
            <TransactionRow key={transaction.id} last={index === list.length - 1} transaction={transaction} />
          ))}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

function Metric({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <View style={styles.flex}>
      <View style={styles.metricLabelRow}>
        <View style={[styles.dot, { backgroundColor: color }]} />
        <Text style={styles.metricLabel}>{label}</Text>
      </View>
      <Text adjustsFontSizeToFit numberOfLines={1} style={styles.metricValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  categoryHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  categoryList: { gap: 18 },
  categoryName: { color: colors.text, fontSize: 14, fontWeight: "600" },
  categoryPercent: { ...type.caption, color: colors.textSoft, fontVariant: ["tabular-nums"], textAlign: "right", width: 36 },
  categoryRow: { alignItems: "center", flexDirection: "row", gap: 12 },
  categoryValue: { color: colors.text, fontSize: 14, fontVariant: ["tabular-nums"], fontWeight: "600" },
  center: { alignItems: "center", backgroundColor: colors.background, flex: 1, justifyContent: "center" },
  content: { gap: 12, paddingBottom: TAB_BAR_CLEARANCE, paddingHorizontal: 20 },
  dayCount: { ...type.caption, color: colors.textMuted },
  dayHeader: { alignItems: "center", borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", justifyContent: "space-between", padding: 16 },
  dayLabel: { ...type.caption, color: colors.textMuted },
  dayValue: { color: colors.text, fontSize: 18, fontVariant: ["tabular-nums"], fontWeight: "700", marginTop: 4 },
  disabled: { opacity: 0.35 },
  dot: { borderRadius: 4, height: 8, width: 8 },
  flex: { flex: 1 },
  metricLabel: { ...type.caption, color: colors.textMuted },
  metricLabelRow: { alignItems: "center", flexDirection: "row", gap: 6 },
  metricValue: { color: colors.text, fontSize: 17, fontVariant: ["tabular-nums"], fontWeight: "600", marginTop: 4 },
  monthArrow: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.pill, borderWidth: 1, height: 36, justifyContent: "center", width: 36 },
  monthLabel: { ...type.heading, color: colors.text },
  monthSwitcher: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  muted: { ...type.label, color: colors.textMuted, textAlign: "center" },
  screen: { backgroundColor: colors.background, flex: 1 },
  totalsCard: { padding: 20 },
  totalsHint: { ...type.caption, color: colors.textMuted, marginTop: 4 },
  totalsLabel: { ...type.label, color: colors.textMuted },
  totalsSplit: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: "row", gap: 16, marginTop: 16, paddingTop: 16 },
  totalsValue: { fontSize: 30, fontVariant: ["tabular-nums"], fontWeight: "700", letterSpacing: -0.6, marginTop: 4 },
  track: { backgroundColor: colors.surfaceMuted, borderRadius: 3, height: 6, overflow: "hidden" },
  trackFill: { borderRadius: 3, height: 6 },
});
