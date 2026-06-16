import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import type { Memory } from '../services/api';
import { cardShadow, colors } from '../styles/theme';
import { formatDate } from '../utils/memoryDates';

type MemoryCardProps = {
  memory: Memory;
};

export function MemoryCard({ memory }: MemoryCardProps) {
  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={() =>
        router.push({
          pathname: '/memories/[id]',
          params: { id: memory._id }
        })
      }
    >
      <Text style={styles.title}>{memory.title}</Text>
      <Text style={styles.meta}>
        {memory.category} · {formatDate(memory.createdAt)}
      </Text>

      {memory.content ? (
        <Text numberOfLines={2} style={styles.content}>
          {memory.content}
        </Text>
      ) : null}

      {memory.tags.length ? (
        <View style={styles.tagRow}>
          {memory.tags.slice(0, 3).map((tag) => (
            <View key={tag} style={styles.tagPill}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 10,
    padding: 14,
    ...cardShadow
  },
  cardPressed: {
    opacity: 0.82
  },
  title: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 5
  },
  meta: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 7
  },
  content: {
    color: colors.textMuted,
    lineHeight: 20
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10
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
  }
});
