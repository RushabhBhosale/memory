import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppHeader } from "../../components/AppHeader";
import {
  getJarvisPermissions,
  getJarvisSettings,
  getJarvisStatus,
  askJarvisNow,
  openJarvisBatterySettings,
  pauseJarvisAssistant,
  requestJarvisBatteryOptimizationExemption,
  requestJarvisMicrophonePermission,
  resumeJarvisAssistant,
  startJarvisAssistant,
  stopJarvisAssistant,
  testJarvisWakeWord,
  updateJarvisSettings,
  type JarvisAssistantSettings,
  type JarvisAssistantStatus,
  type JarvisPermissionState,
} from "../../services/jarvisAssistant";
import { requestNotificationPermissions } from "../../services/notifications";
import { colors } from "../../styles/theme";

type BusyKey = "" | "enable" | "wake" | "manual" | "sensitivity" | "speak" | "open" | "ask" | "pause" | "resume" | "test" | "mic" | "notifications" | "battery" | "battery-exempt";

const unavailableStatus: JarvisAssistantStatus = {
  enabled: false,
  lastAnswer: "",
  lastError: "",
  lastTranscript: "",
  message: "Jarvis assistant is Android-only.",
  state: "unavailable",
  wakeWordAvailable: false,
  wakeWordEngine: "manual",
  wakeWordReady: false,
};

const unavailablePermissions: JarvisPermissionState = {
  batteryOptimized: false,
  microphone: false,
  notifications: false,
  speechRecognition: false,
  wakeWordAvailable: false,
  wakeWordEngine: "manual",
  wakeWordError: "Jarvis assistant is Android-only.",
  wakeWordReady: false,
};

const defaultSettings: JarvisAssistantSettings = {
  enabled: false,
  manualModeEnabled: true,
  openAppOnAnswer: false,
  speakAnswers: true,
  wakeKeyword: "jarvis",
  wakePhrase: "Hey Jarvis / Jarvis",
  wakeSensitivity: 0.7,
  wakeWordDetectionEnabled: false,
};

const stateLabel = (state: string) => {
  switch (state) {
    case "listening":
      return "Listening";
    case "ready":
      return "Ready";
    case "recording":
      return "Recording command";
    case "processing":
      return "Asking MemoryOS";
    case "speaking":
      return "Speaking";
    case "paused":
      return "Paused";
    case "error":
      return "Setup needed";
    case "off":
      return "Off";
    default:
      return "Unavailable";
  }
};

const statusText = (value: boolean, positive = "Ready", negative = "Needs setup") =>
  value ? positive : negative;

export default function JarvisAssistantSettingsScreen() {
  const [settings, setSettings] = useState<JarvisAssistantSettings>(defaultSettings);
  const [status, setStatus] = useState<JarvisAssistantStatus>(unavailableStatus);
  const [permissions, setPermissions] = useState<JarvisPermissionState>(unavailablePermissions);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyKey, setBusyKey] = useState<BusyKey>("");

  const loadState = useCallback(async (options?: { refreshing?: boolean }) => {
    if (options?.refreshing) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const [nextSettings, nextStatus, nextPermissions] = await Promise.all([
        getJarvisSettings(),
        getJarvisStatus(),
        getJarvisPermissions(),
      ]);

      setSettings(nextSettings);
      setStatus(nextStatus);
      setPermissions(nextPermissions);
    } catch (err) {
      Alert.alert("Jarvis unavailable", err instanceof Error ? err.message : "Try again.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadState();
    }, [loadState]),
  );

  const runAction = async (key: BusyKey, action: () => Promise<void>) => {
    try {
      setBusyKey(key);
      await action();
      await loadState({ refreshing: true });
    } catch (err) {
      Alert.alert("Jarvis unavailable", err instanceof Error ? err.message : "Try again.");
    } finally {
      setBusyKey("");
    }
  };

  const setEnabled = (enabled: boolean) =>
    runAction("enable", async () => {
      if (!enabled) {
        await stopJarvisAssistant();
        return;
      }

      const hasMic = permissions.microphone || (await requestJarvisMicrophonePermission());

      if (!hasMic) {
        throw new Error("Microphone permission is required before Jarvis can listen.");
      }

      await requestNotificationPermissions().catch(() => false);
      await startJarvisAssistant();
    });

  const updateSetting = (
    key: "wakeWordDetectionEnabled" | "manualModeEnabled" | "speakAnswers" | "openAppOnAnswer",
    value: boolean,
  ) =>
    runAction(
      key === "wakeWordDetectionEnabled"
        ? "wake"
        : key === "manualModeEnabled"
          ? "manual"
          : key === "speakAnswers"
            ? "speak"
            : "open",
      async () => {
      await updateJarvisSettings({ [key]: value });
      },
    );

  if (loading) {
    return (
      <SafeAreaView edges={["top"]} style={styles.screen}>
        <View style={styles.loadingState}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.loadingText}>Loading Jarvis settings...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const androidOnly = Platform.OS !== "android";
  const setupMessage = permissions.wakeWordError || status.lastError || status.message;
  const canPause = settings.enabled && status.state !== "paused";
  const canResume = settings.enabled && status.state === "paused";
  const wakePhrase = settings.wakePhrase || "Hey Jarvis / Jarvis";
  const wakeKeyword = settings.wakeKeyword || "jarvis";
  const wakeSensitivity = Math.round(((settings.wakeSensitivity ?? 0.7) || 0) * 100);

  return (
    <SafeAreaView edges={["top"]} style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            colors={[colors.primary]}
            refreshing={refreshing}
            tintColor={colors.primary}
            onRefresh={() => void loadState({ refreshing: true })}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <AppHeader title="Jarvis Assistant" showBackButton />

        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Ionicons color={colors.white} name="mic-outline" size={24} />
          </View>
          <View style={styles.heroCopy}>
            <Text style={styles.title}>Hey Jarvis</Text>
            <Text style={styles.subtitle}>Free local PocketSphinx wake word with notification fallback.</Text>
          </View>
          <View style={[styles.statePill, settings.enabled && styles.statePillEnabled]}>
            <Text style={[styles.stateText, settings.enabled && styles.stateTextEnabled]}>
              {stateLabel(status.state)}
            </Text>
          </View>
        </View>

        {androidOnly ? (
          <Notice
            icon="logo-android"
            tone="warning"
            title="Android only"
            body="This assistant is disabled on iOS."
          />
        ) : null}

        <View style={styles.panel}>
          <ToggleRow
            busy={busyKey === "enable"}
            detail="Persistent foreground notification and Jarvis controls"
            icon="power-outline"
            title="Enable Jarvis Assistant"
            value={settings.enabled}
            onValueChange={(value) => void setEnabled(value)}
          />
          <ToggleRow
            busy={busyKey === "wake"}
            detail={`Local PocketSphinx trigger for "${wakeKeyword}"`}
            icon="radio-outline"
            title="Wake-word detection"
            value={settings.wakeWordDetectionEnabled}
            onValueChange={(value) => void updateSetting("wakeWordDetectionEnabled", value)}
          />
          <ToggleRow
            busy={busyKey === "manual"}
            detail="Use the Ask Jarvis action from the persistent notification"
            icon="hand-left-outline"
            title="Manual notification mode"
            value={settings.manualModeEnabled}
            onValueChange={(value) => void updateSetting("manualModeEnabled", value)}
          />
          <StaticRow
            detail={`Spoken keyword: ${wakeKeyword}`}
            icon="sparkles-outline"
            status={wakePhrase}
            title="Wake word"
          />
          <SensitivityRow
            busy={busyKey === "sensitivity"}
            value={wakeSensitivity}
            onChange={(nextValue) => void runAction("sensitivity", async () => {
              await updateJarvisSettings({ wakeSensitivity: nextValue / 100 });
            })}
          />
          <ToggleRow
            busy={busyKey === "speak"}
            detail="Read answers aloud after MemoryOS responds"
            icon="volume-high-outline"
            title="Speak answers"
            value={settings.speakAnswers}
            onValueChange={(value) => void updateSetting("speakAnswers", value)}
          />
          <ToggleRow
            busy={busyKey === "open"}
            detail="Bring MemoryOS forward when an answer is ready"
            icon="open-outline"
            title="Open app on answer"
            value={settings.openAppOnAnswer}
            onValueChange={(value) => void updateSetting("openAppOnAnswer", value)}
          />
        </View>

        <View style={styles.actionsRow}>
          <ActionButton
            busy={busyKey === "ask"}
            disabled={!settings.enabled || !settings.manualModeEnabled}
            icon="mic-outline"
            label="Ask Jarvis"
            onPress={() => void runAction("ask", async () => {
              await askJarvisNow();
            })}
          />
          <ActionButton
            busy={busyKey === "pause"}
            disabled={!canPause}
            icon="pause-outline"
            label="Pause"
            onPress={() => void runAction("pause", async () => {
              await pauseJarvisAssistant();
            })}
          />
          <ActionButton
            busy={busyKey === "resume"}
            disabled={!canResume}
            icon="play-outline"
            label="Resume"
            onPress={() => void runAction("resume", async () => {
              await resumeJarvisAssistant();
            })}
          />
          <ActionButton
            busy={busyKey === "test"}
            disabled={androidOnly}
            icon="play-circle-outline"
            label="Test Wake"
            onPress={() => void runAction("test", async () => {
              await testJarvisWakeWord();
            })}
          />
        </View>

        <Text style={styles.sectionTitle}>Setup</Text>
        <View style={styles.panel}>
          <SetupRow
            icon="mic-outline"
            ready={permissions.microphone}
            title="Microphone"
            value={statusText(permissions.microphone, "Allowed", "Needs access")}
            onPress={() => void runAction("mic", async () => {
              await requestJarvisMicrophonePermission();
            })}
          />
          <SetupRow
            icon="notifications-outline"
            ready={permissions.notifications}
            title="Foreground notification"
            value={statusText(permissions.notifications, "Allowed", "Needs access")}
            onPress={() => void runAction("notifications", async () => {
              await requestNotificationPermissions();
            })}
          />
          <SetupRow
            icon="hardware-chip-outline"
            ready={permissions.wakeWordAvailable}
            title="PocketSphinx wake engine"
            value={statusText(permissions.wakeWordAvailable, "Ready", "Manual mode")}
          />
          <SetupRow
            icon="chatbubble-ellipses-outline"
            ready={permissions.speechRecognition}
            title="Speech recognition"
            value={statusText(permissions.speechRecognition, "Available", "Unavailable")}
          />
        </View>

        {!permissions.wakeWordAvailable || status.state === "error" ? (
          <Notice
            icon="construct-outline"
            tone="warning"
            title="Wake-word detection"
            body={setupMessage || "PocketSphinx wake-word detection is unavailable. Manual Jarvis mode is ready."}
          />
        ) : null}

        <Notice
          icon="battery-half-outline"
          tone="warning"
          title="Battery usage"
          body="Android may stop long-running microphone services unless MemoryOS is exempt from battery optimization."
          actionLabel={permissions.batteryOptimized ? "Disable optimization" : "Battery settings"}
          busy={busyKey === "battery" || busyKey === "battery-exempt"}
          onAction={() =>
            void runAction(permissions.batteryOptimized ? "battery-exempt" : "battery", async () => {
              if (permissions.batteryOptimized) {
                await requestJarvisBatteryOptimizationExemption();
              } else {
                await openJarvisBatterySettings();
              }
            })
          }
        />

        <Notice
          icon="shield-checkmark-outline"
          title="Privacy"
          body="MemoryOS does not save raw audio. The command transcript is sent to your MemoryOS API only after the wake word is detected."
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function ToggleRow({
  busy,
  detail,
  icon,
  onValueChange,
  title,
  value,
}: {
  busy?: boolean;
  detail: string;
  icon: keyof typeof Ionicons.glyphMap;
  onValueChange: (value: boolean) => void;
  title: string;
  value: boolean;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowIcon}>
        <Ionicons color={colors.primary} name={icon} size={20} />
      </View>
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text numberOfLines={2} style={styles.rowDetail}>{detail}</Text>
      </View>
      {busy ? (
        <ActivityIndicator color={colors.primary} size="small" />
      ) : (
        <Switch
          ios_backgroundColor={colors.borderStrong}
          thumbColor={colors.white}
          trackColor={{ false: colors.borderStrong, true: colors.primary }}
          value={value}
          onValueChange={onValueChange}
        />
      )}
    </View>
  );
}

function StaticRow({
  detail,
  icon,
  status,
  title,
}: {
  detail: string;
  icon: keyof typeof Ionicons.glyphMap;
  status: string;
  title: string;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowIcon}>
        <Ionicons color={colors.primary} name={icon} size={20} />
      </View>
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text numberOfLines={2} style={styles.rowDetail}>{detail}</Text>
      </View>
      <View style={styles.smallPill}>
        <Text style={styles.smallPillText}>{status}</Text>
      </View>
    </View>
  );
}

function SensitivityRow({
  busy,
  onChange,
  value,
}: {
  busy?: boolean;
  onChange: (value: number) => void;
  value: number;
}) {
  const nextDown = Math.max(10, value - 10);
  const nextUp = Math.min(100, value + 10);

  return (
    <View style={styles.row}>
      <View style={styles.rowIcon}>
        <Ionicons color={colors.primary} name="options-outline" size={20} />
      </View>
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle}>Sensitivity</Text>
        <Text numberOfLines={2} style={styles.rowDetail}>Higher is more likely to wake on quiet speech.</Text>
      </View>
      <View style={styles.stepper}>
        <Pressable
          accessibilityLabel="Decrease wake word sensitivity"
          accessibilityRole="button"
          disabled={busy || value <= 10}
          style={[styles.stepButton, (busy || value <= 10) && styles.stepButtonDisabled]}
          onPress={() => onChange(nextDown)}
        >
          <Ionicons color={value <= 10 ? colors.textSoft : colors.primary} name="remove" size={17} />
        </Pressable>
        <View style={styles.stepValue}>
          {busy ? (
            <ActivityIndicator color={colors.primary} size="small" />
          ) : (
            <Text style={styles.stepValueText}>{value}%</Text>
          )}
        </View>
        <Pressable
          accessibilityLabel="Increase wake word sensitivity"
          accessibilityRole="button"
          disabled={busy || value >= 100}
          style={[styles.stepButton, (busy || value >= 100) && styles.stepButtonDisabled]}
          onPress={() => onChange(nextUp)}
        >
          <Ionicons color={value >= 100 ? colors.textSoft : colors.primary} name="add" size={17} />
        </Pressable>
      </View>
    </View>
  );
}

function SetupRow({
  icon,
  onPress,
  ready,
  title,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  ready: boolean;
  title: string;
  value: string;
}) {
  const content = (
    <>
      <View style={[styles.rowIcon, ready && styles.rowIconReady]}>
        <Ionicons color={ready ? colors.success : colors.primary} name={icon} size={20} />
      </View>
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle}>{title}</Text>
      </View>
      <View style={[styles.statusPill, ready && styles.statusPillReady]}>
        <Text style={[styles.statusPillText, ready && styles.statusPillTextReady]}>{value}</Text>
      </View>
    </>
  );

  if (!onPress) {
    return <View style={styles.row}>{content}</View>;
  }

  return (
    <Pressable accessibilityRole="button" style={styles.row} onPress={onPress}>
      {content}
    </Pressable>
  );
}

function ActionButton({
  busy,
  disabled,
  icon,
  label,
  onPress,
}: {
  busy?: boolean;
  disabled?: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || busy}
      style={[styles.actionButton, disabled && styles.actionButtonDisabled]}
      onPress={onPress}
    >
      {busy ? (
        <ActivityIndicator color={colors.white} size="small" />
      ) : (
        <Ionicons color={disabled ? colors.textSoft : colors.white} name={icon} size={18} />
      )}
      <Text style={[styles.actionButtonText, disabled && styles.actionButtonTextDisabled]}>{label}</Text>
    </Pressable>
  );
}

function Notice({
  actionLabel,
  body,
  busy,
  icon,
  onAction,
  title,
  tone,
}: {
  actionLabel?: string;
  body: string;
  busy?: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  onAction?: () => void;
  title: string;
  tone?: "warning";
}) {
  const warning = tone === "warning";

  return (
    <View style={[styles.notice, warning && styles.noticeWarning]}>
      <View style={[styles.noticeIcon, warning && styles.noticeIconWarning]}>
        <Ionicons color={warning ? colors.accent : colors.primary} name={icon} size={19} />
      </View>
      <View style={styles.noticeCopy}>
        <Text style={styles.noticeTitle}>{title}</Text>
        <Text style={styles.noticeBody}>{body}</Text>
        {actionLabel && onAction ? (
          <Pressable accessibilityRole="button" style={styles.noticeAction} onPress={onAction}>
            {busy ? <ActivityIndicator color={colors.primary} size="small" /> : null}
            <Text style={styles.noticeActionText}>{actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  actionButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 8,
    flex: 1,
    flexDirection: "row",
    gap: 7,
    justifyContent: "center",
    minHeight: 46,
    paddingHorizontal: 10,
  },
  actionButtonDisabled: {
    backgroundColor: colors.surfaceMuted,
  },
  actionButtonText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: "900",
  },
  actionButtonTextDisabled: {
    color: colors.textSoft,
  },
  actionsRow: {
    flexDirection: "row",
    gap: 9,
    marginBottom: 22,
  },
  content: {
    paddingBottom: 40,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  hero: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    marginBottom: 14,
    padding: 14,
  },
  heroCopy: {
    flex: 1,
  },
  heroIcon: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 8,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  loadingState: {
    alignItems: "center",
    flex: 1,
    gap: 10,
    justifyContent: "center",
  },
  loadingText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: "700",
  },
  notice: {
    alignItems: "flex-start",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    marginBottom: 14,
    padding: 14,
  },
  noticeAction: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderColor: colors.borderStrong,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 7,
    marginTop: 12,
    minHeight: 38,
    paddingHorizontal: 12,
  },
  noticeActionText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "900",
  },
  noticeBody: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 19,
    marginTop: 4,
  },
  noticeCopy: {
    flex: 1,
  },
  noticeIcon: {
    alignItems: "center",
    backgroundColor: colors.backgroundSoft,
    borderRadius: 8,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  noticeIconWarning: {
    backgroundColor: colors.accentSurface,
  },
  noticeTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900",
  },
  noticeWarning: {
    borderColor: colors.borderStrong,
  },
  panel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 14,
    overflow: "hidden",
  },
  row: {
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 72,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  rowCopy: {
    flex: 1,
  },
  rowDetail: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
    marginTop: 3,
  },
  rowIcon: {
    alignItems: "center",
    backgroundColor: colors.backgroundSoft,
    borderRadius: 8,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  rowIconReady: {
    backgroundColor: colors.successSurface,
  },
  rowTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900",
  },
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0,
    marginBottom: 10,
    textTransform: "uppercase",
  },
  smallPill: {
    backgroundColor: colors.backgroundSoft,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  smallPillText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "900",
  },
  statePill: {
    backgroundColor: colors.backgroundSoft,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  statePillEnabled: {
    backgroundColor: colors.successSurface,
  },
  stateText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "900",
  },
  stateTextEnabled: {
    color: colors.success,
  },
  stepButton: {
    alignItems: "center",
    backgroundColor: colors.backgroundSoft,
    borderColor: colors.borderStrong,
    borderRadius: 8,
    borderWidth: 1,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  stepButtonDisabled: {
    opacity: 0.45,
  },
  stepValue: {
    alignItems: "center",
    minWidth: 46,
  },
  stepValueText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "900",
  },
  stepper: {
    alignItems: "center",
    flexDirection: "row",
    gap: 7,
  },
  statusPill: {
    backgroundColor: colors.backgroundSoft,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  statusPillReady: {
    backgroundColor: colors.successSurface,
  },
  statusPillText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "900",
  },
  statusPillTextReady: {
    color: colors.success,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
    marginTop: 3,
  },
  title: {
    color: colors.text,
    fontSize: 25,
    fontWeight: "900",
    lineHeight: 31,
  },
});
