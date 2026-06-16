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
      <Text style={styles.title}>{memory.title}</Text>
      <Text style={styles.meta}>
        {memory.category} · {memory.source}
      </Text>
      <Text style={styles.date}>Created {formatDateTime(memory.createdAt)}</Text>
      <Text style={styles.date}>Updated {formatDateTime(memory.updatedAt)}</Text>

      {memory.tags.length ? <Text style={styles.tags}>{memory.tags.join(', ')}</Text> : null}

      <Text style={styles.body}>{memory.content}</Text>

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
    backgroundColor: '#f7f7f8'
  },
  content: {
    padding: 16
  },
  title: {
    color: '#111827',
    fontSize: 26,
    fontWeight: '800',
    marginBottom: 8
  },
  meta: {
    color: '#374151',
    fontWeight: '600',
    marginBottom: 6
  },
  date: {
    color: '#6b7280',
    marginBottom: 4
  },
  tags: {
    color: '#2563eb',
    marginTop: 14
  },
  body: {
    backgroundColor: '#ffffff',
    borderColor: '#e5e7eb',
    borderRadius: 8,
    borderWidth: 1,
    color: '#111827',
    fontSize: 16,
    lineHeight: 24,
    marginTop: 18,
    padding: 14
  },
  deleteButton: {
    alignItems: 'center',
    backgroundColor: '#dc2626',
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
    backgroundColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  secondaryButtonText: {
    color: '#111827',
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
    color: '#6b7280'
  },
  errorText: {
    color: '#b91c1c',
    marginTop: 16,
    textAlign: 'center'
  }
});
