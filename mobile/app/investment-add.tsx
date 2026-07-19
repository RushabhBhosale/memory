import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ScreenHeader } from "../components/ScreenHeader";
import { investmentTypes } from "../constants/investmentTypes";
import { addInvestment, type InvestmentAssetType } from "../services/investments";
import { colors, subtleShadow } from "../styles/theme";

type FormState = {
  averagePrice: string;
  currentPrice: string;
  name: string;
  quantity: string;
  symbol: string;
  type: InvestmentAssetType;
};

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

  const save = async () => {
    const averagePrice = Number.parseFloat(form.averagePrice);
    const currentPrice = Number.parseFloat(form.currentPrice);
    const quantity = Number.parseFloat(form.quantity);

    if (!form.name.trim()) {
      setError("Add an investment name.");
      return;
    }
    if (![averagePrice, currentPrice, quantity].every((value) => Number.isFinite(value) && value >= 0) || quantity <= 0) {
      setError("Enter a valid quantity, buy price, and current price.");
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
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save investment");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView edges={["top"]} style={styles.screen}>
      <KeyboardAvoidingView behavior="padding" style={styles.keyboardView}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <ScreenHeader mode="back" title="Add investment" />
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>Investment details</Text>
            <Text style={styles.formMeta}>Track value and profit locally. You can update prices by replacing a holding later.</Text>

            <Text style={styles.label}>Asset type</Text>
            <View style={styles.typeGrid}>
              {investmentTypes.map((type) => (
                <Pressable
                  key={type.key}
                  onPress={() => setForm((current) => ({ ...current, type: type.key }))}
                  style={[styles.typeChip, form.type === type.key && styles.typeChipSelected]}
                >
                  <Ionicons color={form.type === type.key ? colors.white : type.color} name={type.icon} size={17} />
                  <Text style={[styles.typeLabel, form.type === type.key && styles.typeLabelSelected]}>{type.label}</Text>
                </Pressable>
              ))}
            </View>

            <Field label="Investment name" onChangeText={(name) => setForm((current) => ({ ...current, name }))} placeholder="e.g. Nifty 50 Index Fund" value={form.name} />
            <Field autoCapitalize="characters" label="Symbol (optional)" onChangeText={(symbol) => setForm((current) => ({ ...current, symbol }))} placeholder="e.g. NIFTYBEES" value={form.symbol} />
            <View style={styles.fieldRow}>
              <View style={styles.halfField}>
                <Field keyboardType="decimal-pad" label="Quantity" onChangeText={(quantity) => setForm((current) => ({ ...current, quantity }))} placeholder="0" value={form.quantity} />
              </View>
              <View style={styles.halfField}>
                <Field keyboardType="decimal-pad" label="Average price" onChangeText={(averagePrice) => setForm((current) => ({ ...current, averagePrice }))} placeholder="₹0" value={form.averagePrice} />
              </View>
            </View>
            <Field keyboardType="decimal-pad" label="Current price" onChangeText={(currentPrice) => setForm((current) => ({ ...current, currentPrice }))} placeholder="₹0" value={form.currentPrice} />

            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            <Pressable disabled={saving} onPress={() => void save()} style={[styles.saveButton, saving && styles.disabledButton]}>
              {saving ? <ActivityIndicator color={colors.white} /> : <Text style={styles.saveButtonText}>Add to portfolio</Text>}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, ...props }: React.ComponentProps<typeof TextInput> & { label: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput placeholderTextColor={colors.textSoft} style={styles.input} {...props} />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 40, paddingHorizontal: 16, paddingTop: 8 },
  disabledButton: { opacity: 0.65 },
  errorText: { color: colors.danger, fontSize: 13, fontWeight: "700", marginBottom: 12 },
  field: { marginTop: 16 },
  fieldRow: { flexDirection: "row", gap: 10 },
  formCard: { ...subtleShadow, backgroundColor: colors.surface, borderRadius: 12, padding: 17 },
  formMeta: { color: colors.textMuted, fontSize: 13, lineHeight: 19, marginTop: 5 },
  formTitle: { color: colors.text, fontSize: 20, fontWeight: "800" },
  halfField: { flex: 1 },
  input: { backgroundColor: colors.backgroundSoft, borderColor: colors.border, borderRadius: 10, borderWidth: 1, color: colors.text, fontSize: 15, fontWeight: "600", minHeight: 48, paddingHorizontal: 13, paddingVertical: 12 },
  keyboardView: { flex: 1 },
  label: { color: colors.text, fontSize: 12, fontWeight: "700", marginBottom: 7 },
  saveButton: { alignItems: "center", backgroundColor: colors.primary, borderRadius: 10, justifyContent: "center", marginTop: 20, minHeight: 49 },
  saveButtonText: { color: colors.white, fontSize: 14, fontWeight: "800" },
  screen: { backgroundColor: colors.background, flex: 1 },
  typeChip: { alignItems: "center", backgroundColor: colors.backgroundSoft, borderColor: colors.border, borderRadius: 9, borderWidth: 1, flexDirection: "row", gap: 6, paddingHorizontal: 10, paddingVertical: 9 },
  typeChipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  typeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 2, marginTop: 9 },
  typeLabel: { color: colors.textMuted, fontSize: 12, fontWeight: "700" },
  typeLabelSelected: { color: colors.white },
});

