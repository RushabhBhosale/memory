import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { ALLOWED_CATEGORIES } from "../constants/memoryCategories";
import { generateMetadata, getFallbackMetadata } from "../services/ai";
import {
  createMemory,
  listProjects,
  type MemoryKind,
  type Project,
} from "../services/api";
import {
  scheduleMemoryReminder,
  scheduleTestMemoryNotification,
} from "../services/notifications";
import { colors, subtleShadow } from "../styles/theme";

type SaveMode = {
  id: "personal" | "task" | "reminder" | "project";
  label: string;
  helper: string;
  kind: MemoryKind;
  fallbackCategory: string;
  color: string;
};

const saveModes: SaveMode[] = [
  {
    id: "personal",
    label: "Personal",
    helper: "Memory or note",
    kind: "note",
    fallbackCategory: "personal",
    color: colors.personalTag,
  },
  {
    id: "task",
    label: "Work",
    helper: "Task or work item",
    kind: "task",
    fallbackCategory: "task",
    color: colors.workTag,
  },
  {
    id: "reminder",
    label: "Reminder",
    helper: "Notify me later",
    kind: "note",
    fallbackCategory: "reminder",
    color: colors.reminderTag,
  },
  {
    id: "project",
    label: "Project",
    helper: "Requirement or context",
    kind: "requirement",
    fallbackCategory: "projects",
    color: colors.projectTag,
  },
];

const parseTags = (value: string) =>
  value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

const getParamValue = (value?: string | string[]) =>
  Array.isArray(value) ? value[0] : value;

const getModeById = (id?: string) =>
  saveModes.find((mode) => mode.id === id) || saveModes[0];

const reminderMode = getModeById("reminder");

const shouldShowExtraFields = (modeId?: string, projectId?: string) =>
  Boolean(projectId || modeId === "task" || modeId === "project");

const reminderDateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
});

const reminderTimeFormatter = new Intl.DateTimeFormat(undefined, {
  timeStyle: "short",
});

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

export default function AddScreen() {
  const params = useLocalSearchParams<{
    draft?: string;
    projectId?: string;
    mode?: string;
  }>();
  const draftParam = getParamValue(params.draft);
  const projectIdParam = getParamValue(params.projectId);
  const modeParam = getParamValue(params.mode);
  const initialMode = getModeById(modeParam);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [selectedMode, setSelectedMode] = useState<SaveMode>(initialMode);
  const [category, setCategory] = useState(initialMode.fallbackCategory);
  const [tags, setTags] = useState("");
  const [importance, setImportance] = useState(3);
  const [metadataSource, setMetadataSource] = useState("");
  const [isGeneratingMetadata, setIsGeneratingMetadata] = useState(false);
  const [userEditedTitle, setUserEditedTitle] = useState(false);
  const [reminderAt, setReminderAt] = useState(getDefaultReminderAt);
  const [activePicker, setActivePicker] = useState<"date" | "time" | null>(
    null,
  );
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState(
    projectIdParam || "",
  );
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [showMore, setShowMore] = useState(
    shouldShowExtraFields(modeParam, projectIdParam),
  );
  const [saving, setSaving] = useState(false);
  const [testingNotification, setTestingNotification] = useState(false);
  const [error, setError] = useState("");

  const generationIdRef = useRef(0);

  useEffect(() => {
    let mounted = true;

    const loadProjects = async () => {
      try {
        const nextProjects = await listProjects();

        if (mounted) {
          setProjects(nextProjects);
          setSelectedProjectId(
            (current: string) => current || projectIdParam || "",
          );
        }
      } catch {
        if (mounted) {
          setProjects([]);
        }
      } finally {
        if (mounted) {
          setProjectsLoading(false);
        }
      }
    };

    loadProjects();

    return () => {
      mounted = false;
    };
  }, [projectIdParam]);

  useEffect(() => {
    const nextMode = getModeById(modeParam);

    setSelectedMode(nextMode);

    if (!metadataSource) {
      setCategory(nextMode.fallbackCategory);
    }

    if (shouldShowExtraFields(modeParam, projectIdParam)) {
      setShowMore(true);
    }
  }, [modeParam, metadataSource, projectIdParam]);

  useEffect(() => {
    if (draftParam) {
      setContent(draftParam);
    }
  }, [draftParam]);

  const applyMetadata = (
    nextContent: string,
    metadata: Awaited<ReturnType<typeof generateMetadata>>,
    options?: { forceTitle?: boolean },
  ) => {
    const normalizedContent = nextContent.trim();

    if (!normalizedContent) {
      return;
    }

    if (
      options?.forceTitle ||
      !title.trim() ||
      !userEditedTitle ||
      metadataSource !== normalizedContent
    ) {
      setTitle(metadata.title);
      setUserEditedTitle(false);
    }

    setCategory(metadata.category);

    if (metadata.category === "reminder") {
      setSelectedMode(reminderMode);
      setShowMore(true);
    }

    setTags(metadata.tags.join(", "));
    setImportance(metadata.importance);
    setMetadataSource(normalizedContent);
  };

  const runMetadataGeneration = async (
    nextContent: string,
    options?: { forceTitle?: boolean },
  ) => {
    const normalizedContent = nextContent.trim();

    if (!normalizedContent) {
      return getFallbackMetadata();
    }

    const requestId = generationIdRef.current + 1;
    generationIdRef.current = requestId;
    setIsGeneratingMetadata(true);

    try {
      const metadata = await generateMetadata(normalizedContent);

      if (generationIdRef.current === requestId) {
        applyMetadata(normalizedContent, metadata, options);
      }

      return metadata;
    } finally {
      if (generationIdRef.current === requestId) {
        setIsGeneratingMetadata(false);
      }
    }
  };

  useEffect(() => {
    const normalizedContent = content.trim();

    if (normalizedContent.length < 12 || normalizedContent === metadataSource) {
      return;
    }

    const timeout = setTimeout(() => {
      void runMetadataGeneration(normalizedContent);
    }, 900);

    return () => clearTimeout(timeout);
  }, [content, metadataSource]);

  const cancel = () => {
    router.replace("/");
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

  const handleAndroidPickerChange = (
    event: DateTimePickerEvent,
    date?: Date,
  ) => {
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

  const regenerateMetadata = async () => {
    if (!content.trim()) {
      setError("Write the content first");
      return;
    }

    setError("");
    await runMetadataGeneration(content, { forceTitle: true });
  };

  const selectCategory = (nextCategory: string) => {
    setCategory(nextCategory);

    if (nextCategory === "reminder") {
      setSelectedMode(reminderMode);
    }
  };

  const selectMode = (nextMode: SaveMode) => {
    setSelectedMode(nextMode);
    setCategory(nextMode.fallbackCategory);

    if (nextMode.id === "task" || nextMode.id === "project") {
      setShowMore(true);
    }
  };

  const saveMemory = async () => {
    if (!content.trim()) {
      setError("Content is required");
      return;
    }

    try {
      setSaving(true);
      setError("");

      const normalizedContent = content.trim();
      const metadata =
        metadataSource === normalizedContent && title.trim()
          ? null
          : await runMetadataGeneration(normalizedContent, {
              forceTitle: !title.trim(),
            });

      const fallbackMetadata = getFallbackMetadata();
      const parsedTags = parseTags(tags);
      const reminderAtDate = selectedMode.id === "reminder" ? reminderAt : null;
      const resolvedMetadata = metadata || fallbackMetadata;

      if (reminderAtDate && reminderAtDate.getTime() <= Date.now()) {
        setError("Reminder time must be in the future");
        return;
      }

      const memory = await createMemory({
        title: title.trim() || resolvedMetadata.title,
        content: normalizedContent,
        category:
          category.trim() ||
          resolvedMetadata.category ||
          selectedMode.fallbackCategory,
        tags: parsedTags.length ? parsedTags : resolvedMetadata.tags,
        importance,
        kind: selectedMode.kind,
        projectId: selectedProjectId || undefined,
        reminderAt: reminderAtDate?.toISOString(),
        notificationEnabled: selectedMode.id === "reminder",
      });

      if (selectedMode.id === "reminder") {
        const notificationId = await scheduleMemoryReminder(memory);

        if (!notificationId) {
          Alert.alert(
            "Reminder saved",
            "The reminder was saved, but the phone did not schedule a notification. Check notification permission and try a development build if Expo Go blocks it.",
          );
        }
      }

      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create memory");
    } finally {
      setSaving(false);
    }
  };

  const sendTestNotification = async () => {
    try {
      setTestingNotification(true);

      const notificationId = await scheduleTestMemoryNotification();

      if (!notificationId) {
        Alert.alert(
          "Notification not scheduled",
          "The phone did not schedule the test notification. Check notification permission and use a development build if Expo Go blocks it.",
        );
        return;
      }

      Alert.alert(
        "Notification scheduled",
        "A test notification should appear in about 5 seconds.",
      );
    } catch (err) {
      Alert.alert(
        "Notification failed",
        err instanceof Error
          ? err.message
          : "Unable to schedule the test notification.",
      );
    } finally {
      setTestingNotification(false);
    }
  };

  return (
    <SafeAreaView edges={["top"]} style={styles.screen}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <View>
              <Text style={styles.eyebrow}>New memory</Text>
              <Text style={styles.title}>
                Save {selectedMode.label.toLowerCase()}
              </Text>
            </View>
            <Pressable
              disabled={saving}
              style={styles.closeButton}
              onPress={cancel}
            >
              <Text style={styles.closeButtonText}>Cancel</Text>
            </Pressable>
          </View>

          <View style={styles.modeRow}>
            {saveModes.map((mode) => {
              const selected = selectedMode.id === mode.id;

              return (
                <Pressable
                  key={mode.id}
                  accessibilityRole="button"
                  onPress={() => selectMode(mode)}
                  style={[
                    styles.modeChip,
                    { borderColor: mode.color },
                    selected && { backgroundColor: mode.color },
                  ]}
                >
                  <Text
                    style={[
                      styles.modeChipText,
                      selected && styles.selectedModeChipText,
                    ]}
                  >
                    {mode.label}
                  </Text>
                  <Text
                    style={[
                      styles.modeChipHelper,
                      selected && styles.selectedModeChipText,
                    ]}
                  >
                    {mode.helper}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.panel}>
            <Text style={styles.label}>Content</Text>
            <TextInput
              value={content}
              onChangeText={setContent}
              multiline
              placeholder="Write what happened, what you need to save, or what to remember"
              placeholderTextColor={colors.textSoft}
              style={[styles.input, styles.textArea]}
              textAlignVertical="top"
            />

            <View style={styles.metadataHeader}>
              <Text style={styles.label}>AI Generated Title</Text>
              <Pressable
                style={styles.regenerateLink}
                onPress={() => void regenerateMetadata()}
              >
                <Text style={styles.regenerateLinkText}>
                  {isGeneratingMetadata ? "Generating..." : "Regenerate"}
                </Text>
              </Pressable>
            </View>
            <TextInput
              value={title}
              onChangeText={(value) => {
                setTitle(value);
                setUserEditedTitle(true);
              }}
              placeholder="AI will generate a title"
              placeholderTextColor={colors.textSoft}
              style={styles.input}
            />

            {selectedMode.id === "reminder" ? (
              <View style={styles.reminderBox}>
                <Text style={styles.label}>Reminder date</Text>
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
                  <Pressable
                    accessibilityRole="button"
                    style={styles.pickerButton}
                    onPress={() => setActivePicker("date")}
                  >
                    <Text style={styles.pickerButtonText}>
                      {reminderDateFormatter.format(reminderAt)}
                    </Text>
                  </Pressable>
                )}

                <Text style={styles.label}>Reminder time</Text>
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
                  <Pressable
                    accessibilityRole="button"
                    style={styles.pickerButton}
                    onPress={() => setActivePicker("time")}
                  >
                    <Text style={styles.pickerButtonText}>
                      {reminderTimeFormatter.format(reminderAt)}
                    </Text>
                  </Pressable>
                )}

                {Platform.OS !== "ios" && activePicker ? (
                  <DateTimePicker
                    display={activePicker === "date" ? "calendar" : "clock"}
                    minimumDate={
                      activePicker === "date" ? new Date() : undefined
                    }
                    mode={activePicker}
                    onChange={handleAndroidPickerChange}
                    value={reminderAt}
                  />
                ) : null}

                {/* <Pressable
                  accessibilityRole="button"
                  disabled={testingNotification}
                  style={[styles.testNotificationButton, testingNotification && styles.disabledButton]}
                  onPress={sendTestNotification}
                >
                  {testingNotification ? (
                    <ActivityIndicator color={colors.primary} />
                  ) : (
                    <Text style={styles.testNotificationButtonText}>Send test notification</Text>
                  )}
                </Pressable> */}
              </View>
            ) : null}
          </View>

          <Pressable
            style={styles.moreButton}
            onPress={() => setShowMore((current) => !current)}
          >
            <Text style={styles.moreButtonText}>
              {showMore ? "Hide details" : "More details"}
            </Text>
          </Pressable>

          {showMore ? (
            <View style={styles.panel}>
              <Text style={styles.label}>AI Category</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipRow}
              >
                {ALLOWED_CATEGORIES.map((item) => {
                  const selected = category === item;

                  return (
                    <Pressable
                      key={item}
                      onPress={() => selectCategory(item)}
                      style={[styles.chip, selected && styles.selectedChip]}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          selected && styles.selectedChipText,
                        ]}
                      >
                        {item}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <Text style={styles.label}>Tags</Text>
              <TextInput
                value={tags}
                onChangeText={setTags}
                placeholder="comma, separated"
                placeholderTextColor={colors.textSoft}
                autoCapitalize="none"
                style={styles.input}
              />

              <Text style={styles.label}>Importance</Text>
              <View style={styles.importanceRow}>
                {[1, 2, 3, 4, 5].map((value) => {
                  const selected = importance === value;

                  return (
                    <Pressable
                      key={value}
                      onPress={() => setImportance(value)}
                      style={[
                        styles.importanceChip,
                        selected && styles.selectedImportanceChip,
                      ]}
                    >
                      <Text
                        style={[
                          styles.importanceChipText,
                          selected && styles.selectedImportanceChipText,
                        ]}
                      >
                        {value}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.label}>Project</Text>
              {projectsLoading ? (
                <ActivityIndicator
                  color={colors.primary}
                  style={styles.inlineLoader}
                />
              ) : (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chipRow}
                >
                  <Pressable
                    style={[
                      styles.chip,
                      !selectedProjectId && styles.selectedChip,
                    ]}
                    onPress={() => setSelectedProjectId("")}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        !selectedProjectId && styles.selectedChipText,
                      ]}
                    >
                      None
                    </Text>
                  </Pressable>
                  {projects.map((project) => {
                    const selected = project._id === selectedProjectId;

                    return (
                      <Pressable
                        key={project._id}
                        style={[styles.chip, selected && styles.selectedChip]}
                        onPress={() => setSelectedProjectId(project._id)}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            selected && styles.selectedChipText,
                          ]}
                        >
                          {project.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              )}
            </View>
          ) : null}

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Pressable
            disabled={saving}
            style={[styles.primaryButton, saving && styles.disabledButton]}
            onPress={saveMemory}
          >
            {saving ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.primaryButtonText}>Save</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    padding: 18,
    paddingBottom: 32,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  eyebrow: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: "900",
    marginBottom: 4,
    textTransform: "uppercase",
  },
  title: {
    color: colors.text,
    fontSize: 30,
    fontWeight: "900",
    lineHeight: 36,
  },
  closeButton: {
    backgroundColor: colors.surface,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    ...subtleShadow,
  },
  closeButtonText: {
    color: colors.text,
    fontWeight: "900",
  },
  modeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
    marginBottom: 14,
  },
  modeChip: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    flexBasis: "48%",
    flexGrow: 1,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  modeChipText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "900",
  },
  modeChipHelper: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "700",
    marginTop: 3,
  },
  selectedModeChipText: {
    color: colors.white,
  },
  panel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 22,
    borderWidth: 1,
    padding: 16,
    ...subtleShadow,
  },
  label: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "900",
    marginBottom: 7,
    marginTop: 12,
  },
  input: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: 13,
    paddingVertical: 12,
  },
  textArea: {
    lineHeight: 22,
    minHeight: 132,
  },
  metadataHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  regenerateLink: {
    paddingTop: 12,
  },
  regenerateLinkText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "800",
  },
  importanceRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  importanceChip: {
    alignItems: "center",
    backgroundColor: colors.backgroundSoft,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  selectedImportanceChip: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  importanceChipText: {
    color: colors.textMuted,
    fontWeight: "800",
  },
  selectedImportanceChipText: {
    color: colors.white,
  },
  reminderBox: {
    marginTop: 6,
  },
  pickerInline: {
    alignItems: "flex-start",
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  pickerButton: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 12,
  },
  pickerButtonText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  testNotificationButton: {
    alignItems: "center",
    backgroundColor: colors.backgroundSoft,
    borderColor: colors.primary,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 14,
    paddingHorizontal: 13,
    paddingVertical: 12,
  },
  testNotificationButtonText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: "900",
  },
  moreButton: {
    alignItems: "center",
    marginTop: 14,
    paddingVertical: 10,
  },
  moreButtonText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "800",
  },
  chipRow: {
    gap: 8,
    paddingRight: 18,
  },
  chip: {
    backgroundColor: colors.backgroundSoft,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  selectedChip: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "800",
  },
  selectedChipText: {
    color: colors.white,
  },
  inlineLoader: {
    marginVertical: 16,
  },
  errorText: {
    color: colors.danger,
    marginTop: 16,
    textAlign: "center",
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: colors.black,
    borderRadius: 999,
    marginTop: 18,
    padding: 14,
  },
  disabledButton: {
    opacity: 0.7,
  },
  primaryButtonText: {
    color: colors.white,
    fontWeight: "800",
  },
});
