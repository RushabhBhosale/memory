import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  createMemory,
  listProjects,
  type MemoryKind,
  type Project
} from '../services/api';
import { colors, subtleShadow } from '../styles/theme';

type SaveMode = {
  label: string;
  helper: string;
  kind: MemoryKind;
  category: string;
  color: string;
};

const saveModes: SaveMode[] = [
  {
    label: 'Personal',
    helper: 'Memory or note',
    kind: 'note',
    category: 'personal',
    color: colors.personalTag
  },
  {
    label: 'Work',
    helper: 'Task or work item',
    kind: 'task',
    category: 'work',
    color: colors.workTag
  },
  {
    label: 'Reminder',
    helper: 'Important detail',
    kind: 'credential',
    category: 'reminder',
    color: colors.reminderTag
  },
  {
    label: 'Project',
    helper: 'Requirement or context',
    kind: 'requirement',
    category: 'project',
    color: colors.projectTag
  }
];

const TITLE_LIMIT = 72;

const parseTags = (value: string) =>
  value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);

export default function AddScreen() {
  const params = useLocalSearchParams<{ projectId?: string }>();
  const projectIdParam = Array.isArray(params.projectId) ? params.projectId[0] : params.projectId;

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [selectedMode, setSelectedMode] = useState<SaveMode>(saveModes[0]);
  const [category, setCategory] = useState(saveModes[0].category);
  const [tags, setTags] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState(projectIdParam || '');
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [showMore, setShowMore] = useState(Boolean(projectIdParam));
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

  const selectMode = (mode: SaveMode) => {
    setSelectedMode(mode);
    setCategory(mode.category);
  };

  const prepareMemoryFields = () => {
    const trimmedTitle = title.trim();
    const trimmedContent = content.trim();

    if (trimmedTitle.length <= TITLE_LIMIT) {
      return {
        savedTitle: trimmedTitle,
        savedContent: trimmedContent || undefined
      };
    }

    const savedTitle = `${trimmedTitle.slice(0, TITLE_LIMIT - 1).trim()}...`;
    const savedContent = trimmedContent
      ? `Full title: ${trimmedTitle}\n\n${trimmedContent}`
      : `Full title: ${trimmedTitle}`;

    return { savedTitle, savedContent };
  };

  const cancel = () => {
    router.replace('/');
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

      await createMemory({
        title: savedTitle,
        content: savedContent,
        category: category.trim() || selectedMode.category,
        tags: parsedTags.length ? parsedTags : undefined,
        kind: selectedMode.kind,
        projectId: selectedProjectId || undefined
      });

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
              <Text style={styles.title}>Save something</Text>
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
