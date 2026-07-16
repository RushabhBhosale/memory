import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ScreenHeader } from "../components/ScreenHeader";
import { scanBillForTransaction } from "../services/billScan";
import { colors, subtleShadow } from "../styles/theme";

export default function CaptureScreen() {
  const [scanning, setScanning] = useState(false);

  const scanBill = async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Camera permission needed", "Allow camera access to scan a bill, or choose manual entry instead.");
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        mediaTypes: ["images"],
        quality: 0.85,
      });

      if (result.canceled || !result.assets[0]?.uri) {
        return;
      }

      setScanning(true);
      const scan = await scanBillForTransaction(result.assets[0].uri);
      const note = scan.amount > 0
        ? "Amount extracted directly from the bill image by AI. Review before saving."
        : "Bill photo captured. Enter the amount manually if AI could not find a clear total.";

      router.push({
        pathname: "/expense-add",
        params: {
          amount: scan.amount > 0 ? String(scan.amount) : "",
          category: scan.category,
          merchant: scan.merchant,
          note,
          type: "expense",
        },
      });
    } catch (err) {
      Alert.alert(
        "Could not scan bill",
        err instanceof Error ? err.message : "Try again or add the transaction manually.",
      );
    } finally {
      setScanning(false);
    }
  };

  return (
    <SafeAreaView edges={["top"]} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenHeader mode="back" title="Capture" />

        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Ionicons color={colors.white} name="scan-outline" size={26} />
          </View>
          <Text style={styles.kicker}>Finance capture</Text>
          <Text style={styles.title}>Turn a bill into a reviewed transaction.</Text>
          <Text style={styles.subtitle}>Take a photo, let AI read the bill image directly, then review it before saving.</Text>
        </View>

        <Pressable disabled={scanning} style={styles.option} onPress={() => void scanBill()}>
          <View style={styles.optionIcon}>
            {scanning ? <ActivityIndicator color={colors.primary} /> : <Ionicons color={colors.primary} name="camera-outline" size={24} />}
          </View>
          <View style={styles.optionCopy}>
            <Text style={styles.optionTitle}>{scanning ? "Reading bill…" : "Scan a bill"}</Text>
            <Text style={styles.optionDetail}>AI reads the image directly and extracts the amount, merchant, and category.</Text>
          </View>
          <Ionicons color={colors.textSoft} name="chevron-forward" size={18} />
        </Pressable>

        <Pressable style={styles.option} onPress={() => router.push("/expense-add")}>
          <View style={styles.optionIcon}>
            <Ionicons color={colors.success} name="create-outline" size={24} />
          </View>
          <View style={styles.optionCopy}>
            <Text style={styles.optionTitle}>Add manually</Text>
            <Text style={styles.optionDetail}>Log an expense or income with a merchant, amount, and note.</Text>
          </View>
          <Ionicons color={colors.textSoft} name="chevron-forward" size={18} />
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14, paddingBottom: 40, paddingHorizontal: 16, paddingTop: 10 },
  hero: { ...subtleShadow, backgroundColor: colors.black, borderRadius: 24, padding: 22 },
  heroIcon: { alignItems: "center", backgroundColor: colors.primary, borderRadius: 14, height: 48, justifyContent: "center", marginBottom: 18, width: 48 },
  kicker: { color: "rgba(255,255,255,0.65)", fontSize: 12, fontWeight: "900", letterSpacing: 0.8, textTransform: "uppercase" },
  option: { ...subtleShadow, alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 20, borderWidth: 1, flexDirection: "row", gap: 13, padding: 16 },
  optionCopy: { flex: 1 },
  optionDetail: { color: colors.textMuted, fontSize: 13, fontWeight: "600", lineHeight: 18, marginTop: 4 },
  optionIcon: { alignItems: "center", backgroundColor: colors.backgroundSoft, borderRadius: 14, height: 48, justifyContent: "center", width: 48 },
  optionTitle: { color: colors.text, fontSize: 17, fontWeight: "900" },
  screen: { backgroundColor: colors.background, flex: 1 },
  subtitle: { color: "rgba(255,255,255,0.72)", fontSize: 14, fontWeight: "600", lineHeight: 21, marginTop: 9 },
  title: { color: colors.white, fontSize: 28, fontWeight: "900", lineHeight: 34, marginTop: 7 },
});
