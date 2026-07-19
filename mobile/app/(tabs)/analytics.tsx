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
import { FinanceHero } from "../../components/FinanceHero";
import { getTransactionCategory } from "../../constants/transactionCategories";
import { useExpenseData } from "../../hooks/useExpenseData";
import { colors, subtleShadow } from "../../styles/theme";
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
  const monthTotals = useMemo(() => getCashflowTotals(monthTransactions), [monthTransactions]);
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

  const moveMonth = (offset: number) => {
    const nextMonth = new Date(month.getFullYear(), month.getMonth() + offset, 1);
    setMonth(nextMonth);
    setSelectedDateKey(getDateKey(nextMonth));
  };

  if (loading && !transactions.length) {
    return (
      <SafeAreaView edges={["top"]} style={styles.screen}>
        <View style={styles.centerState}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.mutedText}>Building your insights…</Text>
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
            tintColor={colors.white}
          />
        }
        showsVerticalScrollIndicator={false}
        style={styles.scroll}
      >
        <FinanceHero
          label={`Spent in ${formatMonth(month)}`}
          title="Insights"
          value={formatCurrency(monthTotals.expense)}
        />

        <View style={styles.body}>
          {error ? (
            <Pressable style={styles.errorPanel} onPress={() => void loadTransactions()}>
              <Text style={styles.errorText}>{error}</Text>
              <Text style={styles.retryText}>Tap to retry</Text>
            </Pressable>
          ) : null}

          <View style={styles.calendarCard}>
            <View style={styles.sectionHeader}>
              <Pressable
                accessibilityLabel="Previous month"
                accessibilityRole="button"
                onPress={() => moveMonth(-1)}
                style={styles.iconButton}
              >
                <Ionicons color={colors.text} name="chevron-back" size={18} />
              </Pressable>
              <View style={styles.calendarTitleBlock}>
                <Text style={styles.calendarTitle}>{formatMonth(month)}</Text>
                <Text style={styles.calendarCaption}>Tap a day to inspect spending</Text>
              </View>
              <Pressable
                accessibilityLabel="Next month"
                accessibilityRole="button"
                onPress={() => moveMonth(1)}
                style={styles.iconButton}
              >
                <Ionicons color={colors.text} name="chevron-forward" size={18} />
              </Pressable>
            </View>
            <ExpenseCalendar
              dailyExpenses={dailyExpenses}
              month={month}
              onSelectDate={setSelectedDateKey}
              selectedDateKey={selectedDateKey}
            />
            <View style={styles.heatLegend}>
              <Text style={styles.heatLegendText}>No spend</Text>
              <View style={[styles.heatSwatch, styles.heatLow]} />
              <View style={[styles.heatSwatch, styles.heatMedium]} />
              <View style={[styles.heatSwatch, styles.heatHigh]} />
              <Text style={styles.heatLegendText}>Higher spend</Text>
            </View>
          </View>

          <View style={styles.selectedDayCard}>
            <View>
              <Text style={styles.eyebrow}>
                {new Intl.DateTimeFormat(undefined, { day: "numeric", month: "long", weekday: "long" }).format(selectedDate)}
              </Text>
              <Text style={styles.selectedDayValue}>{formatCurrency(selectedDayExpense)}</Text>
            </View>
            <View style={styles.transactionCountBadge}>
              <Text style={styles.transactionCountText}>
                {selectedTransactions.length} transaction{selectedTransactions.length === 1 ? "" : "s"}
              </Text>
            </View>
          </View>

          {selectedTransactions.length ? (
            <View style={styles.dayTransactions}>
              {selectedTransactions.slice(0, 4).map((transaction) => {
                const category = getTransactionCategory(transaction.category);
                return (
                  <View key={transaction.id} style={styles.dayTransactionRow}>
                    <View style={[styles.categoryIcon, { backgroundColor: category.surface }]}>
                      <Ionicons color={category.color} name={category.icon} size={17} />
                    </View>
                    <View style={styles.transactionCopy}>
                      <Text numberOfLines={1} style={styles.transactionTitle}>{transaction.merchant}</Text>
                      <Text style={styles.transactionMeta}>
                        {category.label} · {new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(transaction.timestamp))}
                      </Text>
                    </View>
                    <Text style={transaction.type === "income" ? styles.incomeAmount : styles.expenseAmount}>
                      {transaction.type === "income" ? "+" : "−"}{formatCurrency(transaction.amount, transaction.currency)}
                    </Text>
                  </View>
                );
              })}
            </View>
          ) : null}

          <View style={styles.segmentedControl}>
            <ScopeButton label="This month" onPress={() => setScope("month")} selected={scope === "month"} />
            <ScopeButton label="All time" onPress={() => setScope("all")} selected={scope === "all"} />
          </View>

          <View style={styles.metricsGrid}>
            <MetricCard label="Income" tone="income" value={formatCurrency(totals.income)} />
            <MetricCard label="Expenses" tone="expense" value={formatCurrency(totals.expense)} />
            <MetricCard label="Net saved" tone={totals.net >= 0 ? "income" : "expense"} value={formatCurrency(totals.net)} />
          </View>

          <View style={styles.chartCard}>
            <View style={styles.chartHeader}>
              <View>
                <Text style={styles.sectionTitle}>Income vs expenses</Text>
                <Text style={styles.sectionCaption}>
                  {scope === "month" ? "Weekly cash flow" : "Across all recorded months"}
                </Text>
              </View>
              <Ionicons color={colors.textSoft} name="stats-chart" size={20} />
            </View>
            <CashflowChart points={cashflowPoints} />
          </View>

          <View style={styles.chartCard}>
            <View style={styles.chartHeader}>
              <View>
                <Text style={styles.sectionTitle}>Top spending categories</Text>
                <Text style={styles.sectionCaption}>
                  {scope === "month" ? formatMonth(month) : "All recorded transactions"}
                </Text>
              </View>
            </View>
            {categoryTotals.length ? (
              <View style={styles.categoryList}>
                {categoryTotals.map(({ amount, category }) => {
                  const ratio = totals.expense ? amount / totals.expense : 0;
                  return (
                    <View key={category.key} style={styles.categoryRow}>
                      <View style={[styles.categoryIcon, { backgroundColor: category.surface }]}>
                        <Ionicons color={category.color} name={category.icon} size={17} />
                      </View>
                      <View style={styles.categoryDetails}>
                        <View style={styles.categoryHeader}>
                          <Text style={styles.categoryName}>{category.label}</Text>
                          <Text style={styles.categoryValue}>{formatCurrency(amount)}</Text>
                        </View>
                        <View style={styles.categoryTrack}>
                          <View style={[styles.categoryFill, { backgroundColor: category.color, width: `${Math.max(ratio * 100, 2)}%` as `${number}%` }]} />
                        </View>
                      </View>
                      <Text style={styles.categoryPercent}>{Math.round(ratio * 100)}%</Text>
                    </View>
                  );
                })}
              </View>
            ) : (
              <Text style={styles.mutedText}>No expenses in this period.</Text>
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ScopeButton({ label, onPress, selected }: { label: string; onPress: () => void; selected: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.scopeButton, selected && styles.scopeButtonSelected]}
    >
      <Text style={[styles.scopeButtonText, selected && styles.scopeButtonTextSelected]}>{label}</Text>
    </Pressable>
  );
}

function MetricCard({ label, tone, value }: { label: string; tone: "expense" | "income"; value: string }) {
  return (
    <View style={styles.metricCard}>
      <View style={[styles.metricDot, tone === "income" ? styles.incomeDot : styles.expenseDot]} />
      <Text style={styles.metricLabel}>{label}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit style={styles.metricValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: 14, marginTop: -24, paddingBottom: 126, paddingHorizontal: 14 },
  calendarCaption: { color: colors.textMuted, fontSize: 10, marginTop: 2 },
  calendarCard: { ...subtleShadow, backgroundColor: colors.surface, borderRadius: 16, padding: 14 },
  calendarTitle: { color: colors.text, fontSize: 16, fontWeight: "800" },
  calendarTitleBlock: { alignItems: "center", flex: 1 },
  categoryDetails: { flex: 1 },
  categoryFill: { borderRadius: 3, height: 5 },
  categoryHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: 7 },
  categoryIcon: { alignItems: "center", borderRadius: 9, height: 36, justifyContent: "center", width: 36 },
  categoryList: { gap: 16 },
  categoryName: { color: colors.text, fontSize: 13, fontWeight: "700" },
  categoryPercent: { color: colors.textSoft, fontSize: 10, textAlign: "right", width: 30 },
  categoryRow: { alignItems: "center", flexDirection: "row", gap: 10 },
  categoryTrack: { backgroundColor: colors.surfaceMuted, borderRadius: 3, height: 5, overflow: "hidden" },
  categoryValue: { color: colors.text, fontSize: 12, fontWeight: "800" },
  centerState: { alignItems: "center", flex: 1, gap: 10, justifyContent: "center" },
  chartCard: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 14, borderWidth: 1, padding: 15 },
  chartHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: 18 },
  content: { backgroundColor: colors.background },
  dayTransactionRow: { alignItems: "center", flexDirection: "row", gap: 10, paddingVertical: 10 },
  dayTransactions: { backgroundColor: colors.surface, borderRadius: 14, paddingHorizontal: 13 },
  errorPanel: { backgroundColor: colors.dangerSurface, borderRadius: 12, padding: 13 },
  errorText: { color: colors.danger, fontSize: 12, fontWeight: "700" },
  expenseAmount: { color: colors.text, fontSize: 12, fontWeight: "800" },
  expenseDot: { backgroundColor: colors.secondary },
  eyebrow: { color: "rgba(255,255,255,0.64)", fontSize: 11, fontWeight: "800", textTransform: "uppercase" },
  heatHigh: { backgroundColor: colors.primary },
  heatLegend: { alignItems: "center", flexDirection: "row", justifyContent: "flex-end", marginTop: 10 },
  heatLegendText: { color: colors.textSoft, fontSize: 9, marginHorizontal: 5 },
  heatLow: { backgroundColor: colors.primarySurface },
  heatMedium: { backgroundColor: "#8BC8B1" },
  heatSwatch: { borderRadius: 3, height: 8, marginHorizontal: 2, width: 8 },
  iconButton: { alignItems: "center", backgroundColor: colors.backgroundSoft, borderRadius: 9, height: 34, justifyContent: "center", width: 34 },
  incomeAmount: { color: colors.success, fontSize: 12, fontWeight: "800" },
  incomeDot: { backgroundColor: colors.success },
  metricCard: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 12, borderWidth: 1, flex: 1, minWidth: 100, padding: 12 },
  metricDot: { borderRadius: 3, height: 6, marginBottom: 13, width: 18 },
  metricLabel: { color: colors.textMuted, fontSize: 10, fontWeight: "700" },
  metricValue: { color: colors.text, fontSize: 14, fontWeight: "800", marginTop: 5 },
  metricsGrid: { flexDirection: "row", gap: 8 },
  mutedText: { color: colors.textMuted, fontSize: 12, textAlign: "center" },
  retryText: { color: colors.danger, fontSize: 11, fontWeight: "800", marginTop: 5 },
  safeArea: { backgroundColor: colors.primaryDark, flex: 1 },
  scopeButton: { alignItems: "center", borderRadius: 9, flex: 1, paddingVertical: 10 },
  scopeButtonSelected: { backgroundColor: colors.surface },
  scopeButtonText: { color: colors.textMuted, fontSize: 12, fontWeight: "800" },
  scopeButtonTextSelected: { color: colors.primary },
  screen: { backgroundColor: colors.background, flex: 1 },
  scroll: { backgroundColor: colors.background },
  sectionCaption: { color: colors.textMuted, fontSize: 10, marginTop: 3 },
  sectionHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: 16 },
  sectionTitle: { color: colors.text, fontSize: 15, fontWeight: "800" },
  segmentedControl: { backgroundColor: colors.surfaceMuted, borderRadius: 11, flexDirection: "row", padding: 3 },
  selectedDayCard: { alignItems: "center", backgroundColor: colors.primaryDark, borderRadius: 14, flexDirection: "row", justifyContent: "space-between", padding: 15 },
  selectedDayValue: { color: colors.white, fontSize: 22, fontWeight: "800", marginTop: 5 },
  transactionCopy: { flex: 1 },
  transactionCountBadge: { backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 },
  transactionCountText: { color: colors.white, fontSize: 10, fontWeight: "700" },
  transactionMeta: { color: colors.textMuted, fontSize: 10, marginTop: 3 },
  transactionTitle: { color: colors.text, fontSize: 12, fontWeight: "800" },
});
