import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ScreenHeader } from "../components/ScreenHeader";
import { useAuth } from "../context/AuthContext";
import {
  hasExpenseSmsPermissions,
  requestExpenseSmsPermissions,
  scanRecentSms,
} from "../services/expenses";
import { colors, subtleShadow } from "../styles/theme";

export default function SettingsScreen() {
  const { session, signOut } = useAuth();
  const [permission, setPermission] = useState(false);
  const [loading, setLoading] = useState(Platform.OS === "android");
  const [message, setMessage] = useState("");

  const loadPermission = useCallback(async () => {
    if (Platform.OS !== "android") {
      return;
    }

    setLoading(true);
    try {
      setPermission(await hasExpenseSmsPermissions());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPermission();
  }, [loadPermission]);

  const enableSms = async () => {
    try {
      setLoading(true);
      const granted = await requestExpenseSmsPermissions();
      setPermission(granted);
      setMessage(granted ? "SMS import is enabled." : "SMS permission was not granted.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to request SMS permission.");
    } finally {
      setLoading(false);
    }
  };

  const scanSms = async () => {
    try {
      setLoading(true);
      const result = await scanRecentSms(100);
      setMessage(
        result.matched
          ? `${result.matched} transaction${result.matched === 1 ? "" : "s"} ready for review.`
          : `Checked ${result.scanned} messages. No new transactions found.`,
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to scan SMS.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView edges={["top"]} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenHeader mode="back" title="Settings" />
        <View style={styles.intro}>
          <Text style={styles.title}>Finance settings</Text>
          <Text style={styles.subtitle}>Signed in as {session?.user.username || "user"}. Manage local storage, cloud sync, and bank SMS access.</Text>
        </View>

        <View style={styles.panel}>
          <View style={styles.row}>
            <View style={styles.iconBubble}>
              <Ionicons color={colors.primary} name="cloud-done-outline" size={20} />
            </View>
            <View style={styles.rowCopy}>
              <Text style={styles.rowTitle}>Transaction sync</Text>
              <Text style={styles.rowDetail}>Transactions save locally first. Use cloud sync from the Transactions screen when you want to update MongoDB.</Text>
            </View>
            <Ionicons color={colors.success} name="checkmark-circle" size={20} />
          </View>

          <View style={styles.row}>
            <View style={styles.iconBubble}>
              <Ionicons color={colors.accent} name="chatbubble-ellipses-outline" size={20} />
            </View>
            <View style={styles.rowCopy}>
              <Text style={styles.rowTitle}>Bank SMS import</Text>
              <Text style={styles.rowDetail}>
                {Platform.OS === "android"
                  ? permission
                    ? "Enabled. New alerts wait here for your review."
                    : "Disabled. Allow access to review transaction alerts."
                  : "Available in the Android app build. Manual entry and bill scanning work here."}
              </Text>
            </View>
            {Platform.OS === "android" ? (
              loading ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <Pressable style={styles.smallButton} onPress={() => void enableSms()}>
                  <Text style={styles.smallButtonText}>{permission ? "Enabled" : "Allow"}</Text>
                </Pressable>
              )
            ) : null}
          </View>
        </View>

        {Platform.OS === "android" && permission ? (
          <Pressable disabled={loading} style={styles.actionButton} onPress={() => void scanSms()}>
            {loading ? <ActivityIndicator color={colors.white} /> : <Ionicons color={colors.white} name="refresh-outline" size={18} />}
            <Text style={styles.actionButtonText}>Scan recent SMS now</Text>
          </Pressable>
        ) : null}

        {message ? <Text style={styles.message}>{message}</Text> : null}

        <Pressable
          style={styles.logoutButton}
          onPress={() => void signOut()}
        >
          <Text style={styles.logoutText}>Log out</Text>
        </Pressable>

        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Back to money</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  actionButton: { alignItems: "center", backgroundColor: colors.primary, borderRadius: 999, flexDirection: "row", gap: 8, justifyContent: "center", minHeight: 48, paddingHorizontal: 18 },
  actionButtonText: { color: colors.white, fontSize: 14, fontWeight: "900" },
  backButton: { alignItems: "center", paddingVertical: 14 },
  backButtonText: { color: colors.primary, fontSize: 14, fontWeight: "900" },
  content: { gap: 16, paddingBottom: 38, paddingHorizontal: 16, paddingTop: 10 },
  iconBubble: { alignItems: "center", backgroundColor: colors.backgroundSoft, borderRadius: 13, height: 42, justifyContent: "center", width: 42 },
  intro: { marginBottom: 3 },
  message: { color: colors.primary, fontSize: 13, fontWeight: "800", textAlign: "center" },
  logoutButton: { alignItems: "center", borderColor: colors.danger, borderRadius: 999, borderWidth: 1, minHeight: 46, justifyContent: "center", marginTop: 4 },
  logoutText: { color: colors.danger, fontSize: 14, fontWeight: "900" },
  panel: { ...subtleShadow, backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 20, borderWidth: 1, overflow: "hidden" },
  row: { alignItems: "center", borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: "row", gap: 11, padding: 14 },
  rowCopy: { flex: 1 },
  rowDetail: { color: colors.textMuted, fontSize: 12, fontWeight: "600", lineHeight: 17, marginTop: 3 },
  rowTitle: { color: colors.text, fontSize: 15, fontWeight: "900" },
  screen: { backgroundColor: colors.background, flex: 1 },
  smallButton: { backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 8 },
  smallButtonText: { color: colors.white, fontSize: 12, fontWeight: "900" },
  subtitle: { color: colors.textMuted, fontSize: 14, fontWeight: "600", lineHeight: 21, marginTop: 6 },
  title: { color: colors.text, fontSize: 30, fontWeight: "900" },
});
