import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ScreenHeader } from "../components/ScreenHeader";
import {
  getSmsTrackingDebugStatus,
  testRecentSmsTracking,
  type SmsTrackingDebugMessage,
  type SmsTrackingDebugStatus,
} from "../services/expenses";
import { colors } from "../styles/theme";

const formatDateTime = (timestamp?: number | null) => {
  if (!timestamp) {
    return "Not recorded";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(timestamp));
};

const formatCurrency = (amount: number, currency = "INR") =>
  new Intl.NumberFormat("en-IN", {
    currency,
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    style: "currency",
  }).format(amount);

export default function SmsTrackingDebugScreen() {
  const [status, setStatus] = useState<SmsTrackingDebugStatus | null>(null);
  const [messages, setMessages] = useState<SmsTrackingDebugMessage[]>([]);
  const [scanned, setScanned] = useState(0);
  const [matched, setMatched] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState("");

  const loadStatus = useCallback(async (options?: { refreshing?: boolean }) => {
    try {
      if (options?.refreshing) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError("");

      if (Platform.OS !== "android") {
        setStatus(null);
        return;
      }

      setStatus(await getSmsTrackingDebugStatus());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load SMS tracking status.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadStatus();
    }, [loadStatus]),
  );

  const runTest = async () => {
    try {
      setTesting(true);
      setError("");
      setMessages([]);
      setScanned(0);
      setMatched(0);

      const result = await testRecentSmsTracking(10);
      setMessages(result.messages);
      setScanned(result.scanned);
      setMatched(result.matched);
      await loadStatus({ refreshing: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to test SMS tracking.");
    } finally {
      setTesting(false);
    }
  };

  if (Platform.OS !== "android") {
    return (
      <SafeAreaView edges={["top"]} style={styles.screen}>
        <View style={styles.centerState}>
          <ScreenHeader mode="back" title="SMS Tracking Status" />
          <Text style={styles.emptyText}>SMS tracking diagnostics are Android only.</Text>
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
            refreshing={refreshing}
            tintColor={colors.primary}
            onRefresh={() => void loadStatus({ refreshing: true })}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader mode="back" title="SMS Tracking Status" />

        {loading ? (
          <View style={styles.loadingPanel}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.mutedText}>Checking SMS tracking...</Text>
          </View>
        ) : (
          <>
            <View style={styles.statusPanel}>
              <View style={styles.statusHeader}>
                <View>
                  <Text style={styles.panelEyebrow}>Current tracking status</Text>
                  <Text
                    style={[
                      styles.statusTitle,
                      status?.trackingStatus === "Running" && styles.runningText,
                    ]}
                  >
                    {status?.trackingStatus ?? "Stopped"}
                  </Text>
                </View>
                <View
                  style={[
                    styles.statusIcon,
                    status?.trackingStatus === "Running" && styles.statusIconRunning,
                  ]}
                >
                  <Ionicons
                    color={status?.trackingStatus === "Running" ? colors.success : colors.danger}
                    name={status?.trackingStatus === "Running" ? "pulse" : "pause-circle-outline"}
                    size={22}
                  />
                </View>
              </View>

              <StatusRow
                label="SMS permission status"
                value={status?.permissionGranted ? "Granted" : "Denied"}
              />
              <StatusRow
                label="SMS tracking enabled"
                value={status?.trackingEnabled ? "Enabled" : "Disabled"}
              />
              <StatusRow label="Last SMS scan time" value={formatDateTime(status?.lastSmsScanTime)} />
              <StatusRow
                label="Last detected expense time"
                value={formatDateTime(status?.lastDetectedExpenseTime)}
              />
              <StatusRow
                label="Last processed SMS ID"
                value={status?.lastProcessedSmsId || "Not recorded"}
              />
              <StatusRow
                label="Total expenses detected from SMS"
                value={String(status?.totalExpensesDetectedFromSms ?? 0)}
              />
            </View>

            {error ? (
              <View style={styles.errorPanel}>
                <Ionicons color={colors.danger} name="warning-outline" size={18} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <Pressable disabled={testing} style={styles.primaryButton} onPress={() => void runTest()}>
              {testing ? (
                <ActivityIndicator color={colors.white} size="small" />
              ) : (
                <Ionicons color={colors.white} name="bug-outline" size={19} />
              )}
              <Text style={styles.primaryButtonText}>
                {testing ? "Testing SMS Tracking" : "Test SMS Tracking"}
              </Text>
            </Pressable>

            <View style={styles.resultsHeader}>
              <Text style={styles.sectionTitle}>Latest SMS Parser Test</Text>
              <Text style={styles.sectionMeta}>
                {scanned ? `${matched} of ${scanned} would be detected` : "No test run yet"}
              </Text>
            </View>

            {messages.length ? (
              messages.map((message) => <MessageResult key={message.id} message={message} />)
            ) : (
              <View style={styles.emptyPanel}>
                <Text style={styles.emptyText}>
                  Run the test to parse the latest 10 SMS messages without saving anything.
                </Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statusRow}>
      <Text style={styles.statusLabel}>{label}</Text>
      <Text style={styles.statusValue}>{value}</Text>
    </View>
  );
}

function MessageResult({ message }: { message: SmsTrackingDebugMessage }) {
  return (
    <View style={styles.messageCard}>
      <View style={styles.messageHeader}>
        <View style={styles.messageTitleWrap}>
          <Text style={styles.senderText}>{message.sender}</Text>
          <Text style={styles.messageMeta}>
            SMS {message.id} · {formatDateTime(message.timestamp)}
          </Text>
        </View>
        <View style={[styles.resultPill, message.matched && styles.resultPillMatched]}>
          <Text style={[styles.resultText, message.matched && styles.resultTextMatched]}>
            {message.matched ? "Detected" : "Skipped"}
          </Text>
        </View>
      </View>

      <Text style={styles.previewText}>{message.bodyPreview}</Text>
      <Text style={styles.reasonText}>Reason: {message.reason}</Text>

      {message.transaction ? (
        <View style={styles.transactionBox}>
          <Text style={styles.transactionText}>
            {formatCurrency(message.transaction.amount, message.transaction.currency)} ·{" "}
            {message.transaction.type === "credit" ? "Income" : "Expense"}
          </Text>
          <Text style={styles.transactionMeta}>
            {message.transaction.merchant} · {message.transaction.category} · confidence{" "}
            {Math.round(message.transaction.confidence * 100)}%
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  centerState: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  content: {
    paddingBottom: 34,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  emptyPanel: {
    alignItems: "center",
    backgroundColor: colors.backgroundSoft,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    padding: 18,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
    textAlign: "center",
  },
  errorPanel: {
    alignItems: "flex-start",
    backgroundColor: colors.dangerSurface,
    borderColor: "#FECACA",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 9,
    marginBottom: 14,
    padding: 12,
  },
  errorText: {
    color: colors.danger,
    flex: 1,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18,
  },
  loadingPanel: {
    alignItems: "center",
    gap: 12,
    paddingVertical: 80,
  },
  messageCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 12,
    padding: 14,
  },
  messageHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  messageMeta: {
    color: colors.textSoft,
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 16,
  },
  messageTitleWrap: {
    flex: 1,
    gap: 3,
  },
  mutedText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: "800",
  },
  panelEyebrow: {
    color: colors.textSoft,
    fontSize: 12,
    fontWeight: "900",
    lineHeight: 16,
    textTransform: "uppercase",
  },
  previewText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 19,
    marginTop: 12,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 14,
    flexDirection: "row",
    gap: 9,
    justifyContent: "center",
    marginBottom: 20,
    minHeight: 52,
    paddingHorizontal: 16,
  },
  primaryButtonText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: "900",
  },
  reasonText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 17,
    marginTop: 8,
  },
  resultPill: {
    backgroundColor: colors.dangerSurface,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  resultPillMatched: {
    backgroundColor: colors.successSurface,
  },
  resultText: {
    color: colors.danger,
    fontSize: 11,
    fontWeight: "900",
  },
  resultTextMatched: {
    color: colors.success,
  },
  resultsHeader: {
    marginBottom: 12,
  },
  runningText: {
    color: colors.success,
  },
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  sectionMeta: {
    color: colors.textSoft,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 17,
    marginTop: 2,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900",
  },
  senderText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 20,
  },
  statusHeader: {
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 16,
  },
  statusIcon: {
    alignItems: "center",
    backgroundColor: colors.dangerSurface,
    borderRadius: 999,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  statusIconRunning: {
    backgroundColor: colors.successSurface,
  },
  statusLabel: {
    color: colors.textMuted,
    flex: 1,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18,
  },
  statusPanel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 14,
    overflow: "hidden",
  },
  statusRow: {
    alignItems: "flex-start",
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  statusTitle: {
    color: colors.danger,
    fontSize: 28,
    fontWeight: "900",
    lineHeight: 34,
  },
  statusValue: {
    color: colors.text,
    flex: 1,
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 18,
    textAlign: "right",
  },
  transactionBox: {
    backgroundColor: colors.backgroundSoft,
    borderRadius: 12,
    marginTop: 10,
    padding: 12,
  },
  transactionMeta: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
    marginTop: 3,
  },
  transactionText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "900",
    lineHeight: 19,
  },
});
