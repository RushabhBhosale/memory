import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { listMemories, Memory, searchMemories } from '../services/api';

const formatDate = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(new Date(value));

export default function HomeScreen() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadMemories = useCallback(async (searchText = query) => {
    try {
      setLoading(true);
      setError('');

      const nextMemories = searchText.trim()
        ? await searchMemories(searchText.trim())
        : await listMemories();

      setMemories(nextMemories);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load memories');
    } finally {
      setLoading(false);
    }
  }, [query]);

  useFocusEffect(
    useCallback(() => {
      loadMemories();
    }, [loadMemories])
  );

  const clearSearch = () => {
    setQuery('');
    loadMemories('');
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Recent memories</Text>
        <Pressable style={styles.primaryButton} onPress={() => router.push('/add')}>
          <Text style={styles.primaryButtonText}>Add</Text>
        </Pressable>
      </View>

      <View style={styles.searchRow}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => loadMemories()}
          placeholder="Search memories"
          returnKeyType="search"
          style={styles.searchInput}
        />
        <Pressable style={styles.secondaryButton} onPress={() => loadMemories()}>
          <Text style={styles.secondaryButtonText}>Search</Text>
        </Pressable>
      </View>

      {query ? (
        <Pressable onPress={clearSearch}>
          <Text style={styles.clearText}>Clear search</Text>
        </Pressable>
      ) : null}

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator />
          <Text style={styles.mutedText}>Loading memories...</Text>
        </View>
      ) : error ? (
        <View style={styles.centerState}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.secondaryButton} onPress={() => loadMemories()}>
            <Text style={styles.secondaryButtonText}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={memories}
          keyExtractor={(item) => item._id}
          contentContainerStyle={memories.length ? styles.list : styles.centerState}
          ListEmptyComponent={<Text style={styles.mutedText}>No memories found.</Text>}
          renderItem={({ item }) => (
            <Pressable
              style={styles.card}
              onPress={() =>
                router.push({
                  pathname: '/memories/[id]',
                  params: { id: item._id }
                })
              }
            >
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardMeta}>
                {item.category} · {formatDate(item.createdAt)}
              </Text>
              <Text numberOfLines={2} style={styles.cardContent}>
                {item.content}
              </Text>
              {item.tags.length ? (
                <Text style={styles.tags}>{item.tags.join(', ')}</Text>
              ) : null}
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f7f7f8',
    padding: 16
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16
  },
  title: {
    color: '#111827',
    fontSize: 24,
    fontWeight: '700'
  },
  searchRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8
  },
  searchInput: {
    backgroundColor: '#ffffff',
    borderColor: '#d1d5db',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  primaryButton: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10
  },
  primaryButtonText: {
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
  clearText: {
    color: '#2563eb',
    marginBottom: 8
  },
  list: {
    paddingBottom: 24
  },
  card: {
    backgroundColor: '#ffffff',
    borderColor: '#e5e7eb',
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 12,
    padding: 14
  },
  cardTitle: {
    color: '#111827',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 4
  },
  cardMeta: {
    color: '#6b7280',
    marginBottom: 8
  },
  cardContent: {
    color: '#374151',
    lineHeight: 20
  },
  tags: {
    color: '#2563eb',
    marginTop: 8
  },
  centerState: {
    alignItems: 'center',
    flex: 1,
    gap: 12,
    justifyContent: 'center'
  },
  mutedText: {
    color: '#6b7280'
  },
  errorText: {
    color: '#b91c1c',
    textAlign: 'center'
  }
});
