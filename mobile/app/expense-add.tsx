import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import {
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

import { goBack, ScreenHeader } from "../components/ScreenHeader";
import { Button, Chip, Segmented } from "../components/ui";
import { getCategoriesForType, getTransactionCategory } from "../constants/transactionCategories";
import { addManualExpense, type ExpenseType } from "../services/expenses";
import { colors, radius, type } from "../styles/theme";
import { getDateKey } from "../utils/financeAnalytics";

type DateOption = "today" | "yesterday" | "custom";

const startOfToday = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};

/** Keep the current time of day so entries sort naturally within a day. */
const withCurrentTime = (day: Date) => {
  const now = new Date();
  const result = new Date(day);
  result.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), 0);
  return result.getTime();
};

export default function ExpenseAddScreen() {
  const params = useLocalSearchParams<{ type?: string }>();
  const [kind, setKind] = useState<ExpenseType>(params.type === "income" ? "income" : "expense");
  const [amount, setAmount] = useState("");
  const [merchant, setMerchant] = useState("");
  const [note, setNote] = useState("");
  const [category, setCategory] = useState(kind === "income" ? "salary" : "food");
  const [dateOption, setDateOption] = useState<DateOption>("today");
  const [customDate, setCustomDate] = useState(startOfToday);
  const [showPicker, setShowPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const categories = useMemo(() => getCategoriesForType(kind), [kind]);
  const parsedAmount = Number.parseFloat(amount.replace(/,/g, ""));
  const canSave = Number.isFinite(parsedAmount) && parsedAmount > 0;
  const accent = kind === "income" ? colors.success : colors.text;

  const changeKind = (next: ExpenseType) => {
    setKind(next);
    if (!getCategoriesForType(next).some((item) => item.key === category)) {
      setCategory(next === "income" ? "salary" : "food");
    }
  };

  const getTimestamp = () => {
    if (dateOption === "today") return Date.now();
    if (dateOption === "yesterday") {
      const day = startOfToday();
      day.setDate(day.getDate() - 1);
      return withCurrentTime(day);
    }
    return getDateKey(customDate) === getDateKey(new Date()) ? Date.now() : withCurrentTime(customDate);
  };

  const save = async () => {
    if (!canSave) {
      setError("Enter an amount greater than zero.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      await addManualExpense({
        amount: parsedAmount,
        category,
        merchant: merchant.trim() || getTransactionCategory(category).label,
        note: note.trim(),
        timestamp: getTimestamp(),
        type: kind,
      });
      goBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save transaction");
      setSaving(false);
    }
  };

  const customLabel = dateOption === "custom"
    ? new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" }).format(customDate)
    : "Pick date";

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <View style={styles.headerWrap}>
          <ScreenHeader icon="close" title="New transaction" />
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Segmented
            onChange={changeKind}
            options={[
              { label: "Expense", value: "expense" },
              { label: "Income", value: "income" },
            ]}
            value={kind}
          />

          <View style={styles.amountBlock}>
            <Text style={styles.amountLabel}>Amount</Text>
            <TextInput
              autoFocus
              keyboardType="decimal-pad"
              maxLength={13}
              onChangeText={(value) => {
                const digits = value.replace(/[^0-9.]/g, "");
                // Allow a single decimal point with at most two decimals.
                const [whole, ...rest] = digits.split(".");
                setAmount(rest.length ? `${whole}.${rest.join("").slice(0, 2)}` : whole);
                if (error) setError("");
              }}
              placeholder="₹0"
              placeholderTextColor={colors.borderStrong}
              selectionColor={colors.primary}
              style={[styles.amountInput, { color: accent }]}
              value={amount ? `₹${amount}` : ""}
            />
          </View>

          <View style={styles.fieldCard}>
            <View style={styles.fieldRow}>
              <Ionicons color={colors.textSoft} name={kind === "income" ? "person-outline" : "storefront-outline"} size={18} />
              <TextInput
                onChangeText={setMerchant}
                placeholder={kind === "income" ? "Received from (optional)" : "Paid to (optional)"}
                placeholderTextColor={colors.textSoft}
                returnKeyType="next"
                style={styles.fieldInput}
                value={merchant}
              />
            </View>
            <View style={styles.fieldDivider} />
            <View style={styles.fieldRow}>
              <Ionicons color={colors.textSoft} name="document-text-outline" size={18} />
              <TextInput
                onChangeText={setNote}
                placeholder="Note (optional)"
                placeholderTextColor={colors.textSoft}
                style={styles.fieldInput}
                value={note}
              />
            </View>
          </View>

          <Text style={styles.sectionLabel}>Category</Text>
          <View style={styles.categoryGrid}>
            {categories.map((item) => {
              const selected = item.key === category;
              return (
                <Pressable
                  accessibilityLabel={item.label}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  key={item.key}
                  onPress={() => setCategory(item.key)}
                  style={styles.categoryCell}
                >
                  <View
                    style={[
                      styles.categoryTile,
                      { backgroundColor: selected ? item.color : item.surface },
                    ]}
                  >
                    <Ionicons color={selected ? colors.white : item.color} name={item.icon} size={22} />
                  </View>
                  <Text numberOfLines={1} style={[styles.categoryLabel, selected && styles.categoryLabelSelected]}>
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.sectionLabel}>Date</Text>
          <View style={styles.dateRow}>
            <Chip label="Today" onPress={() => setDateOption("today")} selected={dateOption === "today"} />
            <Chip label="Yesterday" onPress={() => setDateOption("yesterday")} selected={dateOption === "yesterday"} />
            <Chip
              icon="calendar-outline"
              label={customLabel}
              onPress={() => setShowPicker(true)}
              selected={dateOption === "custom"}
            />
          </View>

          {showPicker ? (
            <DateTimePicker
              display={Platform.OS === "ios" ? "inline" : "default"}
              maximumDate={new Date()}
              mode="date"
              onChange={(event, date) => {
                if (Platform.OS !== "ios") setShowPicker(false);
                if (event.type === "set" && date) {
                  setCustomDate(date);
                  setDateOption("custom");
                  if (Platform.OS === "ios") setShowPicker(false);
                }
              }}
              value={customDate}
            />
          ) : null}
        </ScrollView>

        <View style={styles.footer}>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button
            disabled={!canSave}
            label={kind === "income" ? "Save income" : "Save expense"}
            loading={saving}
            onPress={() => void save()}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  amountBlock: { alignItems: "center", paddingBottom: 28, paddingTop: 32 },
  amountInput: { alignSelf: "stretch", fontSize: 52, fontVariant: ["tabular-nums"], fontWeight: "700", letterSpacing: -1.5, marginTop: 8, padding: 0, textAlign: "center" },
  amountLabel: { ...type.label, color: colors.textMuted },
  categoryCell: { alignItems: "center", gap: 6, marginBottom: 14, width: "25%" },
  categoryGrid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -4 },
  categoryLabel: { ...type.caption, color: colors.textMuted },
  categoryLabelSelected: { color: colors.text, fontWeight: "600" },
  categoryTile: { alignItems: "center", borderRadius: radius.lg, height: 54, justifyContent: "center", width: 54 },
  content: { paddingBottom: 24, paddingHorizontal: 20, paddingTop: 4 },
  dateRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  error: { ...type.label, color: colors.danger, marginBottom: 10, textAlign: "center" },
  fieldCard: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, marginBottom: 24 },
  fieldDivider: { backgroundColor: colors.border, height: StyleSheet.hairlineWidth, marginLeft: 46 },
  fieldInput: { color: colors.text, flex: 1, fontSize: 16, minHeight: 52, paddingVertical: 12 },
  fieldRow: { alignItems: "center", flexDirection: "row", gap: 12, paddingHorizontal: 16 },
  flex: { flex: 1 },
  footer: { backgroundColor: colors.background, borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, paddingBottom: 8, paddingHorizontal: 20, paddingTop: 12 },
  headerWrap: { paddingHorizontal: 20 },
  screen: { backgroundColor: colors.background, flex: 1 },
  sectionLabel: { ...type.overline, color: colors.textMuted, marginBottom: 12 },
});
