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

import { AppHeader, HeaderIcon } from "../../components/AppHeader";
import {
  confirmPendingTransaction,
  deleteExpense,
  fetchRemoteExpensePage,
  hasExpenseSmsPermissions,
  ignorePendingTransaction,
  listPendingTransactions,
  listLocalExpenses,
  mergeExpenseEntries,
  requestExpenseSmsPermissions,
  scanRecentSms,
  subscribeToExpenseChanges,
  syncExpensesToMongo,
  type ExpenseEntry,
  type PendingTransaction,
  type PendingTransactionType,
} from "../../services/expenses";
import { colors, subtleShadow } from "../../styles/theme";
import { formatCurrency, formatDate } from "../../utils/localization";

const categories = ["food", "shopping", "travel", "bills", "salary", "general"];
const REMOTE_PAGE_SIZE = 50;

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
  const [hasPermission, setHasPermission] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [remotePage, setRemotePage] = useState(0);
  const [remoteHasMore, setRemoteHasMore] = useState(false);
  const [syncingRemote, setSyncingRemote] = useState(false);
  const [savingId, setSavingId] = useState("");
  const [editingId, setEditingId] = useState("");
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
        const nextTransactions = await listLocalExpenses();
        setTransactions(nextTransactions);
        void Promise.all([
          Platform.OS === "android" ? listPendingTransactions() : Promise.resolve([]),
          Platform.OS === "android" ? hasExpenseSmsPermissions() : Promise.resolve(false),
        ]).then(([nextPending, permission]) => {
          setPending(nextPending.filter((item) => item.status === "pending").reverse());
          setHasPermission(permission);
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load transactions");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [],
  );

  const syncCloud = async (page = 1) => {
    try {
      setSyncingRemote(true);
      setError("");
      const remote = await fetchRemoteExpensePage(page, REMOTE_PAGE_SIZE);
      const local = await listLocalExpenses();

      setTransactions((current) =>
        mergeExpenseEntries(page === 1 ? local : current, remote.data),
      );
      setRemotePage(remote.page);
      setRemoteHasMore(remote.hasMore);
      void syncExpensesToMongo(local).catch(() => undefined);
      setMessage(`Cloud sync complete · page ${remote.page} of ${Math.max(remote.totalPages, 1)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sync transactions");
    } finally {
      setSyncingRemote(false);
    }
  };

  const refreshAll = async () => {
    await loadData({ refreshing: true });
    await syncCloud(1);
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
    () =>
      transactions.filter((item) => filter === "all" || item.type === filter),
    [filter, transactions],
  );
  const monthIncome = transactions
    .filter((item) => item.type === "income" && isThisMonth(item.timestamp))
    .reduce((total, item) => total + item.amount, 0);
  const monthExpense = transactions
    .filter((item) => item.type === "expense" && isThisMonth(item.timestamp))
    .reduce((total, item) => total + item.amount, 0);

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
      `${transaction.merchant} • ${formatCurrency(transaction.amount, transaction.currency)}`,
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
      <SafeAreaView edges={["top"]} style={styles.screen}>
        <View style={styles.centerState}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.mutedText}>Loading local transactions…</Text>
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
            onRefresh={() => void refreshAll()}
            refreshing={refreshing || syncingRemote}
            tintColor={colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <AppHeader
          title="Transactions"
          rightIcons={
            <>
              {Platform.OS === "android" ? (
                <HeaderIcon name="refresh-outline" onPress={() => void refreshSms()} />
              ) : null}
              <HeaderIcon name="cloud-upload-outline" onPress={() => void syncCloud(1)} />
              <HeaderIcon name="add-outline" onPress={() => router.push("/expense-add")} />
            </>
          }
        />

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {Platform.OS === "android" && !hasPermission ? (
          <View style={styles.permissionPanel}>
            <View style={styles.permissionIcon}>
              <Ionicons color={colors.accent} name="chatbubble-ellipses-outline" size={20} />
            </View>
            <View style={styles.permissionCopy}>
              <Text style={styles.panelTitle}>Import bank transaction SMS</Text>
              <Text style={styles.panelText}>You review every detected item before it becomes a transaction.</Text>
            </View>
            <Pressable style={styles.smallButton} onPress={() => void requestPermissions()}>
              <Text style={styles.smallButtonText}>Allow</Text>
            </Pressable>
          </View>
        ) : null}

        {message ? <Text style={styles.messageText}>{message}</Text> : null}

        <View style={styles.summaryGrid}>
          <SummaryCard label="This month in" value={formatCurrency(monthIncome)} tone="income" />
          <SummaryCard label="This month out" value={formatCurrency(monthExpense)} tone="expense" />
        </View>

        {pending.length ? (
          <View style={styles.panel}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Needs review</Text>
              <Text style={styles.sectionCaption}>{pending.length}</Text>
            </View>
            {pending.map((item) => {
              const isEditing = editingId === item.id;
              const isSaving = savingId === item.id;

              return (
                <View key={item.id} style={styles.pendingCard}>
                  <View style={styles.pendingHeader}>
                    <Text style={styles.pendingAmount}>{formatCurrency(item.amount, item.currency)}</Text>
                    <Text style={styles.pendingType}>{item.type === "credit" ? "Income" : "Expense"}</Text>
                  </View>
                  {isEditing ? (
                    <View style={styles.editBox}>
                      <TextInput
                        keyboardType="decimal-pad"
                        onChangeText={(amount) => setEditing((current) => ({ ...current, amount }))}
                        placeholder="Amount"
                        style={styles.input}
                        value={editing.amount}
                      />
                      <TextInput
                        onChangeText={(merchant) => setEditing((current) => ({ ...current, merchant }))}
                        placeholder="Merchant or person"
                        style={styles.input}
                        value={editing.merchant}
                      />
                      <ChipPicker
                        options={categories}
                        selected={editing.category}
                        onSelect={(category) => setEditing((current) => ({ ...current, category }))}
                      />
                      <ChipPicker
                        options={["debit", "credit"]}
                        labels={{ credit: "Income", debit: "Expense" }}
                        selected={editing.type}
                        onSelect={(type) => setEditing((current) => ({ ...current, type: type as PendingTransactionType }))}
                      />
                    </View>
                  ) : (
                    <>
                      <Text style={styles.transactionTitle}>{item.merchant}</Text>
                      <Text style={styles.transactionMeta}>{item.category} • {formatDate(item.timestamp)}</Text>
                    </>
                  )}
                  <Text numberOfLines={2} style={styles.previewText}>{item.messagePreview}</Text>
                  <View style={styles.actionRow}>
                    <Pressable disabled={isSaving} style={styles.primaryAction} onPress={() => void confirmTransaction(item)}>
                      <Text style={styles.primaryActionText}>{isSaving ? "Saving…" : "Confirm"}</Text>
                    </Pressable>
                    <Pressable disabled={isSaving} style={styles.secondaryAction} onPress={() => void ignoreTransaction(item)}>
                      <Text style={styles.secondaryActionText}>Ignore</Text>
                    </Pressable>
                    <Pressable disabled={isSaving} style={styles.secondaryAction} onPress={() => isEditing ? setEditingId("") : startEditing(item)}>
                      <Text style={styles.secondaryActionText}>{isEditing ? "Cancel" : "Edit"}</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}

        <View style={styles.filterRow}>
          {(["all", "expense", "income"] as const).map((value) => (
            <Pressable
              key={value}
              style={[styles.filterChip, filter === value && styles.filterChipSelected]}
              onPress={() => setFilter(value)}
            >
              <Text style={[styles.filterText, filter === value && styles.filterTextSelected]}>
                {value === "all" ? "All" : value === "income" ? "Income" : "Expenses"}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.panel}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Ledger</Text>
            <Text style={styles.sectionCaption}>{visibleTransactions.length}</Text>
          </View>
          {visibleTransactions.length ? (
            visibleTransactions.map((transaction) => (
              <TransactionRow
                key={transaction.id}
                saving={savingId === transaction.id}
                transaction={transaction}
                onDelete={() => removeTransaction(transaction)}
              />
            ))
          ) : (
            <View style={styles.emptyState}>
              <Ionicons color={colors.textSoft} name="receipt-outline" size={28} />
              <Text style={styles.mutedText}>No {filter === "all" ? "" : `${filter} `}transactions yet.</Text>
              <Pressable style={styles.primaryButton} onPress={() => router.push("/expense-add")}>
                <Text style={styles.primaryActionText}>Add transaction</Text>
              </Pressable>
            </View>
          )}
          {remoteHasMore ? (
            <Pressable
              disabled={syncingRemote}
              onPress={() => void syncCloud(remotePage + 1)}
              style={styles.loadMoreButton}
            >
              {syncingRemote ? <ActivityIndicator color={colors.primary} /> : null}
              <Text style={styles.loadMoreText}>{syncingRemote ? "Loading…" : "Load more from cloud"}</Text>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SummaryCard({ label, tone, value }: { label: string; tone: "expense" | "income"; value: string }) {
  return (
    <View style={styles.summaryCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, tone === "income" ? styles.incomeAmount : styles.expenseAmount]}>
        {value}
      </Text>
    </View>
  );
}

function ChipPicker({
  labels,
  onSelect,
  options,
  selected,
}: {
  labels?: Record<string, string>;
  onSelect: (value: string) => void;
  options: string[];
  selected: string;
}) {
  return (
    <View style={styles.chipRow}>
      {options.map((option) => (
        <Pressable key={option} style={[styles.chip, selected === option && styles.selectedChip]} onPress={() => onSelect(option)}>
          <Text style={[styles.chipText, selected === option && styles.selectedChipText]}>
            {labels?.[option] || option}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function TransactionRow({
  onDelete,
  saving,
  transaction,
}: {
  onDelete: () => void;
  saving: boolean;
  transaction: ExpenseEntry;
}) {
  const isIncome = transaction.type === "income";

  return (
    <View style={styles.transactionRow}>
      <View style={[styles.transactionIcon, isIncome ? styles.incomeSurface : styles.expenseSurface]}>
        <Ionicons color={isIncome ? colors.success : colors.primary} name={isIncome ? "arrow-down-outline" : "arrow-up-outline"} size={18} />
      </View>
      <View style={styles.transactionCopy}>
        <Text numberOfLines={1} style={styles.transactionTitle}>{transaction.merchant}</Text>
        <Text numberOfLines={1} style={styles.transactionMeta}>{transaction.category} • {formatDate(transaction.timestamp)}</Text>
        {transaction.note ? <Text numberOfLines={1} style={styles.noteText}>{transaction.note}</Text> : null}
      </View>
      <View style={styles.amountCopy}>
        <Text style={isIncome ? styles.incomeAmount : styles.expenseAmount}>
          {isIncome ? "+" : "−"}{formatCurrency(transaction.amount, transaction.currency)}
        </Text>
        <Pressable disabled={saving} onPress={onDelete} style={styles.deleteButton}>
          <Ionicons color={colors.danger} name="trash-outline" size={17} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  actionRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  amountCopy: { alignItems: "flex-end", gap: 8 },
  centerState: { alignItems: "center", flex: 1, gap: 10, justifyContent: "center" },
  chip: { backgroundColor: colors.backgroundSoft, borderColor: colors.border, borderRadius: 999, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 7 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 8 },
  chipText: { color: colors.textMuted, fontSize: 12, fontWeight: "800" },
  content: { gap: 16, paddingBottom: 122, paddingHorizontal: 16, paddingTop: 10 },
  deleteButton: { padding: 2 },
  emptyState: { alignItems: "center", gap: 8, padding: 22 },
  errorText: { color: colors.danger, fontSize: 13, fontWeight: "800" },
  expenseAmount: { color: colors.primary, fontSize: 14, fontWeight: "900" },
  expenseSurface: { backgroundColor: "#E7F5F2" },
  editBox: { marginTop: 10 },
  filterChip: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 999, borderWidth: 1, paddingHorizontal: 15, paddingVertical: 9 },
  filterChipSelected: { backgroundColor: colors.black, borderColor: colors.black },
  filterRow: { flexDirection: "row", gap: 8 },
  filterText: { color: colors.textMuted, fontSize: 13, fontWeight: "800" },
  filterTextSelected: { color: colors.white },
  incomeAmount: { color: colors.success, fontSize: 14, fontWeight: "900" },
  incomeSurface: { backgroundColor: colors.successSurface },
  input: { backgroundColor: colors.backgroundSoft, borderColor: colors.border, borderRadius: 12, borderWidth: 1, color: colors.text, fontSize: 14, marginTop: 8, paddingHorizontal: 12, paddingVertical: 10 },
  loadMoreButton: { alignItems: "center", borderTopColor: colors.border, borderTopWidth: 1, flexDirection: "row", gap: 8, justifyContent: "center", marginTop: 6, paddingTop: 15 },
  loadMoreText: { color: colors.primary, fontSize: 13, fontWeight: "900" },
  messageText: { color: colors.primary, fontSize: 13, fontWeight: "800" },
  metricLabel: { color: colors.textMuted, fontSize: 12, fontWeight: "800" },
  metricValue: { fontSize: 19, fontWeight: "900", marginTop: 5 },
  mutedText: { color: colors.textMuted, fontSize: 13, fontWeight: "600", textAlign: "center" },
  panel: { ...subtleShadow, backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 20, borderWidth: 1, overflow: "hidden", padding: 15 },
  panelText: { color: colors.textMuted, fontSize: 12, fontWeight: "600", lineHeight: 17, marginTop: 4 },
  panelTitle: { color: colors.text, fontSize: 14, fontWeight: "900" },
  pendingAmount: { color: colors.text, fontSize: 20, fontWeight: "900" },
  pendingCard: { borderTopColor: colors.border, borderTopWidth: 1, marginTop: 13, paddingTop: 13 },
  pendingHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  pendingType: { color: colors.accent, fontSize: 12, fontWeight: "900" },
  permissionCopy: { flex: 1 },
  permissionIcon: { alignItems: "center", backgroundColor: colors.accentSurface, borderRadius: 12, height: 40, justifyContent: "center", width: 40 },
  permissionPanel: { alignItems: "center", backgroundColor: colors.accentSurface, borderColor: "#FED7AA", borderRadius: 17, borderWidth: 1, flexDirection: "row", gap: 10, padding: 13 },
  primaryAction: { alignItems: "center", backgroundColor: colors.primary, borderRadius: 999, flex: 1, justifyContent: "center", minHeight: 38, paddingHorizontal: 13 },
  primaryActionText: { color: colors.white, fontSize: 12, fontWeight: "900" },
  primaryButton: { alignItems: "center", backgroundColor: colors.primary, borderRadius: 999, marginTop: 10, paddingHorizontal: 16, paddingVertical: 11 },
  screen: { backgroundColor: colors.background, flex: 1 },
  secondaryAction: { alignItems: "center", backgroundColor: colors.backgroundSoft, borderRadius: 999, justifyContent: "center", minHeight: 38, paddingHorizontal: 12 },
  secondaryActionText: { color: colors.text, fontSize: 12, fontWeight: "900" },
  sectionCaption: { color: colors.textMuted, fontSize: 12, fontWeight: "800" },
  sectionHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: "900" },
  selectedChip: { backgroundColor: colors.primary, borderColor: colors.primary },
  selectedChipText: { color: colors.white },
  smallButton: { backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
  smallButtonText: { color: colors.white, fontSize: 12, fontWeight: "900" },
  summaryCard: { ...subtleShadow, backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 18, borderWidth: 1, flex: 1, padding: 15 },
  summaryGrid: { flexDirection: "row", gap: 12 },
  noteText: { color: colors.textSoft, fontSize: 11, fontWeight: "600", marginTop: 3 },
  previewText: { color: colors.textMuted, fontSize: 12, fontWeight: "600", lineHeight: 17, marginTop: 9 },
  transactionCopy: { flex: 1 },
  transactionIcon: { alignItems: "center", borderRadius: 12, height: 38, justifyContent: "center", width: 38 },
  transactionMeta: { color: colors.textMuted, fontSize: 11, fontWeight: "600", marginTop: 4 },
  transactionRow: { alignItems: "center", borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: "row", gap: 10, minHeight: 74, paddingVertical: 11 },
  transactionTitle: { color: colors.text, fontSize: 14, fontWeight: "900" },
});
