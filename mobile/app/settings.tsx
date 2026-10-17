import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ScreenHeader } from "../components/ScreenHeader";
import { Banner, IconBadge, type IconName } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import {
  hasExpenseSmsPermissions,
  requestExpenseSmsPermissions,
  scanRecentSms,
} from "../services/expenses";
import { colors, radius, type } from "../styles/theme";

export default function SettingsScreen() {
  const { session, signOut } = useAuth();
  const [permission, setPermission] = useState(false);
  const [loading, setLoading] = useState(Platform.OS === "android");
  const [message, setMessage] = useState("");
  const isAndroid = Platform.OS === "android";
  const username = session?.user.username || "User";

  const loadPermission = useCallback(async () => {
    if (!isAndroid) {
      return;
    }

    setLoading(true);
    try {
      setPermission(await hasExpenseSmsPermissions());
    } finally {
      setLoading(false);
    }
  }, [isAndroid]);

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
          ? `${result.matched} transaction${result.matched === 1 ? "" : "s"} ready for review in Activity.`
          : `Checked ${result.scanned} messages. No new transactions found.`,
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to scan SMS.");
    } finally {
      setLoading(false);
    }
  };

  const confirmSignOut = () => {
    Alert.alert("Log out?", "You can sign back in any time.", [
      { text: "Cancel", style: "cancel" },
      { text: "Log out", style: "destructive", onPress: () => void signOut() },
    ]);
  };

  return (
    <SafeAreaView edges={["top"]} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenHeader title="Settings" />

        <View style={styles.profile}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{username.slice(0, 1).toUpperCase()}</Text>
          </View>
          <View style={styles.flex}>
            <Text style={styles.profileName}>{username}</Text>
            <Text style={styles.profileMeta}>Personal account</Text>
          </View>
        </View>

        {message ? <Banner message={message} tone="info" /> : null}

        <Text style={styles.groupLabel}>Data</Text>
        <View style={styles.group}>
          <SettingRow
            detail="Saved on device first, then synced to the cloud."
            icon="cloud-done-outline"
            right={<Ionicons color={colors.success} name="checkmark-circle" size={20} />}
            title="Cloud sync"
          />
          <SettingRow
            detail={
              isAndroid
                ? permission
                  ? "On · new bank alerts wait in Activity for review"
                  : "Off · allow access to detect transactions"
                : "Available on Android"
            }
            icon="chatbubble-ellipses-outline"
            last={!(isAndroid && permission)}
            onPress={isAndroid && !permission && !loading ? () => void enableSms() : undefined}
            right={
              isAndroid ? (
                loading ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Text style={[styles.status, permission && styles.statusOn]}>{permission ? "On" : "Allow"}</Text>
                )
              ) : null
            }
            title="Bank SMS import"
          />
          {isAndroid && permission ? (
            <SettingRow
              icon="refresh-outline"
              last
              onPress={loading ? undefined : () => void scanSms()}
              right={<Ionicons color={colors.textSoft} name="chevron-forward" size={18} />}
              title="Scan recent SMS now"
            />
          ) : null}
        </View>

        <Text style={styles.groupLabel}>Account</Text>
        <View style={styles.group}>
          <SettingRow danger icon="log-out-outline" last onPress={confirmSignOut} title="Log out" />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SettingRow({
  danger,
  detail,
  icon,
  last,
  onPress,
  right,
  title,
}: {
  danger?: boolean;
  detail?: string;
  icon: IconName;
  last?: boolean;
  onPress?: () => void;
  right?: React.ReactNode;
  title: string;
}) {
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.row, !last && styles.rowDivider, pressed && styles.pressed]}
    >
      <IconBadge
        color={danger ? colors.danger : colors.text}
        icon={icon}
        size={36}
        surface={danger ? colors.dangerSurface : colors.surfaceMuted}
      />
      <View style={styles.flex}>
        <Text style={[styles.rowTitle, danger && styles.danger]}>{title}</Text>
        {detail ? <Text style={styles.rowDetail}>{detail}</Text> : null}
      </View>
      {right}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  avatar: { alignItems: "center", backgroundColor: colors.primary, borderRadius: radius.pill, height: 56, justifyContent: "center", width: 56 },
  avatarText: { color: colors.white, fontSize: 22, fontWeight: "700" },
  content: { gap: 12, paddingBottom: 40, paddingHorizontal: 20 },
  danger: { color: colors.danger },
  flex: { flex: 1 },
  group: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  groupLabel: { ...type.overline, color: colors.textMuted, marginLeft: 4, marginTop: 12 },
  pressed: { backgroundColor: colors.backgroundSoft },
  profile: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, flexDirection: "row", gap: 14, marginTop: 8, padding: 16 },
  profileMeta: { ...type.caption, color: colors.textMuted, marginTop: 3 },
  profileName: { ...type.heading, color: colors.text },
  row: { alignItems: "center", flexDirection: "row", gap: 12, minHeight: 60, paddingHorizontal: 16, paddingVertical: 12 },
  rowDetail: { ...type.caption, color: colors.textMuted, lineHeight: 17, marginTop: 2 },
  rowDivider: { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
  rowTitle: { color: colors.text, fontSize: 15, fontWeight: "500" },
  screen: { backgroundColor: colors.background, flex: 1 },
  status: { ...type.label, color: colors.primary, fontWeight: "600" },
  statusOn: { color: colors.success },
});
