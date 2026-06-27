import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import type { ActivityItem, ActivityType, Memory } from '../services/api';
import { colors, subtleShadow } from '../styles/theme';
import { formatDate } from '../utils/memoryDates';

type MemoryCardProps = {
  memory: ActivityItem | Memory;
};

const getActivityType = (memory: ActivityItem | Memory): ActivityType =>
  'type' in memory ? memory.type : 'memory';

const getTransactionType = (memory: ActivityItem | Memory) =>
  'transactionType' in memory ? memory.transactionType : undefined;

const getKindLabel = (memory: ActivityItem | Memory) => {
  switch (getActivityType(memory)) {
    case 'expense':
      return getTransactionType(memory) === 'income' ? 'Income' : 'Expense';
    case 'task':
      return 'Task';
    case 'meeting':
      return 'Meeting';
    case 'note':
      return 'Note';
    default:
      break;
  }

  switch (memory.kind) {
    case 'task':
      return 'Task';
    case 'work_done':
      return 'Work';
    case 'requirement':
      return 'Note';
    case 'credential':
      return 'Vault';
    default:
      return 'Personal';
  }
};

const getKindTone = (memory: ActivityItem | Memory) => {
  switch (getActivityType(memory)) {
    case 'expense':
      return getTransactionType(memory) === 'income' ? colors.success : colors.primary;
    case 'task':
      return colors.workTag;
    case 'meeting':
      return colors.reminderTag;
    case 'note':
      return colors.personalTag;
    default:
      break;
  }

  switch (memory.kind) {
    case 'task':
    case 'work_done':
      return colors.workTag;
    case 'requirement':
      return colors.personalTag;
    case 'credential':
      return colors.success;
    default:
      return colors.personalTag;
  }
};

const getKindIcon = (memory: ActivityItem | Memory) => {
  switch (getActivityType(memory)) {
    case 'expense':
      return getTransactionType(memory) === 'income' ? 'trending-up-outline' : 'card-outline';
    case 'task':
      return 'checkbox-outline';
    case 'meeting':
      return 'people-outline';
    case 'note':
      return 'document-text-outline';
    default:
      break;
  }

  switch (memory.kind) {
    case 'task':
      return 'checkbox-outline';
    case 'work_done':
      return 'briefcase-outline';
    case 'requirement':
      return 'document-text-outline';
    case 'credential':
      return 'key-outline';
    default:
      return 'sparkles-outline';
  }
};

const getCategoryTone = (memory: ActivityItem | Memory) => {
  const category = memory.category.toLowerCase();

  if (category.includes('work') || memory.kind === 'task' || memory.kind === 'work_done') {
    return colors.workTag;
  }

  if (category.includes('reminder') || memory.kind === 'credential') {
    return memory.kind === 'credential' ? colors.success : colors.reminderTag;
  }

  return colors.personalTag;
};

const getCategoryLabel = (memory: ActivityItem | Memory) => memory.category || 'general';

const getToneSurface = (tone: string) => `${tone}1F`;

export function MemoryCard({ memory }: MemoryCardProps) {
  const kindTone = getKindTone(memory);
  const categoryTone = getCategoryTone(memory);
  const activityType = getActivityType(memory);
  const kindIcon = getKindIcon(memory);

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={() => {
        if (activityType === 'expense') {
          router.push('/(tabs)/expenses');
          return;
        }

        if (activityType === 'memory') {
          router.push({
            pathname: '/memories/[id]',
            params: { id: memory._id }
          });
          return;
        }

        router.push({
          pathname: '/activity/[type]/[id]',
          params: { id: memory._id, type: activityType }
        });
      }}
    >
      <View style={styles.mainRow}>
        <View style={[styles.iconWrap, { backgroundColor: getToneSurface(kindTone) }]}>
          <Ionicons color={kindTone} name={kindIcon} size={18} />
        </View>
        <View style={styles.copy}>
          <Text numberOfLines={1} style={styles.title}>
            {memory.title}
          </Text>
          {memory.content ? (
            <Text numberOfLines={1} style={styles.content}>
              {memory.content}
            </Text>
          ) : null}
        </View>
        <Text style={styles.date}>{formatDate(memory.createdAt)}</Text>
      </View>

      <View style={styles.tagRow}>
        <View style={[styles.tagPill, { backgroundColor: getToneSurface(kindTone) }]}>
          <Text style={[styles.tagText, { color: kindTone }]}>{getKindLabel(memory)}</Text>
        </View>
        <View style={[styles.tagPill, { backgroundColor: getToneSurface(categoryTone) }]}>
          <Text style={[styles.tagText, { color: categoryTone }]}>
            {getCategoryLabel(memory)}
          </Text>
        </View>
        {memory.tags.slice(0, 1).map((tag) => (
          <View key={tag} style={styles.tagPill}>
            <Text style={styles.tagText}>{tag}</Text>
          </View>
        ))}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    marginBottom: 12,
    padding: 14,
    ...subtleShadow
  },
  cardPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.992 }]
  },
  mainRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10
  },
  iconWrap: {
    alignItems: 'center',
    borderRadius: 9,
    height: 38,
    justifyContent: 'center',
    marginTop: 1,
    width: 38
  },
  copy: {
    flex: 1
  },
  title: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 18,
    marginBottom: 3
  },
  content: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19
  },
  date: {
    color: colors.textSoft,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 2
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
    paddingLeft: 48
  },
  tagPill: {
    backgroundColor: colors.backgroundSoft,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5
  },
  tagText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '800'
  }
});
