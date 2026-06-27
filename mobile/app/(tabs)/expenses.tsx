import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  confirmPendingTransaction,
  deleteExpense,
  hasExpenseSmsPermissions,
  ignorePendingTransaction,
  listExpenses,
  listPendingTransactions,
  requestExpenseSmsPermissions,
  scanRecentSms,
  subscribeToExpenseChanges,
  syncExpensesToMongo,
  type ExpenseEntry,
  type PendingTransaction,
  type PendingTransactionType,
} from "../../services/expenses";
import { colors, subtleShadow } from "../../styles/theme";

const categories = ["food", "shopping", "travel", "bills", "general"];

const formatCurrency = (amount: number, currency = "INR") =>
  new Intl.NumberFormat("en-IN", {
    currency,
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    style: "currency",
  }).format(amount);

const formatDate = (timestamp: number) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));

const isThisMonth = (timestamp: number) => {
  const date = new Date(timestamp);
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
};

const getCategoryBreakdown = (expenses: ExpenseEntry[]) =>
  expenses
    .filter((expense) => expense.type === "expense" && isThisMonth(expense.timestamp))
    .reduce<Record<string, number>>((breakdown, expense) => {
      breakdown[expense.category] = (breakdown[expense.category] || 0) + expense.amount;
      return breakdown;
    }, {});

type EditingState = {
  amount: string;
  category: string;
  merchant: string;
  type: PendingTransactionType;
};

export default function ExpensesScreen() {
  const [pending, setPending] = useState<PendingTransaction[]>([]);
  const [expenses, setExpenses] = useState<ExpenseEntry[]>([]);
  const [hasPermission, setHasPermission] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingId, setSavingId] = useState("");
  const [editingId, setEditingId] = useState("");
  const [smsTestResult, setSmsTestResult] = useState("");
  const [scanningSms, setScanningSms] = useState(false);
  const [editing, setEditing] = useState<EditingState>({
    amount: "",
    category: "general",
    merchant: "",
    type: "debit",
  });
  const [error, setError] = useState("");

  const loadData = useCallback(async (options?: { refreshing?: boolean }) => {
    try {
      if (options?.refreshing) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError("");

      if (Platform.OS !== "android") {
        setPending([]);
        setExpenses([]);
        setHasPermission(false);
        return;
      }

      const [permission, nextPending, nextExpenses] = await Promise.all([
        hasExpenseSmsPermissions(),
        listPendingTransactions(),
        listExpenses(),
      ]);

      setHasPermission(permission);
      setPending(nextPending.filter((item) => item.status === "pending").reverse());
      setExpenses(nextExpenses.reverse());
      void syncExpensesToMongo(nextExpenses).catch(() => undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load expenses");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadData();
    }, [loadData]),
  );

  useFocusEffect(
    useCallback(() => {
      const subscription = subscribeToExpenseChanges(() => {
        void loadData();
      });

      return () => subscription.remove();
    }, [loadData]),
  );

  const monthSpend = useMemo(
    () =>
      expenses
        .filter((expense) => expense.type === "expense" && isThisMonth(expense.timestamp))
        .reduce((total, expense) => total + expense.amount, 0),
    [expenses],
  );
  const monthIncome = useMemo(
    () =>
      expenses
        .filter((expense) => expense.type === "income" && isThisMonth(expense.timestamp))
        .reduce((total, expense) => total + expense.amount, 0),
    [expenses],
  );
  const categoryBreakdown = useMemo(() => getCategoryBreakdown(expenses), [expenses]);
  const recentExpenses = expenses.slice(0, 12);

  const requestPermissions = async () => {
    try {
      const granted = await requestExpenseSmsPermissions();
      setHasPermission(granted);

      if (!granted) {
        Alert.alert(
          "Permission needed",
          "Allow SMS and notification permissions to detect transaction SMS and ask before adding expenses.",
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to request permissions");
    }
  };

  const startEditing = (item: PendingTransaction) => {
    setEditingId(item.id);
    setEditing({
      amount: String(item.amount),
      category: item.category,
      merchant: item.merchant,
      type: item.type,
    });
  };

  const confirmTransaction = async (item: PendingTransaction) => {
    const amount = Number.parseFloat(editingId === item.id ? editing.amount : String(item.amount));

    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert("Check amount", "Enter a valid transaction amount.");
      return;
    }

    try {
      setSavingId(item.id);
      await confirmPendingTransaction(
        item.id,
        editingId === item.id
          ? {
              amount,
              category: editing.category,
              merchant: editing.merchant.trim() || "Unknown Merchant",
              type: editing.type,
            }
          : undefined,
      );
      setEditingId("");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add transaction");
    } finally {
      setSavingId("");
    }
  };

  const removeExpense = (expense: ExpenseEntry) => {
    Alert.alert(
      "Delete transaction?",
      `${expense.merchant} • ${formatCurrency(expense.amount, expense.currency)}`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              setSavingId(expense.id);
              const deleted = await deleteExpense(expense.id);

              if (!deleted) {
                Alert.alert("Delete failed", "This transaction was not found on this device.");
                return;
              }

              await loadData();
            } catch (err) {
              const message = err instanceof Error ? err.message : "Unable to delete expense";
              setError(message);
              Alert.alert("Delete failed", message);
            } finally {
              setSavingId("");
            }
          },
        },
      ],
    );
  };

  const ignoreTransaction = async (item: PendingTransaction) => {
    try {
      setSavingId(item.id);
      await ignorePendingTransaction(item.id);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to ignore transaction");
    } finally {
      setSavingId("");
    }
  };

  const checkLastTenSms = async () => {
    try {
      setScanningSms(true);
      setSmsTestResult("");
      let granted = hasPermission;

      if (!granted) {
        granted = await requestExpenseSmsPermissions();
        setHasPermission(granted);
      }

      if (!granted) {
        setSmsTestResult("SMS permission was not granted.");
        return;
      }

      const result = await scanRecentSms(10);
      const ignoredSummary = Object.entries(result.ignoredReasons)
        .map(([reason, count]) => `${reason}: ${count}`)
        .join(", ");

      setSmsTestResult(
        result.matched
          ? `Checked ${result.scanned} SMS. Found ${result.matched} transaction message${result.matched === 1 ? "" : "s"}.`
          : `Checked ${result.scanned} SMS. No transactions found${ignoredSummary ? ` (${ignoredSummary})` : ""}.`,
      );
      await loadData();
    } catch (err) {
      setSmsTestResult(err instanceof Error ? err.message : "Unable to check recent SMS");
    } finally {
      setScanningSms(false);
    }
  };

  if (Platform.OS !== "android") {
    return (
      <SafeAreaView edges={["top"]} style={styles.screen}>
        <View style={styles.centerState}>
          <Text style={styles.title}>Expenses</Text>
          <Text style={styles.mutedText}>SMS transaction approval is Android only.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView edges={["top"]} style={styles.screen}>
        <View style={styles.centerState}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.mutedText}>Loading expenses...</Text>
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
            refreshing={refreshing}
            tintColor={colors.primary}
            onRefresh={() => void loadData({ refreshing: true })}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>MemoryOS</Text>
            <Text style={styles.title}>Expenses</Text>
          </View>
          <View style={styles.headerIcon}>
            <Ionicons color={colors.primary} name="wallet-outline" size={22} />
          </View>
        </View>

        {!hasPermission ? (
          <View style={styles.permissionPanel}>
            <Text style={styles.panelTitle}>Enable SMS transaction approval</Text>
            <Text style={styles.panelText}>
              MemoryOS will only process transaction-looking SMS, skip OTP/login messages, and ask
              before adding anything.
            </Text>
            <Pressable style={styles.primaryButton} onPress={() => void requestPermissions()}>
              <Text style={styles.primaryButtonText}>Allow SMS detection</Text>
            </Pressable>
          </View>
        ) : null}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <View style={styles.quickActions}>
          <Pressable
            style={[styles.quickActionButton, styles.quickActionPrimary]}
            onPress={() => router.push("/expense-add")}
          >
            <View style={styles.quickActionIcon}>
              <Ionicons color={colors.white} name="add" size={20} />
            </View>
            <View style={styles.quickActionCopy}>
              <Text style={styles.quickActionTitlePrimary}>Add manually</Text>
              <Text style={styles.quickActionTextPrimary}>Cash, UPI, income</Text>
            </View>
          </Pressable>

          {smsTestResult ? <Text style={styles.testResultText}>{smsTestResult}</Text> : null}
          <Pressable
            disabled={scanningSms}
            style={[styles.quickActionButton, styles.quickActionSecondary]}
            onPress={() => void checkLastTenSms()}
          >
            <View style={styles.quickActionIconSecondary}>
              {scanningSms ? (
                <ActivityIndicator color={colors.text} size="small" />
              ) : (
                <Ionicons color={colors.text} name="refresh" size={19} />
              )}
            </View>
            <View style={styles.quickActionCopy}>
              <Text style={styles.quickActionTitle}>Read SMS</Text>
              <Text style={styles.quickActionText}>
                {scanningSms ? "Checking latest messages" : "Refresh detection"}
              </Text>
            </View>
          </Pressable>
        </View>

        <View style={styles.summaryGrid}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>This Month Spend</Text>
            <Text style={styles.summaryValue}>{formatCurrency(monthSpend)}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>This Month Income</Text>
            <Text style={[styles.summaryValue, styles.incomeText]}>
              {formatCurrency(monthIncome)}
            </Text>
          </View>
        </View>

        <View style={styles.panel}>
          <View style={styles.panelHeader}>
            <Text style={styles.panelTitle}>Pending Transactions</Text>
            <Text style={styles.panelCaption}>{pending.length}</Text>
          </View>
          {pending.length ? (
            pending.map((item) => {
              const isEditing = editingId === item.id;
              const isSaving = savingId === item.id;

              return (
                <View key={item.id} style={styles.pendingCard}>
                  <View style={styles.pendingHeader}>
                    <Text style={styles.amountText}>
                      {formatCurrency(item.amount, item.currency)}
                    </Text>
                    <Text style={styles.typePill}>{item.type === "credit" ? "Income" : "Expense"}</Text>
                  </View>

                  {isEditing ? (
                    <View style={styles.editBox}>
                      <TextInput
                        keyboardType="decimal-pad"
                        onChangeText={(value) => setEditing((current) => ({ ...current, amount: value }))}
                        placeholder="Amount"
                        style={styles.input}
                        value={editing.amount}
                      />
                      <TextInput
                        onChangeText={(value) => setEditing((current) => ({ ...current, merchant: value }))}
                        placeholder="Merchant"
                        style={styles.input}
                        value={editing.merchant}
                      />
                      <View style={styles.chipRow}>
                        {categories.map((category) => (
                          <Pressable
                            key={category}
                            style={[styles.chip, editing.category === category && styles.selectedChip]}
                            onPress={() => setEditing((current) => ({ ...current, category }))}
                          >
                            <Text
                              style={[
                                styles.chipText,
                                editing.category === category && styles.selectedChipText,
                              ]}
                            >
                              {category}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                      <View style={styles.chipRow}>
                        {(["debit", "credit"] as const).map((type) => (
                          <Pressable
                            key={type}
                            style={[styles.chip, editing.type === type && styles.selectedChip]}
                            onPress={() => setEditing((current) => ({ ...current, type }))}
                          >
                            <Text
                              style={[
                                styles.chipText,
                                editing.type === type && styles.selectedChipText,
                              ]}
                            >
                              {type === "credit" ? "Income" : "Expense"}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  ) : (
                    <>
                      <Text style={styles.merchantText}>{item.merchant}</Text>
                      <Text style={styles.metaText}>{item.category} • {formatDate(item.timestamp)}</Text>
                    </>
                  )}

                  <Text style={styles.previewText} numberOfLines={2}>
                    {item.messagePreview}
                  </Text>

                  <View style={styles.actionRow}>
                    <Pressable
                      disabled={isSaving}
                      style={styles.primaryAction}
                      onPress={() => void confirmTransaction(item)}
                    >
                      <Text style={styles.primaryActionText}>
                        {isSaving ? "Saving..." : item.type === "credit" ? "Add income" : "Add expense"}
                      </Text>
                    </Pressable>
                    <Pressable
                      disabled={isSaving}
                      style={styles.secondaryAction}
                      onPress={() => void ignoreTransaction(item)}
                    >
                      <Text style={styles.secondaryActionText}>Ignore</Text>
                    </Pressable>
                    <Pressable
                      disabled={isSaving}
                      style={styles.secondaryAction}
                      onPress={() => (isEditing ? setEditingId("") : startEditing(item))}
                    >
                      <Text style={styles.secondaryActionText}>{isEditing ? "Cancel" : "Edit"}</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })
          ) : (
            <Text style={styles.emptyText}>Transaction SMS approvals will appear here.</Text>
          )}
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Category Breakdown</Text>
          {Object.entries(categoryBreakdown).length ? (
            Object.entries(categoryBreakdown).map(([category, amount]) => (
              <View key={category} style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>{category}</Text>
                <Text style={styles.breakdownValue}>{formatCurrency(amount)}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>No spend categories this month yet.</Text>
          )}
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Recent Expenses</Text>
          {recentExpenses.length ? (
            recentExpenses.map((expense) => (
              <View key={expense.id} style={styles.expenseRow}>
                <View style={styles.expenseIcon}>
                  <Ionicons
                    color={expense.type === "income" ? colors.success : colors.primary}
                    name={expense.type === "income" ? "trending-up-outline" : "card-outline"}
                    size={18}
                  />
                </View>
                <View style={styles.expenseCopy}>
                  <Text style={styles.merchantText}>{expense.merchant}</Text>
                  <Text style={styles.metaText}>{expense.category} • {formatDate(expense.timestamp)}</Text>
                </View>
                <Text style={expense.type === "income" ? styles.incomeAmount : styles.expenseAmount}>
                  {expense.type === "income" ? "+" : "-"}
                  {formatCurrency(expense.amount, expense.currency)}
                </Text>
                <Pressable
                  disabled={savingId === expense.id}
                  style={styles.deleteButton}
                  onPress={() => removeExpense(expense)}
                >
                  <Ionicons color={colors.danger} name="trash-outline" size={18} />
                </Pressable>
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>Confirmed SMS expenses will show up here.</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  actionRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  amountText: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "900",
  },
  breakdownLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "800",
    textTransform: "capitalize",
  },
  breakdownRow: {
    alignItems: "center",
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 12,
  },
  breakdownValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "900",
  },
  centerState: {
    alignItems: "center",
    flex: 1,
    gap: 12,
    justifyContent: "center",
    padding: 24,
  },
  chip: {
    backgroundColor: colors.backgroundSoft,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chipText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "capitalize",
  },
  content: {
    padding: 18,
    paddingBottom: 118,
  },
  editBox: {
    gap: 10,
    marginTop: 10,
  },
  deleteButton: {
    alignItems: "center",
    borderRadius: 999,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19,
    marginTop: 10,
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 12,
  },
  expenseAmount: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: "900",
  },
  expenseCopy: {
    flex: 1,
  },
  expenseIcon: {
    alignItems: "center",
    backgroundColor: colors.accentSurface,
    borderRadius: 999,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  expenseRow: {
    alignItems: "center",
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 10,
    paddingVertical: 12,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  headerIcon: {
    alignItems: "center",
    backgroundColor: colors.accentSurface,
    borderRadius: 999,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  eyebrow: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  incomeAmount: {
    color: colors.success,
    fontSize: 13,
    fontWeight: "900",
  },
  incomeText: {
    color: colors.success,
  },
  input: {
    backgroundColor: colors.backgroundSoft,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    color: colors.text,
    fontSize: 14,
    fontWeight: "800",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  merchantText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900",
    marginTop: 4,
  },
  metaText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
  },
  mutedText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
  },
  panel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 22,
    borderWidth: 1,
    marginBottom: 16,
    padding: 16,
    ...subtleShadow,
  },
  panelCaption: {
    color: colors.textSoft,
    fontSize: 12,
    fontWeight: "800",
  },
  panelHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  panelText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19,
    marginBottom: 14,
    marginTop: 6,
  },
  panelTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900",
  },
  pendingCard: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    marginTop: 14,
    paddingTop: 14,
  },
  pendingHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  permissionPanel: {
    backgroundColor: colors.accentSurface,
    borderColor: colors.primary,
    borderRadius: 22,
    borderWidth: 1,
    marginBottom: 16,
    padding: 16,
  },
  previewText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
    marginTop: 10,
  },
  quickActionButton: {
    alignItems: "center",
    borderRadius: 22,
    flexDirection: "row",
    gap: 12,
    padding: 16,
  },
  quickActionCopy: {
    flex: 1,
  },
  quickActionIcon: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: 999,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  quickActionIconSecondary: {
    alignItems: "center",
    backgroundColor: colors.backgroundSoft,
    borderRadius: 999,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  quickActionPrimary: {
    backgroundColor: colors.black,
  },
  quickActionSecondary: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    ...subtleShadow,
  },
  quickActionText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 3,
  },
  quickActionTextPrimary: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 3,
  },
  quickActionTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900",
  },
  quickActionTitlePrimary: {
    color: colors.white,
    fontSize: 15,
    fontWeight: "900",
  },
  quickActions: {
    gap: 10,
    marginBottom: 16,
  },
  primaryAction: {
    alignItems: "center",
    backgroundColor: colors.black,
    borderRadius: 999,
    flex: 1,
    paddingVertical: 10,
  },
  primaryActionText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: "900",
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: colors.black,
    borderRadius: 999,
    paddingVertical: 12,
  },
  primaryButtonText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: "900",
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: colors.backgroundSoft,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    marginBottom: 10,
    paddingVertical: 12,
  },
  secondaryButtonText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "900",
  },
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  secondaryAction: {
    alignItems: "center",
    backgroundColor: colors.backgroundSoft,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    flex: 1,
    paddingVertical: 10,
  },
  secondaryActionText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "900",
  },
  selectedChip: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  selectedChipText: {
    color: colors.white,
  },
  summaryCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 20,
    borderWidth: 1,
    flex: 1,
    padding: 16,
    ...subtleShadow,
  },
  summaryGrid: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  summaryLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "800",
  },
  summaryValue: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "900",
    marginTop: 8,
  },
  testResultText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 18,
    marginBottom: 10,
    marginTop: 10,
  },
  title: {
    color: colors.text,
    fontSize: 34,
    fontWeight: "900",
  },
  typePill: {
    backgroundColor: colors.backgroundSoft,
    borderRadius: 999,
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
});
