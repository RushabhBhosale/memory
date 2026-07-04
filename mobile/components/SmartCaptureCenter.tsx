import { Ionicons } from "@expo/vector-icons";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { router } from "expo-router";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  Vibration,
  View,
} from "react-native";

import {
  classifyCapture,
  type CaptureClassification,
  type CaptureClassificationType,
} from "../services/ai";
import { createMemory, type CreateMemoryInput } from "../services/api";
import { addManualExpense } from "../services/expenses";
import { scheduleMemoryReminder } from "../services/notifications";
import {
  addVoiceTranscriptListener,
  cancelVoiceTranscription,
  captureVoiceWithSystemPrompt,
  hasVoicePermission,
  hasVoiceTranscriptionSupport,
  requestVoicePermission,
  startVoiceTranscription,
  stopVoiceTranscription,
} from "../services/voiceTranscription";
import { colors, subtleShadow } from "../styles/theme";
import { markHomeCacheStale } from "../utils/homeCache";

type CaptureMode = "quick" | "confirm" | "menu" | "expense" | "manual" | "voice";
type ManualCaptureType = "memory" | "task" | "reminder";
type VoiceCapturePhase = "idle" | "checking" | "recording" | "transcribing" | "review" | "saving";

export type SmartCaptureCenterHandle = {
  openMenu: () => void;
  openQuickCapture: () => void;
  openVoiceCapture: () => void;
};

const placeholders = [
  "Need batteries tomorrow evening",
  "Spent ₹320 at Zomato",
  "Thomas changed the Lefu SDK key",
  "Finished the API notes",
];

const menuItems: Array<{
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  type?: ManualCaptureType;
}> = [
  { icon: "mic-outline", label: "Voice Note" },
  { icon: "document-text-outline", label: "Memory", type: "memory" },
  { icon: "checkmark-circle-outline", label: "Task", type: "task" },
  { icon: "notifications-outline", label: "Reminder", type: "reminder" },
  { icon: "wallet-outline", label: "Expense" },
  {
    icon: "camera-outline",
    label: "Screenshot Memory",
  },
];

const manualTypeConfig: Record<
  ManualCaptureType,
  {
    category: string;
    helper: string;
    icon: keyof typeof Ionicons.glyphMap;
    kind: CreateMemoryInput["kind"];
    label: string;
    placeholder: string;
  }
> = {
  memory: {
    category: "personal",
    helper: "Personal note",
    icon: "document-text-outline",
    kind: "note",
    label: "Memory",
    placeholder: "Write the memory",
  },
  reminder: {
    category: "reminder",
    helper: "Notify me later",
    icon: "notifications-outline",
    kind: "note",
    label: "Reminder",
    placeholder: "Need batteries tomorrow at 7 PM",
  },
  task: {
    category: "task",
    helper: "Work task",
    icon: "checkmark-circle-outline",
    kind: "task",
    label: "Task",
    placeholder: "Finish API follow-up",
  },
};

const reminderDateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
const reminderTimeFormatter = new Intl.DateTimeFormat(undefined, { timeStyle: "short" });

const getDefaultReminderAt = () => {
  const date = new Date();
  date.setHours(date.getHours() + 1, 0, 0, 0);
  return date;
};

const mergeDatePart = (current: Date, nextDate: Date) =>
  new Date(
    nextDate.getFullYear(),
    nextDate.getMonth(),
    nextDate.getDate(),
    current.getHours(),
    current.getMinutes(),
    0,
    0,
  );

const mergeTimePart = (current: Date, nextTime: Date) =>
  new Date(
    current.getFullYear(),
    current.getMonth(),
    current.getDate(),
    nextTime.getHours(),
    nextTime.getMinutes(),
    0,
    0,
  );

const getDefaultTitle = (value: string, fallback: string) => {
  const firstLine = value.trim().split("\n")[0]?.trim();
  if (!firstLine) {
    return fallback;
  }
  return firstLine.length > 64 ? `${firstLine.slice(0, 61)}...` : firstLine;
};

const getCaptureKind = (type: CaptureClassificationType) => {
  switch (type) {
    case "Task":
      return "task";
    case "Work Log":
      return "work_done";
    default:
      return "note";
  }
};

const getCaptureCategory = (classification: CaptureClassification) => {
  switch (classification.type) {
    case "Expense":
      return classification.category || "expense";
    case "Reminder":
      return "reminder";
    case "Task":
      return "task";
    case "Work Log":
      return "work";
    default:
      return classification.category || "personal";
  }
};

const parseExpenseDraft = (content: string, classification?: CaptureClassification | null) => {
  const amountMatch = content.match(/(?:₹|rs\.?|inr)?\s*([0-9][0-9,]*(?:\.\d{1,2})?)/i);
  const merchantMatch =
    content.match(/\b(?:at|to|from)\s+([a-z0-9&._ -]{2,32})/i) ||
    content.match(/\b(?:zomato|swiggy|amazon|flipkart|uber|ola|rapido|myntra|jio|airtel)\b/i);
  const amount = amountMatch?.[1]?.replace(/,/g, "") || "";
  const rawMerchant = merchantMatch?.[1] || merchantMatch?.[0] || "";

  return {
    amount,
    category: classification?.category || "general",
    merchant: rawMerchant
      ? rawMerchant.trim().replace(/\b\w/g, (char) => char.toUpperCase())
      : "",
  };
};

export const SmartCaptureCenter = forwardRef<SmartCaptureCenterHandle>((_, ref) => {
  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState<CaptureMode>("quick");
  const [content, setContent] = useState("");
  const [classification, setClassification] = useState<CaptureClassification | null>(null);
  const [saving, setSaving] = useState(false);
  const [manualType, setManualType] = useState<ManualCaptureType>("memory");
  const [manualText, setManualText] = useState("");
  const [priority, setPriority] = useState(3);
  const [reminderAt, setReminderAt] = useState(getDefaultReminderAt);
  const [activePicker, setActivePicker] = useState<"date" | "time" | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voicePhase, setVoicePhase] = useState<VoiceCapturePhase>("idle");
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [expenseDraft, setExpenseDraft] = useState({
    amount: "",
    category: "general",
    merchant: "",
  });
  const scale = useRef(new Animated.Value(0.96)).current;
  const translate = useRef(new Animated.Value(18)).current;
  const keyboardVisibleRef = useRef(false);
  const voiceStartTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const placeholder = placeholders[new Date().getMinutes() % placeholders.length];

  useEffect(() => {
    const showSubscription = Keyboard.addListener("keyboardDidShow", (event) => {
      keyboardVisibleRef.current = true;
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hideSubscription = Keyboard.addListener("keyboardDidHide", () => {
      keyboardVisibleRef.current = false;
      setKeyboardHeight(0);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  useEffect(() => {
    const subscription = addVoiceTranscriptListener((transcript) => {
      setVoiceTranscript(transcript);
    });

    return () => {
      subscription.remove();
      if (voiceStartTimeoutRef.current) {
        clearTimeout(voiceStartTimeoutRef.current);
        voiceStartTimeoutRef.current = null;
      }
      void cancelVoiceTranscription();
    };
  }, []);

  const animateIn = () => {
    scale.setValue(0.96);
    translate.setValue(18);
    Animated.parallel([
      Animated.spring(scale, {
        friction: 8,
        tension: 140,
        toValue: 1,
        useNativeDriver: true,
      }),
      Animated.spring(translate, {
        friction: 8,
        tension: 120,
        toValue: 0,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const open = (nextMode: CaptureMode) => {
    setMode(nextMode);
    setVisible(true);
    requestAnimationFrame(animateIn);
  };

  const resetVoiceCapture = () => {
    setVoiceError(null);
    setVoicePhase("idle");
    setVoiceTranscript("");
  };

  const beginVoiceCapture = async () => {
    try {
      setVoiceError(null);
      setVoiceTranscript("");
      setVoicePhase("checking");

      const supported = await hasVoiceTranscriptionSupport();

      if (!supported) {
        setVoicePhase("idle");
        setVoiceError("Voice capture is not available on this phone.");
        return;
      }

      const hasPermission = await hasVoicePermission();
      const granted = hasPermission || (await requestVoicePermission());

      if (!granted) {
        setVoicePhase("idle");
        setVoiceError("Microphone permission is required for voice notes.");
        return;
      }

      await startVoiceTranscription();
      setVoicePhase("recording");
    } catch (err) {
      setVoicePhase("idle");
      setVoiceError(err instanceof Error ? err.message : "Unable to start voice capture.");
    }
  };

  const beginSystemVoiceCapture = async () => {
    try {
      setVoiceError(null);
      setVoiceTranscript("");
      setVoicePhase("checking");

      const hasPermission = await hasVoicePermission();
      const granted = hasPermission || (await requestVoicePermission());

      if (!granted) {
        setVoicePhase("idle");
        setVoiceError("Microphone permission is required for voice notes.");
        return;
      }

      setVoicePhase("recording");
      const result = await captureVoiceWithSystemPrompt();
      const transcript = result.transcript.trim();

      if (!transcript) {
        setVoicePhase("idle");
        setVoiceError("I did not catch any speech. Try again.");
        return;
      }

      setVoiceTranscript(transcript);
      setVoicePhase("review");
    } catch (err) {
      setVoicePhase("idle");
      const message = err instanceof Error ? err.message : "Unable to start voice capture.";
      setVoiceError(
        message === "Voice note was cancelled."
          ? "Voice note was cancelled."
          : message,
      );
    }
  };

  const stopVoiceCapture = async () => {
    try {
      setVoiceError(null);
      setVoicePhase("transcribing");
      const result = await stopVoiceTranscription();
      const transcript = result.transcript.trim() || voiceTranscript.trim();

      if (!transcript) {
        setVoicePhase("idle");
        setVoiceError("I did not catch any speech. Try again.");
        return;
      }

      setVoiceTranscript(transcript);
      setVoicePhase("review");
    } catch (err) {
      if (voiceTranscript.trim()) {
        setVoicePhase("review");
        return;
      }

      setVoicePhase("idle");
      setVoiceError(err instanceof Error ? err.message : "Unable to transcribe voice note.");
    }
  };

  const openVoiceCapture = () => {
    resetVoiceCapture();
    Vibration.vibrate(12);
    open("voice");
    if (voiceStartTimeoutRef.current) {
      clearTimeout(voiceStartTimeoutRef.current);
    }
    voiceStartTimeoutRef.current = setTimeout(() => {
      voiceStartTimeoutRef.current = null;
      void beginVoiceCapture();
    }, 180);
  };

  const close = () => {
    Keyboard.dismiss();
    if (voiceStartTimeoutRef.current) {
      clearTimeout(voiceStartTimeoutRef.current);
      voiceStartTimeoutRef.current = null;
    }
    void cancelVoiceTranscription();
    Animated.timing(scale, {
      duration: 120,
      toValue: 0.96,
      useNativeDriver: true,
    }).start(() => {
      setVisible(false);
      setMode("quick");
      setClassification(null);
      setSaving(false);
      setActivePicker(null);
      resetVoiceCapture();
    });
  };

  const dismissKeyboardOrClose = () => {
    if (keyboardVisibleRef.current) {
      Keyboard.dismiss();
      return;
    }

    close();
  };

  useImperativeHandle(ref, () => ({
    openMenu: () => {
      Vibration.vibrate(12);
      open("menu");
    },
    openQuickCapture: () => open("quick"),
    openVoiceCapture,
  }));

  const saveVoiceCapture = async () => {
    const transcript = voiceTranscript.trim();

    if (!transcript) {
      setVoiceError("There is no transcript to save yet.");
      return;
    }

    try {
      setVoiceError(null);
      setVoicePhase("saving");
      await createMemory({
        title: getDefaultTitle(transcript, "Voice Note"),
        content: transcript,
        category: "personal",
        tags: ["voice"],
        kind: "note",
        type: "memory",
        source: "voice",
        capturedAt: new Date().toISOString(),
      });
      await markHomeCacheStale();
      await cancelVoiceTranscription();
      close();
    } catch (err) {
      setVoicePhase("review");
      setVoiceError(err instanceof Error ? err.message : "Unable to save voice note.");
    }
  };

  const saveConfirmedCapture = async () => {
    if (!classification || !content.trim()) {
      return;
    }

    try {
      setSaving(true);

      if (classification.type === "Expense") {
        const expense = parseExpenseDraft(content, classification);
        const amount = Number.parseFloat(expense.amount);

        if (!Number.isFinite(amount) || amount <= 0) {
          Alert.alert("Check amount", "I found an expense, but not a valid amount.");
          return;
        }

        await addManualExpense({
          amount,
          category: expense.category,
          merchant: expense.merchant || classification.title,
          note: content.trim(),
        });
        close();
        return;
      }

      const reminderAt =
        classification.type === "Reminder"
          ? new Date(Date.now() + 60 * 60 * 1000).toISOString()
          : undefined;
      const memory = await createMemory({
        title: classification.title,
        content: content.trim(),
        category: getCaptureCategory(classification),
        tags: classification.tags.length ? classification.tags : [classification.type.toLowerCase()],
        kind: getCaptureKind(classification.type),
        notificationEnabled: classification.type === "Reminder",
        reminderAt,
      });

      if (classification.type === "Reminder") {
        await scheduleMemoryReminder(memory);
      }

      await markHomeCacheStale();
      close();
    } catch (err) {
      Alert.alert("Unable to save", err instanceof Error ? err.message : "Try again.");
    } finally {
      setSaving(false);
    }
  };

  const classifyAndReview = async () => {
    const trimmed = content.trim();

    if (!trimmed) {
      return;
    }

    try {
      setSaving(true);
      const nextClassification = await classifyCapture(trimmed);
      setClassification(nextClassification);
      setExpenseDraft(parseExpenseDraft(trimmed, nextClassification));
      setMode("confirm");
      requestAnimationFrame(animateIn);
    } catch (err) {
      Alert.alert("Unable to classify", err instanceof Error ? err.message : "Try again.");
    } finally {
      setSaving(false);
    }
  };

  const saveManualExpense = async () => {
    const amount = Number.parseFloat(expenseDraft.amount.replace(/,/g, ""));

    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert("Check amount", "Enter a valid amount.");
      return;
    }

    try {
      setSaving(true);
      await addManualExpense({
        amount,
        category: expenseDraft.category || "general",
        merchant: expenseDraft.merchant || "Unknown Merchant",
        note: "Quick expense",
      });
      close();
    } catch (err) {
      Alert.alert("Unable to save expense", err instanceof Error ? err.message : "Try again.");
    } finally {
      setSaving(false);
    }
  };

  const openManualCapture = (nextType: ManualCaptureType) => {
    setManualType(nextType);
    setManualText("");
    setPriority(3);
    setReminderAt(getDefaultReminderAt());
    setMode("manual");
    requestAnimationFrame(animateIn);
  };

  const setReminderDatePart = (date?: Date) => {
    if (!date) {
      return;
    }

    setReminderAt((current) => mergeDatePart(current, date));
  };

  const setReminderTimePart = (date?: Date) => {
    if (!date) {
      return;
    }

    setReminderAt((current) => mergeTimePart(current, date));
  };

  const handleAndroidPickerChange = (event: DateTimePickerEvent, date?: Date) => {
    const picker = activePicker;
    setActivePicker(null);

    if (event.type !== "set" || !date) {
      return;
    }

    if (picker === "date") {
      setReminderDatePart(date);
      return;
    }

    if (picker === "time") {
      setReminderTimePart(date);
    }
  };

  const saveManualCapture = async () => {
    const trimmed = manualText.trim();
    const config = manualTypeConfig[manualType];

    if (!trimmed) {
      Alert.alert("Add text", `Write the ${config.label.toLowerCase()} first.`);
      return;
    }

    if (manualType === "reminder" && reminderAt.getTime() <= Date.now()) {
      Alert.alert("Check time", "Reminder time must be in the future.");
      return;
    }

    try {
      setSaving(true);

      const memory = await createMemory({
        title: getDefaultTitle(trimmed, config.label),
        content: trimmed,
        category: config.category,
        tags: [config.category, manualType],
        importance: manualType === "task" ? priority : 3,
        kind: config.kind,
        reminderAt:
          manualType === "reminder" ? reminderAt.toISOString() : undefined,
        notificationEnabled: manualType === "reminder",
        reminderType: manualType === "reminder" ? "time" : undefined,
      });

      if (manualType === "reminder") {
        await scheduleMemoryReminder(memory);
      }

      await markHomeCacheStale();
      close();
    } catch (err) {
      Alert.alert("Unable to save", err instanceof Error ? err.message : "Try again.");
    } finally {
      setSaving(false);
    }
  };

  const renderQuickCapture = () => (
    <>
      <Text style={styles.title}>What's on your mind?</Text>
      <TextInput
        autoFocus
        multiline
        onChangeText={setContent}
        placeholder={placeholder}
        placeholderTextColor={colors.textSoft}
        style={styles.captureInput}
        value={content}
      />
      <View style={styles.actionRow}>
        <Pressable style={styles.secondaryButton} onPress={close}>
          <Text style={styles.secondaryText}>Cancel</Text>
        </Pressable>
        <Pressable
          disabled={saving || !content.trim()}
          style={[styles.primaryButton, (!content.trim() || saving) && styles.disabledButton]}
          onPress={() => void classifyAndReview()}
        >
          {saving ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryText}>Save</Text>}
        </Pressable>
      </View>
    </>
  );

  const renderConfirm = () => {
    const detected = classification || {
      category: "general",
      confidence: 0,
      tags: [],
      title: "Quick Capture",
      type: "Memory" as const,
    };

    return (
      <>
        <Text style={styles.eyebrow}>Detected: {detected.type}</Text>
        <Text style={styles.title}>{detected.title}</Text>
        <View style={styles.reviewBox}>
          <Text style={styles.reviewLabel}>Category</Text>
          <Text style={styles.reviewValue}>{detected.category || "general"}</Text>
          <Text style={styles.reviewLabel}>Tags</Text>
          <Text style={styles.reviewValue}>
            {detected.tags.length ? detected.tags.join(", ") : "quick-capture"}
          </Text>
        </View>
        <View style={styles.actionRow}>
          <Pressable style={styles.secondaryButton} onPress={close}>
            <Text style={styles.secondaryText}>Cancel</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={() => setMode("quick")}>
            <Text style={styles.secondaryText}>Edit</Text>
          </Pressable>
          <Pressable
            disabled={saving}
            style={[styles.primaryButton, saving && styles.disabledButton]}
            onPress={() => void saveConfirmedCapture()}
          >
            {saving ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryText}>Save</Text>}
          </Pressable>
        </View>
      </>
    );
  };

  const renderMenu = () => (
    <>
      <Text style={styles.title}>Capture</Text>
      <View style={styles.menuGrid}>
        {menuItems.map((item) => (
          <Pressable
            key={item.label}
            style={styles.menuItem}
            onPress={() => {
              if (item.label === "Voice Note") {
                openVoiceCapture();
                return;
              }

              if (item.label === "Expense") {
                setExpenseDraft({ amount: "", category: "general", merchant: "" });
                setMode("expense");
                return;
              }

              if (item.label === "Screenshot Memory") {
                close();
                router.push("/screenshots");
                return;
              }

              if (item.type) {
                openManualCapture(item.type);
              }
            }}
          >
            <Ionicons color={colors.primary} name={item.icon} size={20} />
            <Text style={styles.menuText}>{item.label}</Text>
          </Pressable>
        ))}
      </View>
    </>
  );

  const renderPriorityPicker = () => {
    if (manualType !== "task") {
      return null;
    }

    return (
      <>
        <Text style={styles.label}>Priority</Text>
        <View style={styles.segmentRow}>
          {[
            { label: "Low", value: 2 },
            { label: "Normal", value: 3 },
            { label: "High", value: 5 },
          ].map((item) => {
            const selected = priority === item.value;

            return (
              <Pressable
                key={item.label}
                style={[styles.segmentButton, selected && styles.segmentButtonSelected]}
                onPress={() => setPriority(item.value)}
              >
                <Text style={[styles.segmentButtonText, selected && styles.segmentButtonTextSelected]}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </>
    );
  };

  const renderReminderFields = () => {
    if (manualType !== "reminder") {
      return null;
    }

    return (
      <>
        <Text style={styles.label}>Date</Text>
        {Platform.OS === "ios" ? (
          <View style={styles.pickerInline}>
            <DateTimePicker
              accentColor={colors.primary}
              display="compact"
              minimumDate={new Date()}
              mode="date"
              onChange={(_event, date) => setReminderDatePart(date)}
              themeVariant="light"
              value={reminderAt}
            />
          </View>
        ) : (
          <Pressable style={styles.pickerButton} onPress={() => setActivePicker("date")}>
            <Text style={styles.pickerButtonText}>{reminderDateFormatter.format(reminderAt)}</Text>
          </Pressable>
        )}

        <Text style={styles.label}>Time</Text>
        {Platform.OS === "ios" ? (
          <View style={styles.pickerInline}>
            <DateTimePicker
              accentColor={colors.primary}
              display="compact"
              mode="time"
              onChange={(_event, date) => setReminderTimePart(date)}
              themeVariant="light"
              value={reminderAt}
            />
          </View>
        ) : (
          <Pressable style={styles.pickerButton} onPress={() => setActivePicker("time")}>
            <Text style={styles.pickerButtonText}>{reminderTimeFormatter.format(reminderAt)}</Text>
          </Pressable>
        )}

        {Platform.OS !== "ios" && activePicker ? (
          <DateTimePicker
            display={activePicker === "date" ? "calendar" : "clock"}
            minimumDate={activePicker === "date" ? new Date() : undefined}
            mode={activePicker}
            onChange={handleAndroidPickerChange}
            value={reminderAt}
          />
        ) : null}
      </>
    );
  };

  const renderManualCapture = () => {
    const config = manualTypeConfig[manualType];

    return (
      <>
        <View style={styles.manualHeader}>
          <View style={styles.manualIcon}>
            <Ionicons color={colors.primary} name={config.icon} size={20} />
          </View>
          <View style={styles.manualHeaderText}>
            <Text style={styles.eyebrow}>{config.helper}</Text>
            <Text style={styles.title}>{config.label}</Text>
          </View>
        </View>
        <TextInput
          autoFocus
          multiline
          onChangeText={setManualText}
          placeholder={config.placeholder}
          placeholderTextColor={colors.textSoft}
          style={styles.captureInput}
          value={manualText}
        />
        {renderReminderFields()}
        {renderPriorityPicker()}
        <View style={styles.actionRow}>
          <Pressable style={styles.secondaryButton} onPress={() => setMode("menu")}>
            <Text style={styles.secondaryText}>Back</Text>
          </Pressable>
          <Pressable
            disabled={saving || !manualText.trim()}
            style={[styles.primaryButton, (saving || !manualText.trim()) && styles.disabledButton]}
            onPress={() => void saveManualCapture()}
          >
            {saving ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryText}>Save</Text>}
          </Pressable>
        </View>
      </>
    );
  };

  const renderExpense = () => (
    <>
      <Text style={styles.eyebrow}>Quick Expense</Text>
      <Text style={styles.title}>Add expense</Text>
      <TextInput
        keyboardType="decimal-pad"
        onChangeText={(amount) => setExpenseDraft((current) => ({ ...current, amount }))}
        placeholder="Amount"
        placeholderTextColor={colors.textSoft}
        style={styles.input}
        value={expenseDraft.amount}
      />
      <TextInput
        onChangeText={(merchant) => setExpenseDraft((current) => ({ ...current, merchant }))}
        placeholder="Merchant"
        placeholderTextColor={colors.textSoft}
        style={styles.input}
        value={expenseDraft.merchant}
      />
      <TextInput
        onChangeText={(category) => setExpenseDraft((current) => ({ ...current, category }))}
        placeholder="Category"
        placeholderTextColor={colors.textSoft}
        style={styles.input}
        value={expenseDraft.category}
      />
      <View style={styles.actionRow}>
        <Pressable style={styles.secondaryButton} onPress={close}>
          <Text style={styles.secondaryText}>Cancel</Text>
        </Pressable>
        <Pressable
          disabled={saving}
          style={[styles.primaryButton, saving && styles.disabledButton]}
          onPress={() => void saveManualExpense()}
        >
          {saving ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryText}>Save</Text>}
        </Pressable>
      </View>
    </>
  );

  const renderVoiceCapture = () => {
    const isBusy =
      voicePhase === "checking" ||
      voicePhase === "transcribing" ||
      voicePhase === "saving";
    const isRecording = voicePhase === "recording";
    const hasTranscript = voiceTranscript.trim().length > 0;
    const canSave =
      hasTranscript && (voicePhase === "review" || voicePhase === "saving");

    return (
      <>
        <View style={styles.voiceHeader}>
          <View style={[styles.voiceOrb, isRecording && styles.voiceOrbRecording]}>
            {isBusy ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Ionicons
                color={colors.white}
                name={isRecording ? "radio" : "mic"}
                size={26}
              />
            )}
          </View>
          <View style={styles.manualHeaderText}>
            <Text style={styles.eyebrow}>Voice note</Text>
            <Text style={styles.title}>
              {isRecording ? "I'm listening." : canSave ? "Save this memory?" : "Speak naturally."}
            </Text>
          </View>
        </View>

        <View style={styles.voiceBubble}>
          <TextInput
            editable={voicePhase === "review"}
            multiline
            onChangeText={setVoiceTranscript}
            placeholder={
              isRecording
                ? "Your words will appear here..."
                : "Tap Start and say what Memory should keep."
            }
            placeholderTextColor={colors.textSoft}
            style={styles.voiceTranscript}
            textAlignVertical="top"
            value={voiceTranscript}
          />
        </View>

        {voiceError ? <Text style={styles.voiceError}>{voiceError}</Text> : null}

        <View style={styles.actionRow}>
          <Pressable style={styles.secondaryButton} onPress={close}>
            <Text style={styles.secondaryText}>Discard</Text>
          </Pressable>

          {isRecording ? (
            <Pressable style={styles.primaryButton} onPress={() => void stopVoiceCapture()}>
              <Ionicons color={colors.white} name="stop" size={18} />
              <Text style={styles.primaryText}>Stop</Text>
            </Pressable>
          ) : canSave ? (
            <Pressable
              disabled={voicePhase === "saving"}
              style={[styles.primaryButton, voicePhase === "saving" && styles.disabledButton]}
              onPress={() => void saveVoiceCapture()}
            >
              {voicePhase === "saving" ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.primaryText}>Save</Text>
              )}
            </Pressable>
          ) : (
            <Pressable
              disabled={isBusy}
              style={[styles.primaryButton, isBusy && styles.disabledButton]}
              onPress={() => void beginVoiceCapture()}
            >
              {isBusy ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <>
                  <Ionicons color={colors.white} name="mic" size={18} />
                  <Text style={styles.primaryText}>Start</Text>
                </>
              )}
            </Pressable>
          )}
        </View>

        {voiceError ? (
          <Pressable
            accessibilityRole="button"
            disabled={isBusy}
            onPress={() => void beginSystemVoiceCapture()}
            style={[styles.voiceFallbackButton, isBusy && styles.disabledButton]}
          >
            <Ionicons color={colors.primary} name="logo-google" size={16} />
            <Text style={styles.voiceFallbackText}>Use system voice</Text>
          </Pressable>
        ) : null}
      </>
    );
  };

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={dismissKeyboardOrClose}>
      <View style={[styles.backdrop, keyboardHeight > 0 && { paddingBottom: keyboardHeight + 12 }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={dismissKeyboardOrClose} />
        <Animated.View
          style={[
            styles.sheet,
            {
              transform: [{ scale }, { translateY: translate }],
            },
          ]}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.sheetContent}
          >
            {mode === "quick" ? renderQuickCapture() : null}
            {mode === "confirm" ? renderConfirm() : null}
            {mode === "menu" ? renderMenu() : null}
            {mode === "expense" ? renderExpense() : null}
            {mode === "manual" ? renderManualCapture() : null}
            {mode === "voice" ? renderVoiceCapture() : null}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  actionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  backdrop: {
    backgroundColor: "rgba(24,24,27,0.28)",
    flex: 1,
    justifyContent: "flex-end",
    padding: 16,
  },
  captureInput: {
    backgroundColor: colors.backgroundSoft,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
    lineHeight: 24,
    minHeight: 132,
    padding: 16,
    textAlignVertical: "top",
  },
  disabledButton: {
    opacity: 0.56,
  },
  eyebrow: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1,
    marginBottom: 8,
    textTransform: "uppercase",
  },
  input: {
    backgroundColor: colors.backgroundSoft,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
    marginTop: 10,
    padding: 14,
  },
  keyboardRoot: {
    flex: 1,
  },
  chip: {
    backgroundColor: colors.backgroundSoft,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  chipRow: {
    gap: 8,
    paddingRight: 6,
  },
  chipText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "900",
  },
  helpText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
  },
  label: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "900",
    marginBottom: 8,
    marginTop: 14,
    textTransform: "uppercase",
  },
  manualHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
  },
  manualHeaderText: {
    flex: 1,
  },
  manualIcon: {
    alignItems: "center",
    backgroundColor: colors.accentSurface,
    borderRadius: 16,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  menuGrid: {
    gap: 10,
    marginTop: 6,
  },
  menuItem: {
    alignItems: "center",
    backgroundColor: colors.backgroundSoft,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 14,
  },
  menuText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900",
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: colors.black,
    borderRadius: 999,
    flex: 1,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 16,
  },
  primaryText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: "900",
  },
  reviewBox: {
    backgroundColor: colors.backgroundSoft,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    gap: 4,
    marginTop: 12,
    padding: 14,
  },
  reviewLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 4,
  },
  reviewValue: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900",
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: colors.backgroundSoft,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 16,
  },
  secondaryText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "900",
  },
  segmentButton: {
    alignItems: "center",
    backgroundColor: colors.backgroundSoft,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 42,
    paddingHorizontal: 12,
  },
  segmentButtonSelected: {
    backgroundColor: colors.black,
    borderColor: colors.black,
  },
  segmentButtonText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "900",
  },
  segmentButtonTextSelected: {
    color: colors.white,
  },
  segmentRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  selectedChip: {
    backgroundColor: colors.black,
    borderColor: colors.black,
  },
  selectedChipText: {
    color: colors.white,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    maxHeight: "86%",
    ...subtleShadow,
  },
  sheetContent: {
    padding: 18,
  },
  pickerButton: {
    alignItems: "center",
    backgroundColor: colors.backgroundSoft,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    minHeight: 46,
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  pickerButtonText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900",
  },
  pickerInline: {
    alignSelf: "flex-start",
    backgroundColor: colors.backgroundSoft,
    borderRadius: 16,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "900",
    marginBottom: 14,
  },
  voiceBubble: {
    backgroundColor: colors.backgroundSoft,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
    borderColor: colors.border,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 6,
    borderWidth: 1,
    marginTop: 14,
    minHeight: 154,
    padding: 14,
  },
  voiceError: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18,
    marginTop: 10,
  },
  voiceFallbackButton: {
    alignItems: "center",
    alignSelf: "center",
    flexDirection: "row",
    gap: 7,
    marginTop: 12,
    minHeight: 40,
    paddingHorizontal: 12,
  },
  voiceFallbackText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "900",
  },
  voiceHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
  },
  voiceOrb: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 999,
    height: 58,
    justifyContent: "center",
    width: 58,
  },
  voiceOrbRecording: {
    backgroundColor: colors.danger,
  },
  voiceTranscript: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
    lineHeight: 25,
    minHeight: 126,
    padding: 0,
  },
});
