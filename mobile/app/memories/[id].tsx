import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { generateMetadata } from '../../services/ai';
import { deleteMemory, getMemory, Memory, updateMemory } from '../../services/api';
import { cardShadow, colors, subtleShadow } from '../../styles/theme';

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));

const formatDateOnly = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: 'long'
  }).format(new Date(value));

const getKindLabel = (memory: Memory) => {
  if (memory.category === 'reminder') {
    return 'Reminder';
  }

  switch (memory.kind) {
    case 'task':
      return 'Task';
    case 'work_done':
      return 'Work';
    case 'requirement':
      return 'Project';
    case 'credential':
      return 'Vault';
    default:
      return 'Personal';
  }
};

const getProjectName = (memory: Memory) =>
  memory.projectId && typeof memory.projectId === 'object' ? memory.projectId.name : '';

const getKindTone = (memory: Memory) => {
  if (memory.category === 'reminder') {
    return colors.reminderTag;
  }

  switch (memory.kind) {
    case 'task':
    case 'work_done':
      return colors.workTag;
    case 'requirement':
      return colors.projectTag;
    case 'credential':
      return colors.success;
    default:
      return colors.personalTag;
  }
};

export default function DetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;

  const [memory, setMemory] = useState<Memory | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState('');

  const loadMemory = useCallback(async () => {
    if (!id) {
      setError('Memory id is missing');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError('');
      setMemory(await getMemory(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load memory');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadMemory();
  }, [loadMemory]);

  const confirmDelete = () => {
    Alert.alert('Delete memory?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (!id) {
            return;
          }

          try {
            setDeleting(true);
            setError('');
            await deleteMemory(id);
            router.replace('/');
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Unable to delete memory');
          } finally {
            setDeleting(false);
          }
        }
      }
    ]);
  };

  const regenerateMemoryMetadata = async () => {
    if (!memory || !id) {
      return;
    }

    try {
      setRegenerating(true);
      setError('');

      const metadataSource = memory.content.trim() || memory.title.trim();
      const metadata = await generateMetadata(metadataSource);
      const updatedMemory = await updateMemory(id, {
        title: metadata.title,
        category: metadata.category,
        tags: metadata.tags,
        importance: metadata.importance
      });

      setMemory(updatedMemory);
      Alert.alert('Metadata updated', 'Title, category, tags, and importance were regenerated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to regenerate metadata');
    } finally {
      setRegenerating(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.mutedText}>Loading memory...</Text>
      </View>
    );
  }

  if (error && !memory) {
    return (
      <View style={styles.centerState}>
        <Text style={styles.errorText}>{error}</Text>
        <Pressable style={styles.secondaryButton} onPress={loadMemory}>
          <Text style={styles.secondaryButtonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  if (!memory) {
    return (
      <View style={styles.centerState}>
        <Text style={styles.mutedText}>Memory not found.</Text>
      </View>
    );
  }

  const projectName = getProjectName(memory);
  const kindTone = getKindTone(memory);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.headerPanel}>
        <Text style={styles.dateHero}>{formatDateOnly(memory.createdAt)}</Text>
        <Text style={styles.title}>{memory.title}</Text>

        <View style={styles.tagRow}>
          <View style={[styles.tagPill, { backgroundColor: `${kindTone}1F` }]}>
            <Text style={[styles.tagText, { color: kindTone }]}>{getKindLabel(memory)}</Text>
          </View>
          <View style={styles.tagPill}>
            <Text style={styles.tagText}>{memory.category}</Text>
          </View>
          {projectName ? (
            <View style={[styles.tagPill, { backgroundColor: `${colors.projectTag}1F` }]}>
              <Text style={[styles.tagText, { color: colors.projectTag }]}>{projectName}</Text>
            </View>
          ) : null}
          {memory.tags.map((tag) => (
            <View key={tag} style={styles.tagPill}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.metaCard}>
        <View style={styles.metaBlock}>
          <Text style={styles.metaLabel}>Created</Text>
          <Text style={styles.metaValue}>{formatDateTime(memory.createdAt)}</Text>
        </View>
        <View style={styles.metaDivider} />
        <View style={styles.metaBlock}>
          <Text style={styles.metaLabel}>{memory.reminderAt ? 'Reminder' : 'Updated'}</Text>
          <Text style={styles.metaValue}>
            {memory.reminderAt ? formatDateTime(memory.reminderAt) : formatDateTime(memory.updatedAt)}
          </Text>
        </View>
      </View>

      <View style={styles.metaCard}>
        <View style={styles.metaBlock}>
          <Text style={styles.metaLabel}>Importance</Text>
          <Text style={styles.metaValue}>{memory.importance || 3} / 5</Text>
        </View>
        <View style={styles.metaDivider} />
        <View style={styles.metaBlock}>
          <Text style={styles.metaLabel}>AI Metadata</Text>
          <Pressable
            disabled={regenerating}
            style={[styles.secondaryButton, regenerating && styles.disabledButton]}
            onPress={regenerateMemoryMetadata}
          >
            {regenerating ? (
              <ActivityIndicator color={colors.text} />
            ) : (
              <Text style={styles.secondaryButtonText}>Regenerate Metadata</Text>
            )}
          </Pressable>
        </View>
      </View>

      <View style={styles.bodyCard}>
        {memory.content ? (
          <Text style={styles.body}>{memory.content}</Text>
        ) : (
          <Text style={styles.emptyBody}>No additional notes.</Text>
        )}
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <Pressable
        disabled={deleting}
        style={[styles.deleteButton, deleting && styles.disabledButton]}
        onPress={confirmDelete}
      >
        {deleting ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <Text style={styles.deleteButtonText}>Delete memory</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background
  },
  content: {
    padding: 20,
    paddingBottom: 38
  },
  headerPanel: {
    alignItems: 'center',
    paddingTop: 8
  },
  dateHero: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 12
  },
  title: {
    color: colors.text,
    fontSize: 32,
    fontWeight: '900',
    lineHeight: 38,
    marginBottom: 16,
    textAlign: 'center'
  },
  tagRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center'
  },
  tagPill: {
    backgroundColor: colors.surface,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    ...subtleShadow
  },
  tagText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '800'
  },
  metaCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 24,
    padding: 16,
    ...subtleShadow
  },
  metaBlock: {
    flex: 1
  },
  metaDivider: {
    backgroundColor: colors.border,
    marginHorizontal: 12,
    width: 1
  },
  metaLabel: {
    color: colors.textSoft,
    fontSize: 11,
    fontWeight: '900',
    marginBottom: 4,
    textTransform: 'uppercase'
  },
  metaValue: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700'
  },
  bodyCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 22,
    borderWidth: 1,
    marginTop: 18,
    padding: 18,
    ...cardShadow
  },
  body: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 25
  },
  emptyBody: {
    color: colors.textSoft,
    fontSize: 15,
    lineHeight: 22
  },
  deleteButton: {
    alignItems: 'center',
    backgroundColor: colors.danger,
    borderRadius: 999,
    marginTop: 24,
    padding: 14
  },
  disabledButton: {
    opacity: 0.7
  },
  deleteButtonText: {
    color: colors.white,
    fontWeight: '800'
  },
  secondaryButton: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  secondaryButtonText: {
    color: colors.text,
    fontWeight: '700'
  },
  centerState: {
    alignItems: 'center',
    flex: 1,
    gap: 12,
    justifyContent: 'center',
    padding: 16
  },
  mutedText: {
    color: colors.textMuted
  },
  errorText: {
    color: colors.danger,
    marginTop: 16,
    textAlign: 'center'
  }
});
