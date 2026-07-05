import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useRef } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppHeader } from "../../components/AppHeader";
import { useSmartCaptureCenter } from "../../components/SmartCaptureCenterContext";
import { colors } from "../../styles/theme";

const getParamValue = (value?: string | string[]) =>
  Array.isArray(value) ? value[0] : value;

export default function CreateTab() {
  const captureCenter = useSmartCaptureCenter();
  const params = useLocalSearchParams<{
    assistantAction?: string;
    assistantDescription?: string;
    assistantFeature?: string;
    assistantId?: string;
    assistantName?: string;
  }>();
  const handledAssistantRef = useRef("");

  useFocusEffect(
    useCallback(() => {
      const action = getParamValue(params.assistantAction);
      const feature = getParamValue(params.assistantFeature);
      const id =
        getParamValue(params.assistantId) ||
        `${action || ""}:${feature || ""}:${getParamValue(params.assistantName) || ""}:${
          getParamValue(params.assistantDescription) || ""
        }`;

      if (!action || handledAssistantRef.current === id) {
        return;
      }

      handledAssistantRef.current = id;

      if (action === "open" && feature === "capture") {
        console.log("[AppActions] Navigated to capture from Assistant");
        requestAnimationFrame(() => captureCenter.openQuickCapture());
        return;
      }

      if (action === "log") {
        const name = getParamValue(params.assistantName);
        const description = getParamValue(params.assistantDescription);
        console.log("[AppActions] Opening assistant log capture", { hasDescription: Boolean(description), name });
        requestAnimationFrame(() => captureCenter.openAssistantLogCapture({ description, name }));
      }
    }, [
      captureCenter,
      params.assistantAction,
      params.assistantDescription,
      params.assistantFeature,
      params.assistantId,
      params.assistantName,
    ]),
  );

  return (
    <SafeAreaView edges={["top"]} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <AppHeader title="Capture" />

        <View style={styles.hero}>
          <Text style={styles.kicker}>Save what matters</Text>
          <Text style={styles.title}>Capture a memory, task, reminder, or expense.</Text>
          <Pressable
            accessibilityRole="button"
            style={styles.primaryButton}
            onPress={() => router.push({ pathname: "/add", params: { mode: "personal" } })}
          >
            <Ionicons color={colors.white} name="add" size={20} />
            <Text style={styles.primaryButtonText}>New memory</Text>
          </Pressable>
        </View>

        <View style={styles.optionList}>
          <CaptureOption
            icon="mic-outline"
            title="Voice Note"
            detail="Speak naturally, review the transcript, then save it as memory."
            onPress={captureCenter.openVoiceCapture}
          />
          <CaptureOption
            icon="document-text-outline"
            title="Memory"
            detail="A note, observation, idea, or context you want to keep."
            onPress={() => router.push({ pathname: "/add", params: { mode: "personal" } })}
          />
          <CaptureOption
            icon="checkbox-outline"
            title="Task"
            detail="A work item or follow-up that needs attention."
            onPress={() => router.push({ pathname: "/add", params: { mode: "task" } })}
          />
          <CaptureOption
            icon="notifications-outline"
            title="Reminder"
            detail="Something you want Memory to bring back later."
            onPress={() => router.push({ pathname: "/add", params: { mode: "reminder" } })}
          />
          <CaptureOption
            icon="wallet-outline"
            title="Expense"
            detail="Cash, UPI, income, or a transaction that needs logging."
            onPress={() => router.push("/expense-add")}
          />
          <CaptureOption
            icon="images-outline"
            title="Screenshot"
            detail="Review captured screenshots before saving them."
            onPress={() => router.push("/screenshots")}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

type CaptureOptionProps = {
  detail: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  title: string;
};

function CaptureOption({ detail, icon, onPress, title }: CaptureOptionProps) {
  return (
    <Pressable accessibilityRole="button" style={styles.optionRow} onPress={onPress}>
      <View style={styles.optionIcon}>
        <Ionicons color={colors.primary} name={icon} size={21} />
      </View>
      <View style={styles.optionCopy}>
        <Text style={styles.optionTitle}>{title}</Text>
        <Text numberOfLines={2} style={styles.optionDetail}>
          {detail}
        </Text>
      </View>
      <Ionicons color={colors.textSoft} name="chevron-forward" size={18} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: 118,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  hero: {
    backgroundColor: colors.black,
    borderRadius: 22,
    marginBottom: 18,
    padding: 20,
  },
  kicker: {
    color: "rgba(255,255,255,0.68)",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0,
    marginBottom: 8,
    textTransform: "uppercase",
  },
  optionCopy: {
    flex: 1,
  },
  optionDetail: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
    marginTop: 3,
  },
  optionIcon: {
    alignItems: "center",
    backgroundColor: colors.backgroundSoft,
    borderRadius: 14,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  optionList: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden",
  },
  optionRow: {
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 76,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  optionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900",
  },
  primaryButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.primary,
    borderRadius: 999,
    flexDirection: "row",
    gap: 8,
    minHeight: 50,
    paddingHorizontal: 18,
  },
  primaryButtonText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: "900",
  },
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  title: {
    color: colors.white,
    fontSize: 30,
    fontWeight: "900",
    lineHeight: 36,
    marginBottom: 20,
    maxWidth: 310,
  },
});
