import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  Banner,
  Button,
  Card,
  Chip,
  EmptyState,
  IconBadge,
  IconButton,
  PageHeader,
  Segmented,
  TAB_BAR_CLEARANCE,
  TransactionRow,
  groupByDay,
} from "../../components/ui";
import {
  getTransactionCategory,
  transactionCategories,
} from "../../constants/transactionCategories";
import {
  confirmPendingTransaction,
  deleteExpense,
  fetchAllRemoteExpenses,
  hasExpenseSmsPermissions,
  ignorePendingTransaction,
  listPendingTransactions,
  listLocalExpenses,
  mergeExpenseEntries,
  requestExpenseSmsPermissions,
  scanRecentSms,
  subscribeToExpenseChanges,
  syncExpensesToMongo,
  updateExpenseCategory,
  type ExpenseEntry,
  type PendingTransaction,
  type PendingTransactionType,
} from "../../services/expenses";
import { colors, radius, type } from "../../styles/theme";
import { formatCurrency, formatDate } from "../../utils/localization";

const REMOTE_PAGE_SIZE = 100;

const isThisMonth = (timestamp: number) => {
  const date = new Date(timestamp);
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
};

type Filter = "all" | "expense" | "income";

type EditingState = {
  amount: string;
  category: string;
  merchant: string;
  type: PendingTransactionType;
};

export default function ExpensesScreen() {
  const [pending, setPending] = useState<PendingTransaction[]>([]);
  const [transactions, setTransactions] = useState<ExpenseEntry[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [hasPermission, setHasPermission] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [syncingRemote, setSyncingRemote] = useState(false);
  const [savingId, setSavingId] = useState("");
  const [editingId, setEditingId] = useState("");
  const [recategorizingId, setRecategorizingId] = useState("");
  const [editing, setEditing] = useState<EditingState>({
    amount: "",
    category: "general",
    merchant: "",
    type: "debit",
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadData = useCallback(
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
        void Promise.all([
          Platform.OS === "android" ? listPendingTransactions() : Promise.resolve([]),
          Platform.OS === "android" ? hasExpenseSmsPermissions() : Promise.resolve(false),
        ]).then(([nextPending, permission]) => {
          setPending(nextPending.filter((item) => item.status === "pending").reverse());
          setHasPermission(permission);
        });

        try {
          const remote = await fetchAllRemoteExpenses(REMOTE_PAGE_SIZE);
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

  const syncCloud = async () => {
    try {
      setSyncingRemote(true);
      setError("");
      const remote = await fetchAllRemoteExpenses(REMOTE_PAGE_SIZE);
      const local = await listLocalExpenses();
      const merged = mergeExpenseEntries(local, remote.data);

      setTransactions(merged);
      void syncExpensesToMongo(local).catch(() => undefined);
      setMessage(
        `Synced · ${remote.count} transaction${remote.count === 1 ? "" : "s"} loaded from cloud`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sync transactions");
    } finally {
      setSyncingRemote(false);
    }
  };

  const refreshAll = async () => {
    await loadData({ refreshing: true });
    const local = await listLocalExpenses();
    void syncExpensesToMongo(local).catch(() => undefined);
  };

  useFocusEffect(
    useCallback(() => {
      void loadData();
    }, [loadData]),
  );

  useFocusEffect(
    useCallback(() => {
      const subscription = subscribeToExpenseChanges(() => {
        void loadData({ silent: true });
      });

      return () => subscription.remove();
    }, [loadData]),
  );

  const visibleTransactions = useMemo(
    () => transactions.filter(
      (item) =>
        (filter === "all" || item.type === filter) &&
        (categoryFilter === "all" || item.category === categoryFilter),
    ),
    [categoryFilter, filter, transactions],
  );
  const groups = useMemo(() => groupByDay(visibleTransactions), [visibleTransactions]);
  const { monthExpense, monthIncome } = useMemo(() => {
    let income = 0;
    let expense = 0;
    transactions.forEach((item) => {
      if (!isThisMonth(item.timestamp)) return;
      if (item.type === "income") income += item.amount;
      else expense += item.amount;
    });
    return { monthExpense: expense, monthIncome: income };
  }, [transactions]);

  const requestPermissions = async () => {
    try {
      const granted = await requestExpenseSmsPermissions();
      setHasPermission(granted);
      if (!granted) {
        Alert.alert("Permission needed", "Allow SMS access to review transaction alerts before saving them.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to request SMS access");
    }
  };

  const refreshSms = async () => {
    if (Platform.OS !== "android") {
      return;
    }

    try {
      setScanning(true);
      setMessage("");
      let granted = hasPermission;
      if (!granted) {
        granted = await requestExpenseSmsPermissions();
        setHasPermission(granted);
      }
      if (!granted) {
        setMessage("SMS permission was not granted.");
        return;
      }

      const result = await scanRecentSms(100);
      setMessage(
        result.matched
          ? `${result.matched} transaction${result.matched === 1 ? "" : "s"} ready for review.`
          : `Checked ${result.scanned} messages. No new transactions found.`,
      );
      await loadData({ silent: true });
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to read SMS");
    } finally {
      setScanning(false);
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
    const category = editingId === item.id ? editing.category : item.category;
    const merchant = editingId === item.id ? editing.merchant.trim() || "Unknown Merchant" : item.merchant;
    const type = editingId === item.id ? editing.type : item.type;

    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert("Check amount", "Enter a valid transaction amount.");
      return;
    }

    try {
      setSavingId(item.id);
      await confirmPendingTransaction(
        item.id,
        editingId === item.id ? { amount, category, merchant, type } : undefined,
      );
      setEditingId("");
      await loadData({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save transaction");
    } finally {
      setSavingId("");
    }
  };

  const removeTransaction = (transaction: ExpenseEntry) => {
    Alert.alert(
      "Delete transaction?",
      `${transaction.merchant} · ${formatCurrency(transaction.amount, transaction.currency)}`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              setSavingId(transaction.id);
              await deleteExpense(transaction.id);
              await loadData({ silent: true });
            } catch (err) {
              const message = err instanceof Error ? err.message : "Unable to delete transaction";
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

  const openTransaction = (transaction: ExpenseEntry) => {
    Alert.alert(
      transaction.merchant,
      `${formatCurrency(transaction.amount, transaction.currency)} · ${formatDate(transaction.timestamp)}${
        transaction.note ? `\n${transaction.note}` : ""
      }`,
      [
        { text: "Change category", onPress: () => setRecategorizingId(transaction.id) },
        { text: "Delete", style: "destructive", onPress: () => removeTransaction(transaction) },
        { text: "Close", style: "cancel" },
      ],
    );
  };

  const recategorizeTransaction = async (transaction: ExpenseEntry, category: string) => {
    try {
      setSavingId(transaction.id);
      const updated = await updateExpenseCategory(transaction.id, category);
      setTransactions((current) => current.map((item) => item.id === updated.id ? updated : item));
      setRecategorizingId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update category");
    } finally {
      setSavingId("");
    }
  };

  const ignoreTransaction = async (item: PendingTransaction) => {
    try {
      setSavingId(item.id);
      await ignorePendingTransaction(item.id);
      setPending((current) => current.filter((pendingItem) => pendingItem.id !== item.id));
      setEditingId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to ignore transaction");
    } finally {
      setSavingId("");
    }
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
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            colors={[colors.primary]}
            onRefresh={() => void refreshAll()}
            refreshing={refreshing || syncingRemote}
            tintColor={colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <PageHeader
          right={
            <>
              {Platform.OS === "android" ? (
                <IconButton
                  accessibilityLabel="Scan bank SMS"
                  disabled={scanning}
                  icon="chatbubble-ellipses-outline"
                  onPress={() => void refreshSms()}
                />
              ) : null}
              <IconButton
                accessibilityLabel="Sync with cloud"
                disabled={syncingRemote}
                icon="cloud-upload-outline"
                onPress={() => void syncCloud()}
              />
            </>
          }
          subtitle="This month"
          title="Activity"
        />

        <Card style={styles.summaryCard}>
          <SummaryItem label="Money in" tone="income" value={formatCurrency(monthIncome)} />
          <View style={styles.summaryDivider} />
          <SummaryItem label="Money out" tone="expense" value={formatCurrency(monthExpense)} />
        </Card>

        {error ? <Banner message={error} onPress={() => void loadData()} /> : null}
        {message ? <Banner message={message} tone="info" /> : null}

        {Platform.OS === "android" && !hasPermission ? (
          <Card style={styles.permissionCard}>
            <IconBadge color={colors.primary} icon="chatbubble-ellipses-outline" surface={colors.primarySurface} />
            <View style={styles.flex}>
              <Text style={styles.cardTitle}>Import from bank SMS</Text>
              <Text style={styles.cardText}>You approve every transaction before it's saved.</Text>
            </View>
            <Button label="Allow" onPress={() => void requestPermissions()} style={styles.smallButton} />
          </Card>
        ) : null}

        {pending.length ? (
          <View style={styles.section}>
            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>Needs review</Text>
              <View style={styles.countBadge}>
                <Text style={styles.countText}>{pending.length}</Text>
              </View>
            </View>
            {pending.map((item) => {
              const isEditing = editingId === item.id;
              const isSaving = savingId === item.id;
              const category = getTransactionCategory(isEditing ? editing.category : item.category);

              return (
                <Card key={item.id} style={styles.pendingCard}>
                  <View style={styles.pendingHeader}>
                    <IconBadge color={category.color} icon={category.icon} surface={category.surface} />
                    <View style={styles.flex}>
                      <Text numberOfLines={1} style={styles.cardTitle}>{item.merchant}</Text>
                      <Text style={styles.cardText}>{category.label} · {formatDate(item.timestamp)}</Text>
                    </View>
                    <Text style={[styles.pendingAmount, item.type === "credit" && styles.incomeText]}>
                      {item.type === "credit" ? "+" : "−"}{formatCurrency(item.amount, item.currency)}
                    </Text>
                  </View>

                  {isEditing ? (
                    <View style={styles.editBox}>
                      <Segmented
                        onChange={(value) => setEditing((current) => ({ ...current, type: value }))}
                        options={[
                          { label: "Expense", value: "debit" },
                          { label: "Income", value: "credit" },
                        ]}
                        value={editing.type}
                      />
                      <TextInput
                        keyboardType="decimal-pad"
                        onChangeText={(amount) => setEditing((current) => ({ ...current, amount }))}
                        placeholder="Amount"
                        placeholderTextColor={colors.textSoft}
                        style={styles.input}
                        value={editing.amount}
                      />
                      <TextInput
                        onChangeText={(merchant) => setEditing((current) => ({ ...current, merchant }))}
                        placeholder="Merchant or person"
                        placeholderTextColor={colors.textSoft}
                        style={styles.input}
                        value={editing.merchant}
                      />
                      <CategoryPicker
                        onSelect={(category) => setEditing((current) => ({ ...current, category }))}
                        selected={editing.category}
                      />
                    </View>
                  ) : (
                    <Text numberOfLines={2} style={styles.preview}>{item.messagePreview}</Text>
                  )}

                  <View style={styles.actionRow}>
                    <Button
                      label="Confirm"
                      loading={isSaving}
                      onPress={() => void confirmTransaction(item)}
                      style={styles.flex}
                    />
                    <Button
                      disabled={isSaving}
                      label={isEditing ? "Cancel" : "Edit"}
                      onPress={() => isEditing ? setEditingId("") : startEditing(item)}
                      style={styles.flex}
                      variant="secondary"
                    />
                    <Button
                      disabled={isSaving}
                      label="Ignore"
                      onPress={() => void ignoreTransaction(item)}
                      style={styles.flex}
                      variant="danger"
                    />
                  </View>
                </Card>
              );
            })}
          </View>
        ) : null}

        <View style={styles.section}>
          <Segmented
            onChange={setFilter}
            options={[
              { label: "All", value: "all" },
              { label: "Expenses", value: "expense" },
              { label: "Income", value: "income" },
            ]}
            value={filter}
          />
        </View>

        <ScrollView
          contentContainerStyle={styles.chipScroll}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipScrollView}
        >
          <Chip label="All categories" onPress={() => setCategoryFilter("all")} selected={categoryFilter === "all"} />
          {transactionCategories.map((category) => (
            <Chip
              color={category.color}
              icon={category.icon}
              key={category.key}
              label={category.label}
              onPress={() => setCategoryFilter(category.key)}
              selected={categoryFilter === category.key}
            />
          ))}
        </ScrollView>

        {groups.length ? (
          groups.map((group) => (
            <View key={group.key} style={styles.group}>
              <View style={styles.groupHeader}>
                <Text style={styles.groupLabel}>{group.label}</Text>
                <Text style={styles.groupNet}>
                  {group.net >= 0 ? "+" : "−"}{formatCurrency(Math.abs(group.net))}
                </Text>
              </View>
              <Card padded={false}>
                {group.items.map((transaction, index) => (
                  <View key={transaction.id}>
                    <TransactionRow
                      last={index === group.items.length - 1 && recategorizingId !== transaction.id}
                      onPress={savingId === transaction.id ? undefined : () => openTransaction(transaction)}
                      transaction={transaction}
                    />
                    {recategorizingId === transaction.id ? (
                      <View style={[styles.recategorize, index !== group.items.length - 1 && styles.recategorizeDivider]}>
                        <View style={styles.recategorizeHeader}>
                          <Text style={styles.recategorizeLabel}>Move to category</Text>
                          <Ionicons
                            color={colors.textSoft}
                            name="close"
                            onPress={() => setRecategorizingId("")}
                            size={18}
                          />
                        </View>
                        <CategoryPicker
                          onSelect={(category) => void recategorizeTransaction(transaction, category)}
                          selected={transaction.category}
                        />
                      </View>
                    ) : null}
                  </View>
                ))}
              </Card>
            </View>
          ))
        ) : (
          <Card padded={false}>
            <EmptyState
              actionLabel="Add transaction"
              icon="receipt-outline"
              message={
                filter === "all" && categoryFilter === "all"
                  ? "Add your first expense or income to get started."
                  : "Nothing matches these filters."
              }
              onAction={() => router.push("/expense-add")}
              title="No transactions"
            />
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function CategoryPicker({ onSelect, selected }: { onSelect: (value: string) => void; selected: string }) {
  return (
    <View style={styles.pickerWrap}>
      {transactionCategories.map((category) => (
        <Chip
          color={category.color}
          icon={category.icon}
          key={category.key}
          label={category.label}
          onPress={() => onSelect(category.key)}
          selected={selected === category.key}
        />
      ))}
    </View>
  );
}

function SummaryItem({ label, tone, value }: { label: string; tone: "expense" | "income"; value: string }) {
  return (
    <View style={styles.flex}>
      <View style={styles.summaryLabelRow}>
        <View style={[styles.dot, { backgroundColor: tone === "income" ? colors.success : colors.primary }]} />
        <Text style={styles.summaryLabel}>{label}</Text>
      </View>
      <Text adjustsFontSizeToFit numberOfLines={1} style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  actionRow: { flexDirection: "row", gap: 8, marginTop: 14 },
  cardText: { ...type.caption, color: colors.textMuted, marginTop: 3 },
  cardTitle: { color: colors.text, fontSize: 15, fontWeight: "600" },
  center: { alignItems: "center", backgroundColor: colors.background, flex: 1, justifyContent: "center" },
  chipScroll: { gap: 8, paddingHorizontal: 20 },
  chipScrollView: { marginBottom: 8, marginHorizontal: -20 },
  content: { gap: 12, paddingBottom: TAB_BAR_CLEARANCE, paddingHorizontal: 20 },
  countBadge: { backgroundColor: colors.warningSurface, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 3 },
  countText: { color: colors.warning, fontSize: 12, fontWeight: "700" },
  dot: { borderRadius: 4, height: 8, width: 8 },
  editBox: { gap: 10, marginTop: 14 },
  flex: { flex: 1 },
  group: { gap: 8 },
  groupHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 4 },
  groupLabel: { ...type.overline, color: colors.textMuted },
  groupNet: { ...type.caption, color: colors.textSoft, fontVariant: ["tabular-nums"] },
  incomeText: { color: colors.success },
  input: { backgroundColor: colors.backgroundSoft, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, color: colors.text, fontSize: 15, minHeight: 48, paddingHorizontal: 14 },
  pendingAmount: { color: colors.text, fontSize: 15, fontVariant: ["tabular-nums"], fontWeight: "700" },
  pendingCard: { marginBottom: 10 },
  pendingHeader: { alignItems: "center", flexDirection: "row", gap: 12 },
  permissionCard: { alignItems: "center", flexDirection: "row", gap: 12 },
  pickerWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  preview: { ...type.caption, backgroundColor: colors.backgroundSoft, borderRadius: radius.sm, color: colors.textMuted, lineHeight: 17, marginTop: 12, padding: 10 },
  recategorize: { backgroundColor: colors.backgroundSoft, gap: 10, padding: 16 },
  recategorizeDivider: { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
  recategorizeHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  recategorizeLabel: { ...type.overline, color: colors.textMuted },
  screen: { backgroundColor: colors.background, flex: 1 },
  section: { marginTop: 4 },
  sectionRow: { alignItems: "center", flexDirection: "row", gap: 8, marginBottom: 10 },
  sectionTitle: { ...type.heading, color: colors.text },
  smallButton: { minHeight: 38, paddingHorizontal: 16 },
  summaryCard: { flexDirection: "row", gap: 16 },
  summaryDivider: { backgroundColor: colors.border, width: StyleSheet.hairlineWidth },
  summaryLabel: { ...type.caption, color: colors.textMuted },
  summaryLabelRow: { alignItems: "center", flexDirection: "row", gap: 6 },
  summaryValue: { color: colors.text, fontSize: 20, fontVariant: ["tabular-nums"], fontWeight: "700", marginTop: 6 },
});
