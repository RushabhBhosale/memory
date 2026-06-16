import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';

import { MemoryCard } from '../../components/MemoryCard';
import { searchMemories, type Memory } from '../../services/api';
import { cardShadow, colors } from '../../styles/theme';

export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');

  const runSearch = async () => {
    const nextQuery = query.trim();

    if (!nextQuery) {
      setResults([]);
      setSearched(false);
      setError('');
      return;
    }

    try {
      setLoading(true);
      setError('');
      setSearched(true);
      setResults(await searchMemories(nextQuery));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to search memories');
    } finally {
      setLoading(false);
    }
  };

  const clearSearch = () => {
    setQuery('');
    setResults([]);
    setSearched(false);
    setError('');
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Search</Text>
        <Text style={styles.title}>Find memory</Text>
      </View>

      <View style={styles.searchPanel}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={runSearch}
          placeholder="Try a word, tag, or rough spelling"
          placeholderTextColor={colors.textSoft}
          returnKeyType="search"
          style={styles.searchInput}
        />
        <Pressable
          style={({ pressed }) => [
            styles.searchButton,
            pressed && styles.searchButtonPressed
          ]}
          onPress={runSearch}
        >
          <Text style={styles.searchButtonText}>Go</Text>
        </Pressable>
      </View>

      {query ? (
        <Pressable onPress={clearSearch}>
          <Text style={styles.clearText}>Clear</Text>
        </Pressable>
      ) : null}

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator />
          <Text style={styles.mutedText}>Searching...</Text>
        </View>
      ) : error ? (
        <View style={styles.centerState}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item._id}
          contentContainerStyle={results.length ? styles.list : styles.centerState}
          ListEmptyComponent={
            <Text style={styles.mutedText}>
              {searched ? 'No matching memories.' : 'Search can handle rough spellings.'}
            </Text>
          }
          renderItem={({ item }) => <MemoryCard memory={item} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 16,
    paddingTop: 12
  },
  header: {
    marginBottom: 12
  },
  eyebrow: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 2,
    textTransform: 'uppercase'
  },
  title: {
    color: colors.text,
    fontSize: 24,
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
  searchButton: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingHorizontal: 15,
    paddingVertical: 11
  },
  searchButtonPressed: {
    backgroundColor: colors.accentPressed
  },
  searchButtonText: {
    color: colors.surface,
    fontWeight: '800'
  },
  clearText: {
    color: colors.accent,
    fontWeight: '800',
    marginBottom: 10
  },
  list: {
    paddingBottom: 88
  },
  centerState: {
    alignItems: 'center',
    flex: 1,
    gap: 12,
    justifyContent: 'center',
    paddingBottom: 80
  },
  mutedText: {
    color: colors.textMuted,
    textAlign: 'center'
  },
  errorText: {
    color: colors.danger,
    textAlign: 'center'
  }
});
