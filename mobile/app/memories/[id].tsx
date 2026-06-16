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

import { deleteMemory, getMemory, Memory } from '../../services/api';
import { cardShadow, colors } from '../../styles/theme';

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));

export default function DetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;

  const [memory, setMemory] = useState<Memory | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
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

  if (loading) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator />
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

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.headerPanel}>
        <Text style={styles.category}>{memory.category}</Text>
        <Text style={styles.title}>{memory.title}</Text>
        <Text style={styles.meta}>Source: {memory.source}</Text>
        <Text style={styles.date}>Created {formatDateTime(memory.createdAt)}</Text>
        <Text style={styles.date}>Updated {formatDateTime(memory.updatedAt)}</Text>

        {memory.tags.length ? (
          <View style={styles.tagRow}>
            {memory.tags.map((tag) => (
              <View key={tag} style={styles.tagPill}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>

      {memory.content ? (
        <Text style={styles.body}>{memory.content}</Text>
      ) : (
        <Text style={styles.emptyBody}>No additional notes.</Text>
      )}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <Pressable
        disabled={deleting}
        style={[styles.deleteButton, deleting && styles.disabledButton]}
        onPress={confirmDelete}
      >
        {deleting ? (
          <ActivityIndicator color="#ffffff" />
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
    padding: 18,
    paddingBottom: 34
  },
  headerPanel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    padding: 18,
    ...cardShadow
  },
  category: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 8,
    textTransform: 'uppercase'
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
    lineHeight: 34,
    marginBottom: 12
  },
  meta: {
    color: colors.textMuted,
    fontWeight: '600',
    marginBottom: 6
  },
  date: {
    color: colors.textSoft,
    marginBottom: 4
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 14
  },
  tagPill: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 5
  },
  tagText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700'
  },
  body: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    color: colors.text,
    fontSize: 16,
    lineHeight: 24,
    marginTop: 18,
    padding: 16,
    ...cardShadow
  },
  emptyBody: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    color: colors.textSoft,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 18,
    padding: 16
  },
  deleteButton: {
    alignItems: 'center',
    backgroundColor: colors.danger,
    borderRadius: 8,
    marginTop: 24,
    padding: 14
  },
  disabledButton: {
    opacity: 0.7
  },
  deleteButtonText: {
    color: '#ffffff',
    fontWeight: '700'
  },
  secondaryButton: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  secondaryButtonText: {
    color: colors.text,
    fontWeight: '600'
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
