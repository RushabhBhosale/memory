import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { MemoryCard } from '../../components/MemoryCard';
import { listMemories, type Memory } from '../../services/api';
import { colors } from '../../styles/theme';

export default function HomeScreen() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadMemories = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      setMemories(await listMemories());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load memories');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadMemories();
    }, [loadMemories])
  );

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>Memory</Text>
          <Text style={styles.title}>Recent</Text>
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

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator />
          <Text style={styles.mutedText}>Loading memories...</Text>
        </View>
      ) : error ? (
        <View style={styles.centerState}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.secondaryButton} onPress={loadMemories}>
            <Text style={styles.secondaryButtonText}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={memories}
          keyExtractor={(item) => item._id}
          contentContainerStyle={memories.length ? styles.list : styles.centerState}
          ListEmptyComponent={<Text style={styles.mutedText}>No memories yet.</Text>}
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
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
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
  primaryButton: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 9
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
    paddingVertical: 10
  },
  secondaryButtonText: {
    color: colors.text,
    fontWeight: '700'
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
    color: colors.textMuted
  },
  errorText: {
    color: colors.danger,
    textAlign: 'center'
  }
});
