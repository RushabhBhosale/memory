import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { goBack, ScreenHeader } from "../components/ScreenHeader";
import { Button, Chip } from "../components/ui";
import { investmentTypes } from "../constants/investmentTypes";
import { addInvestment, type InvestmentAssetType } from "../services/investments";
import { colors, radius, type } from "../styles/theme";
import { formatCurrency } from "../utils/localization";

type FormState = {
  averagePrice: string;
  currentPrice: string;
  name: string;
  quantity: string;
  symbol: string;
  type: InvestmentAssetType;
};

const toNumber = (value: string) => Number.parseFloat(value.replace(/,/g, ""));

export default function InvestmentAddScreen() {
  const [form, setForm] = useState<FormState>({
    averagePrice: "",
    currentPrice: "",
    name: "",
    quantity: "",
    symbol: "",
    type: "equity",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const update = (patch: Partial<FormState>) => {
    setForm((current) => ({ ...current, ...patch }));
    if (error) setError("");
  };

  const quantity = toNumber(form.quantity);
  const averagePrice = toNumber(form.averagePrice);
  // Current price defaults to the buy price so a new holding can be added with three fields.
  const currentPrice = form.currentPrice.trim() ? toNumber(form.currentPrice) : averagePrice;
  const previewValue = Number.isFinite(quantity) && Number.isFinite(currentPrice) ? quantity * currentPrice : 0;

  const save = async () => {
    if (!form.name.trim()) {
      setError("Add an investment name.");
      return;
    }
    if (![averagePrice, currentPrice, quantity].every((value) => Number.isFinite(value) && value >= 0) || quantity <= 0) {
      setError("Enter a valid quantity and price.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      await addInvestment({
        averagePrice,
        currentPrice,
        name: form.name,
        quantity,
        symbol: form.symbol,
        type: form.type,
      });
      goBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save investment");
      setSaving(false);
    }
  };

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <View style={styles.headerWrap}>
          <ScreenHeader icon="close" title="New investment" />
        </View>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.sectionLabel}>Type</Text>
          <View style={styles.typeRow}>
            {investmentTypes.map((item) => (
              <Chip
                color={item.color}
                icon={item.icon}
                key={item.key}
                label={item.label}
                onPress={() => update({ type: item.key })}
                selected={form.type === item.key}
              />
            ))}
          </View>

          <Text style={styles.sectionLabel}>Details</Text>
          <View style={styles.group}>
            <Field label="Name" onChangeText={(name) => update({ name })} placeholder="Nifty 50 Index Fund" value={form.name} />
            <Field autoCapitalize="characters" label="Symbol" onChangeText={(symbol) => update({ symbol })} placeholder="Optional" value={form.symbol} />
          </View>

          <View style={styles.group}>
            <Field keyboardType="decimal-pad" label="Quantity" onChangeText={(quantity) => update({ quantity })} placeholder="0" value={form.quantity} />
            <Field keyboardType="decimal-pad" label="Buy price" onChangeText={(averagePrice) => update({ averagePrice })} placeholder="₹0" value={form.averagePrice} />
            <Field keyboardType="decimal-pad" label="Current price" last onChangeText={(currentPrice) => update({ currentPrice })} placeholder="Same as buy" value={form.currentPrice} />
          </View>

          {previewValue > 0 ? (
            <View style={styles.preview}>
              <Text style={styles.previewLabel}>Current value</Text>
              <Text style={styles.previewValue}>{formatCurrency(previewValue)}</Text>
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.footer}>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button label="Add to portfolio" loading={saving} onPress={() => void save()} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({
  label,
  last,
  ...props
}: React.ComponentProps<typeof TextInput> & { label: string; last?: boolean }) {
  return (
    <View style={[styles.field, !last && styles.fieldDivider]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput placeholderTextColor={colors.textSoft} style={styles.fieldInput} {...props} />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 24, paddingHorizontal: 20, paddingTop: 12 },
  error: { ...type.label, color: colors.danger, marginBottom: 10, textAlign: "center" },
  field: { alignItems: "center", flexDirection: "row", gap: 12, minHeight: 54, paddingHorizontal: 16 },
  fieldDivider: { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
  fieldInput: { color: colors.text, flex: 1, fontSize: 16, paddingVertical: 12, textAlign: "right" },
  fieldLabel: { color: colors.text, fontSize: 15, fontWeight: "500", width: 110 },
  flex: { flex: 1 },
  footer: { backgroundColor: colors.background, borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, paddingBottom: 8, paddingHorizontal: 20, paddingTop: 12 },
  group: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, marginBottom: 16 },
  headerWrap: { paddingHorizontal: 20 },
  preview: { alignItems: "center", backgroundColor: colors.primarySurface, borderRadius: radius.lg, flexDirection: "row", justifyContent: "space-between", padding: 16 },
  previewLabel: { ...type.label, color: colors.primary },
  previewValue: { color: colors.primary, fontSize: 18, fontVariant: ["tabular-nums"], fontWeight: "700" },
  screen: { backgroundColor: colors.background, flex: 1 },
  sectionLabel: { ...type.overline, color: colors.textMuted, marginBottom: 12 },
  typeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 24 },
});
