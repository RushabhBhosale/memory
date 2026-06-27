import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ScreenHeader } from "../components/ScreenHeader";
import {
  addManualExpense,
  syncExpensesToMongo,
  type ExpenseType,
} from "../services/expenses";
import { colors, subtleShadow } from "../styles/theme";

const categories = ["food", "shopping", "travel", "bills", "general"];

type ManualExpenseState = {
  amount: string;
  category: string;
  merchant: string;
  note: string;
  type: ExpenseType;
};

export default function ExpenseAddScreen() {
  const [expense, setExpense] = useState<ManualExpenseState>({
    amount: "",
    category: "general",
    merchant: "",
    note: "",
    type: "expense",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const saveManualExpense = async () => {
    const amount = Number.parseFloat(expense.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter a valid amount.");
      return;
    }

    if (!expense.merchant.trim()) {
      setError("Add a merchant, person, or source name.");
      return;
    }

    try {
      setSaving(true);
      setError("");

      const created = await addManualExpense({
        amount,
        category: expense.category,
        merchant: expense.merchant.trim(),
        note: expense.note.trim(),
        type: expense.type,
      });

      void syncExpensesToMongo([created]).catch(() => undefined);

      Alert.alert("Saved", "Transaction added.", [
        {
          text: "OK",
          onPress: () => router.back(),
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add transaction");
    } finally {
      setSaving(false);
    }
  };

  if (Platform.OS !== "android") {
    return (
      <SafeAreaView edges={["top"]} style={styles.screen}>
        <View style={styles.centerState}>
          <Text style={styles.title}>Add transaction</Text>
          <Text style={styles.mutedText}>Manual expense entry is available in the Android app build.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top"]} style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <ScreenHeader mode="back" title="Add Transaction" />

          <View style={styles.formPanel}>
            <View style={styles.formHeader}>
              <View style={styles.formIcon}>
                <Ionicons color={colors.primary} name="receipt-outline" size={18} />
              </View>
              <View style={styles.formCopy}>
                <Text style={styles.formTitle}>Manual entry</Text>
                <Text style={styles.formMeta}>
                  Add cash, UPI, income, or anything SMS detection missed.
                </Text>
              </View>
            </View>

            <View style={styles.segmentedControl}>
              {(["expense", "income"] as const).map((type) => (
                <Pressable
                  key={type}
                  style={[
                    styles.segmentButton,
                    expense.type === type && styles.segmentButtonSelected,
                  ]}
                  onPress={() => setExpense((current) => ({ ...current, type }))}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      expense.type === type && styles.segmentTextSelected,
                    ]}
                  >
                    {type === "income" ? "Income" : "Expense"}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.label}>Amount</Text>
            <TextInput
              keyboardType="decimal-pad"
              onChangeText={(value) => setExpense((current) => ({ ...current, amount: value }))}
              placeholder="0"
              placeholderTextColor={colors.textSoft}
              style={styles.input}
              value={expense.amount}
            />

            <Text style={styles.label}>Merchant or person</Text>
            <TextInput
              onChangeText={(value) => setExpense((current) => ({ ...current, merchant: value }))}
              placeholder="Cash, Friend, Swiggy, Salary..."
              placeholderTextColor={colors.textSoft}
              style={styles.input}
              value={expense.merchant}
            />

            <Text style={styles.label}>Category</Text>
            <View style={styles.chipRow}>
              {categories.map((category) => (
                <Pressable
                  key={category}
                  style={[styles.chip, expense.category === category && styles.selectedChip]}
                  onPress={() => setExpense((current) => ({ ...current, category }))}
                >
                  <Text
                    style={[
                      styles.chipText,
                      expense.category === category && styles.selectedChipText,
                    ]}
                  >
                    {category}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.label}>Note</Text>
            <TextInput
              multiline
              onChangeText={(value) => setExpense((current) => ({ ...current, note: value }))}
              placeholder="Optional context"
              placeholderTextColor={colors.textSoft}
              style={[styles.input, styles.noteInput]}
              value={expense.note}
            />

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <Pressable
              disabled={saving}
              onPress={() => void saveManualExpense()}
              style={[styles.primaryButton, saving && styles.disabledButton]}
            >
              {saving ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <>
                  <Text style={styles.primaryButtonText}>Save transaction</Text>
                  <Ionicons color={colors.white} name="checkmark" size={17} />
                </>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
    paddingVertical: 9,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 18,
  },
  chipText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "capitalize",
  },
  content: {
    paddingBottom: 36,
    paddingHorizontal: 22,
    paddingTop: 18,
  },
  disabledButton: {
    opacity: 0.72,
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18,
    marginBottom: 14,
  },
  formCopy: {
    flex: 1,
  },
  formHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    marginBottom: 20,
  },
  formIcon: {
    alignItems: "center",
    backgroundColor: colors.accentSurface,
    borderRadius: 999,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  formMeta: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  formPanel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
    ...subtleShadow,
  },
  formTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 2,
  },
  input: {
    backgroundColor: colors.backgroundSoft,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    color: colors.text,
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 16,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  keyboardView: {
    flex: 1,
  },
  label: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 8,
  },
  mutedText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
    textAlign: "center",
  },
  noteInput: {
    minHeight: 92,
    textAlignVertical: "top",
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: colors.black,
    borderRadius: 999,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 18,
    paddingVertical: 13,
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
  segmentedControl: {
    backgroundColor: colors.backgroundSoft,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    marginBottom: 18,
    padding: 4,
  },
  segmentButton: {
    alignItems: "center",
    borderRadius: 999,
    flex: 1,
    paddingVertical: 10,
  },
  segmentButtonSelected: {
    backgroundColor: colors.black,
  },
  segmentText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "900",
  },
  segmentTextSelected: {
    color: colors.white,
  },
  selectedChip: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  selectedChipText: {
    color: colors.white,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "900",
  },
});
