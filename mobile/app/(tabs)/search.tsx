import { useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MemoryCard } from '../../components/MemoryCard';
import { ScreenHeader } from '../../components/ScreenHeader';
import { StateView } from '../../components/StateView';
import { searchActivity, type ActivityItem } from '../../services/api';
import { colors, subtleShadow } from '../../styles/theme';

const suggestions = ['sdk', 'secret key', 'activex', 'android build'];

export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');

  const runSearch = async (value = query, options?: { refreshing?: boolean }) => {
    const nextQuery = value.trim();

    if (!nextQuery) {
      setResults([]);
      setSearched(false);
      setError('');
      return;
    }

    try {
      if (options?.refreshing) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError('');
      setSearched(true);
      setQuery(nextQuery);
      setResults(await searchActivity(nextQuery));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to search activity');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const refreshSearch = () => {
    if (searched && query.trim()) {
      runSearch(query, { refreshing: true });
    }
  };

  const clearSearch = () => {
    setQuery('');
    setResults([]);
    setSearched(false);
    setError('');
  };

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScreenHeader
        eyebrow="Search"
        title="Find"
        subtitle="Search memories, tags, projects, and rough spellings."
      />

      <View style={styles.searchPanel}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => runSearch()}
          placeholder="Search your vault"
          placeholderTextColor={colors.textSoft}
          returnKeyType="search"
          style={styles.searchInput}
        />
        <Pressable
          style={({ pressed }) => [
            styles.searchButton,
            pressed && styles.searchButtonPressed
          ]}
          onPress={() => runSearch()}
        >
          <Text style={styles.searchButtonText}>Go</Text>
        </Pressable>
      </View>

      <View style={styles.suggestionRow}>
        {suggestions.map((item) => (
          <Pressable key={item} style={styles.suggestionChip} onPress={() => runSearch(item)}>
            <Text style={styles.suggestionText}>{item}</Text>
          </Pressable>
        ))}
        {query ? (
          <Pressable style={styles.clearChip} onPress={clearSearch}>
            <Text style={styles.clearText}>Clear</Text>
          </Pressable>
        ) : null}
      </View>

      {loading ? (
        <StateView title="Searching" detail="Checking saved context." loading />
      ) : error ? (
        <StateView title={error} tone="error" />
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item._id}
          contentContainerStyle={results.length ? styles.list : styles.emptyList}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              tintColor={colors.primary}
              colors={[colors.primary]}
              onRefresh={refreshSearch}
            />
          }
          ListHeaderComponent={
            results.length ? (
              <View style={styles.sectionRow}>
                <Text style={styles.sectionTitle}>Results</Text>
                <Text style={styles.sectionCount}>{results.length}</Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <StateView
              title={searched ? 'No matches found' : 'Start with a keyword'}
              detail={
                searched
                  ? 'Try a shorter phrase or a nearby word.'
                  : 'The search handles tags, project names, and rough spellings.'
              }
            />
          }
          renderItem={({ item }) => <MemoryCard memory={item} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 16
  },
  searchPanel: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
    padding: 8,
    ...subtleShadow
  },
  searchInput: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    color: colors.text,
    flex: 1,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 11
  },
  searchButton: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: 10,
    justifyContent: 'center',
    minWidth: 54,
    paddingHorizontal: 15,
    paddingVertical: 11
  },
  searchButtonPressed: {
    backgroundColor: colors.accentPressed
  },
  searchButtonText: {
    color: colors.white,
    fontWeight: '900'
  },
  suggestionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16
  },
  suggestionChip: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  suggestionText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '900'
  },
  clearChip: {
    backgroundColor: colors.dangerSurface,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  clearText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '900'
  },
  sectionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900'
  },
  sectionCount: {
    color: colors.textSoft,
    fontSize: 13,
    fontWeight: '800'
  },
  list: {
    paddingBottom: 82
  },
  emptyList: {
    flexGrow: 1
  }
});
