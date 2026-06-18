import { useEffect, useState } from 'react';
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
  View
} from 'react-native';
import DateTimePicker, {
  type DateTimePickerEvent
} from '@react-native-community/datetimepicker';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  createMemory,
  listProjects,
  type MemoryKind,
  type Project
} from '../services/api';
import { scheduleMemoryReminder } from '../services/notifications';
import { colors, subtleShadow } from '../styles/theme';

type SaveMode = {
  id: 'personal' | 'task' | 'reminder' | 'project';
  label: string;
  helper: string;
  kind: MemoryKind;
  category: string;
  color: string;
};

const saveModes: SaveMode[] = [
  {
    id: 'personal',
    label: 'Personal',
    helper: 'Memory or note',
    kind: 'note',
    category: 'personal',
    color: colors.personalTag
  },
  {
    id: 'task',
    label: 'Work',
    helper: 'Task or work item',
    kind: 'task',
    category: 'work',
    color: colors.workTag
  },
  {
    id: 'reminder',
    label: 'Reminder',
    helper: 'Notify me later',
    kind: 'note',
    category: 'reminder',
    color: colors.reminderTag
  },
  {
    id: 'project',
    label: 'Project',
    helper: 'Requirement or context',
    kind: 'requirement',
    category: 'project',
    color: colors.projectTag
  }
];

const parseTags = (value: string) =>
  value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);

const getParamValue = (value?: string | string[]) => (Array.isArray(value) ? value[0] : value);

const getModeById = (id?: string) => saveModes.find((mode) => mode.id === id) || saveModes[0];

const shouldShowExtraFields = (modeId?: string, projectId?: string) =>
  Boolean(projectId || modeId === 'task' || modeId === 'project');

const reminderDateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium'
});

const reminderTimeFormatter = new Intl.DateTimeFormat(undefined, {
  timeStyle: 'short'
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
    0
  );

const mergeTimePart = (current: Date, nextTime: Date) =>
  new Date(
    current.getFullYear(),
    current.getMonth(),
    current.getDate(),
    nextTime.getHours(),
    nextTime.getMinutes(),
    0,
    0
  );

export default function AddScreen() {
  const params = useLocalSearchParams<{ projectId?: string; mode?: string }>();
  const projectIdParam = getParamValue(params.projectId);
  const modeParam = getParamValue(params.mode);
  const initialMode = getModeById(modeParam);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [selectedMode, setSelectedMode] = useState<SaveMode>(initialMode);
  const [category, setCategory] = useState(initialMode.category);
  const [tags, setTags] = useState('');
  const [reminderAt, setReminderAt] = useState(getDefaultReminderAt);
  const [activePicker, setActivePicker] = useState<'date' | 'time' | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState(projectIdParam || '');
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [showMore, setShowMore] = useState(shouldShowExtraFields(modeParam, projectIdParam));
  const [showDescription, setShowDescription] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;

    const loadProjects = async () => {
      try {
        const nextProjects = await listProjects();

        if (mounted) {
          setProjects(nextProjects);
          setSelectedProjectId((current: string) => current || projectIdParam || '');
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
    setCategory(nextMode.category);

    if (shouldShowExtraFields(modeParam, projectIdParam)) {
      setShowMore(true);
    }
  }, [modeParam, projectIdParam]);

  const selectMode = (mode: SaveMode) => {
    setSelectedMode(mode);
    setCategory(mode.category);
  };

  const prepareMemoryFields = () => {
    const trimmedTitle = title.trim();
    const trimmedContent = content.trim();

    return {
      savedTitle: trimmedTitle,
      savedContent: trimmedContent || undefined
    };
  };

  const cancel = () => {
    router.replace('/');
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

    if (event.type !== 'set' || !date) {
      return;
    }

    if (picker === 'date') {
      setReminderDatePart(date);
      return;
    }

    if (picker === 'time') {
      setReminderTimePart(date);
    }
  };

  const saveMemory = async () => {
    if (!title.trim()) {
      setError('Title is required');
      return;
    }

    try {
      setSaving(true);
      setError('');

      const parsedTags = parseTags(tags);
      const { savedTitle, savedContent } = prepareMemoryFields();
      const reminderAtDate = selectedMode.id === 'reminder' ? reminderAt : null;

      if (reminderAtDate && reminderAtDate.getTime() <= Date.now()) {
        setError('Reminder time must be in the future');
        return;
      }

      const memory = await createMemory({
        title: savedTitle,
        content: savedContent,
        category: category.trim() || selectedMode.category,
        tags: parsedTags.length ? parsedTags : undefined,
        kind: selectedMode.kind,
        projectId: selectedProjectId || undefined,
        reminderAt: reminderAtDate?.toISOString(),
        notificationEnabled: selectedMode.id === 'reminder'
      });

      if (selectedMode.id === 'reminder') {
        const notificationId = await scheduleMemoryReminder(memory);

        if (!notificationId) {
          Alert.alert(
            'Reminder saved',
            'The reminder was saved, but the phone did not schedule a notification. Check notification permission and try a development build if Expo Go blocks it.'
          );
        }
      }

      router.replace('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create memory');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <View>
              <Text style={styles.eyebrow}>New memory</Text>
              <Text style={styles.title}>Save {selectedMode.label.toLowerCase()}</Text>
            </View>
            <Pressable disabled={saving} style={styles.closeButton} onPress={cancel}>
              <Text style={styles.closeButtonText}>Cancel</Text>
            </Pressable>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.modeRow}
            style={styles.modeScroller}
          >
            {saveModes.map((mode) => {
              const selected = selectedMode.label === mode.label;

              return (
                <Pressable
                  key={mode.label}
                  style={[
                    styles.modeChip,
                    selected && {
                      backgroundColor: `${mode.color}20`,
                      borderColor: mode.color
                    }
                  ]}
                  onPress={() => selectMode(mode)}
                >
                  <View style={[styles.modeDot, { backgroundColor: mode.color }]} />
                  <Text style={styles.modeLabel}>{mode.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.panel}>
            <Text style={styles.label}>Title</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="What should I remember?"
              placeholderTextColor={colors.textSoft}
              style={styles.input}
              multiline
            />

            {showDescription ? (
              <>
                <Text style={styles.label}>Description</Text>
                <TextInput
                  value={content}
                  onChangeText={setContent}
                  multiline
                  placeholder="Add extra context if needed"
                  placeholderTextColor={colors.textSoft}
                  style={[styles.input, styles.textArea]}
                  textAlignVertical="top"
                />
              </>
            ) : (
              <Pressable
                style={styles.addDescriptionButton}
                onPress={() => setShowDescription(true)}
              >
                <Text style={styles.addDescriptionText}>+ Add description</Text>
              </Pressable>
            )}

            {selectedMode.id === 'reminder' ? (
              <View style={styles.reminderBox}>
                <Text style={styles.label}>Reminder date</Text>
                {Platform.OS === 'ios' ? (
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
                    onPress={() => setActivePicker('date')}
                  >
                    <Text style={styles.pickerButtonText}>
                      {reminderDateFormatter.format(reminderAt)}
                    </Text>
                  </Pressable>
                )}

                <Text style={styles.label}>Reminder time</Text>
                {Platform.OS === 'ios' ? (
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
                    onPress={() => setActivePicker('time')}
                  >
                    <Text style={styles.pickerButtonText}>
                      {reminderTimeFormatter.format(reminderAt)}
                    </Text>
                  </Pressable>
                )}

                {Platform.OS !== 'ios' && activePicker ? (
                  <DateTimePicker
                    display={activePicker === 'date' ? 'calendar' : 'clock'}
                    minimumDate={activePicker === 'date' ? new Date() : undefined}
                    mode={activePicker}
                    onChange={handleAndroidPickerChange}
                    value={reminderAt}
                  />
                ) : null}
              </View>
            ) : null}
          </View>

          <Pressable style={styles.moreButton} onPress={() => setShowMore((current) => !current)}>
            <Text style={styles.moreButtonText}>
              {showMore ? 'Hide project and tags' : 'Project, category, tags'}
            </Text>
          </Pressable>

          {showMore ? (
            <View style={styles.panel}>
              <Text style={styles.label}>Project</Text>
              {projectsLoading ? (
                <ActivityIndicator color={colors.primary} style={styles.inlineLoader} />
              ) : (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chipRow}
                >
                  <Pressable
                    style={[styles.chip, !selectedProjectId && styles.selectedChip]}
                    onPress={() => setSelectedProjectId('')}
                  >
                    <Text style={[styles.chipText, !selectedProjectId && styles.selectedChipText]}>
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
                        <Text style={[styles.chipText, selected && styles.selectedChipText]}>
                          {project.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              )}

              <Text style={styles.label}>Category</Text>
              <TextInput
                value={category}
                onChangeText={setCategory}
                placeholder="personal"
                placeholderTextColor={colors.textSoft}
                style={styles.input}
              />

              <Text style={styles.label}>Tags</Text>
              <TextInput
                value={tags}
                onChangeText={setTags}
                placeholder="comma, separated"
                placeholderTextColor={colors.textSoft}
                autoCapitalize="none"
                style={styles.input}
              />
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
    backgroundColor: colors.background
  },
  keyboardView: {
    flex: 1
  },
  content: {
    padding: 18,
    paddingBottom: 32
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 18
  },
  eyebrow: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 4,
    textTransform: 'uppercase'
  },
  title: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '900',
    lineHeight: 36
  },
  closeButton: {
    backgroundColor: colors.surface,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    ...subtleShadow
  },
  closeButtonText: {
    color: colors.text,
    fontWeight: '900'
  },
  modeScroller: {
    flexGrow: 0,
    marginBottom: 14
  },
  modeRow: {
    gap: 8,
    paddingRight: 18
  },
  modeChip: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 9,
    paddingHorizontal: 14,
    paddingVertical: 10,
    ...subtleShadow
  },
  modeDot: {
    borderRadius: 999,
    height: 10,
    width: 10
  },
  modeLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '900'
  },
  panel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 22,
    borderWidth: 1,
    padding: 16,
    ...subtleShadow
  },
  label: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '900',
    marginBottom: 7,
    marginTop: 12
  },
  input: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    color: colors.text,
    fontSize: 16,
    maxHeight: 96,
    paddingHorizontal: 13,
    paddingVertical: 12
  },
  textArea: {
    lineHeight: 22,
    minHeight: 118
  },
  addDescriptionButton: {
    alignSelf: 'flex-start',
    marginTop: 12,
    paddingVertical: 7
  },
  addDescriptionText: {
    color: colors.accentPressed,
    fontWeight: '900'
  },
  reminderBox: {
    marginTop: 12
  },
  pickerButton: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 14
  },
  pickerButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800'
  },
  pickerInline: {
    alignItems: 'flex-start',
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  moreButton: {
    alignItems: 'center',
    alignSelf: 'center',
    marginVertical: 14,
    paddingHorizontal: 14,
    paddingVertical: 8
  },
  moreButtonText: {
    color: colors.textMuted,
    fontWeight: '900'
  },
  chipRow: {
    gap: 8,
    paddingRight: 8
  },
  chip: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  selectedChip: {
    backgroundColor: colors.accent,
    borderColor: colors.accent
  },
  chipText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '800'
  },
  selectedChipText: {
    color: colors.white
  },
  inlineLoader: {
    alignSelf: 'flex-start',
    paddingVertical: 10
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: 999,
    marginTop: 18,
    padding: 16
  },
  disabledButton: {
    opacity: 0.7
  },
  primaryButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '900'
  },
  errorText: {
    backgroundColor: colors.dangerSurface,
    borderRadius: 14,
    color: colors.danger,
    marginTop: 14,
    padding: 12,
    textAlign: 'center'
  }
});
