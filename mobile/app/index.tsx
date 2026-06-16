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
import { cardShadow, colors } from '../styles/theme';

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
        <View>
          <Text style={styles.eyebrow}>Memory</Text>
          <Text style={styles.title}>Recent entries</Text>
        </View>
        <Pressable
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && styles.primaryButtonPressed
          ]}
          onPress={() => router.push('/add')}
        >
          <Text style={styles.primaryButtonText}>Add</Text>
        </Pressable>
      </View>

      <View style={styles.searchPanel}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => loadMemories()}
          placeholder="Search memories"
          placeholderTextColor={colors.textSoft}
          returnKeyType="search"
          style={styles.searchInput}
        />
        <Pressable
          style={({ pressed }) => [
            styles.secondaryButton,
            pressed && styles.secondaryButtonPressed
          ]}
          onPress={() => loadMemories()}
        >
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
              {item.content ? (
                <Text numberOfLines={2} style={styles.cardContent}>
                  {item.content}
                </Text>
              ) : null}
              {item.tags.length ? (
                <View style={styles.tagRow}>
                  {item.tags.slice(0, 3).map((tag) => (
                    <View key={tag} style={styles.tagPill}>
                      <Text style={styles.tagText}>{tag}</Text>
                    </View>
                  ))}
                </View>
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
    backgroundColor: colors.background,
    padding: 18
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 18
  },
  eyebrow: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4,
    textTransform: 'uppercase'
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '800'
  },
  searchPanel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
    padding: 8,
    ...cardShadow
  },
  searchInput: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    color: colors.text,
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 11
  },
  primaryButton: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingVertical: 11
  },
  primaryButtonPressed: {
    backgroundColor: colors.accentPressed
  },
  primaryButtonText: {
    color: colors.surface,
    fontWeight: '700'
  },
  secondaryButton: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 11
  },
  secondaryButtonPressed: {
    opacity: 0.78
  },
  secondaryButtonText: {
    color: colors.text,
    fontWeight: '600'
  },
  clearText: {
    color: colors.accent,
    fontWeight: '700',
    marginBottom: 10
  },
  list: {
    paddingBottom: 24
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 12,
    padding: 16,
    ...cardShadow
  },
  cardTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 6
  },
  cardMeta: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8
  },
  cardContent: {
    color: colors.textMuted,
    lineHeight: 21
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 12
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
  centerState: {
    alignItems: 'center',
    flex: 1,
    gap: 12,
    justifyContent: 'center'
  },
  mutedText: {
    color: colors.textMuted
  },
  errorText: {
    color: colors.danger,
    textAlign: 'center'
  }
});
