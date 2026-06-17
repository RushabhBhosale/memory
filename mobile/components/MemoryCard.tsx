import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import type { Memory } from '../services/api';
import { colors, subtleShadow } from '../styles/theme';
import { formatDate } from '../utils/memoryDates';

type MemoryCardProps = {
  memory: Memory;
};

const getKindLabel = (kind?: Memory['kind']) => {
  switch (kind) {
    case 'task':
      return 'Task';
    case 'work_done':
      return 'Work';
    case 'requirement':
      return 'Project';
    case 'credential':
      return 'Reminder';
    default:
      return 'Personal';
  }
};

const getProjectName = (memory: Memory) =>
  memory.projectId && typeof memory.projectId === 'object' ? memory.projectId.name : '';

const getKindTone = (kind?: Memory['kind']) => {
  switch (kind) {
    case 'task':
    case 'work_done':
      return colors.workTag;
    case 'requirement':
      return colors.projectTag;
    case 'credential':
      return colors.reminderTag;
    default:
      return colors.personalTag;
  }
};

const getCategoryTone = (memory: Memory, projectName: string) => {
  const category = memory.category.toLowerCase();

  if (projectName) {
    return colors.projectTag;
  }

  if (category.includes('work') || memory.kind === 'task' || memory.kind === 'work_done') {
    return colors.workTag;
  }

  if (category.includes('reminder') || memory.kind === 'credential') {
    return colors.reminderTag;
  }

  if (category.includes('project') || memory.kind === 'requirement') {
    return colors.projectTag;
  }

  return colors.personalTag;
};

const getCategoryLabel = (memory: Memory, projectName: string) => {
  if (projectName) {
    return projectName;
  }

  return memory.category || 'general';
};

const getToneSurface = (tone: string) => `${tone}1F`;

export function MemoryCard({ memory }: MemoryCardProps) {
  const projectName = getProjectName(memory);
  const kindTone = getKindTone(memory.kind);
  const categoryTone = getCategoryTone(memory, projectName);

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
      <View style={styles.mainRow}>
        <View style={[styles.marker, { backgroundColor: kindTone }]} />
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
          <Text style={[styles.tagText, { color: kindTone }]}>{getKindLabel(memory.kind)}</Text>
        </View>
        <View style={[styles.tagPill, { backgroundColor: getToneSurface(categoryTone) }]}>
          <Text style={[styles.tagText, { color: categoryTone }]}>
            {getCategoryLabel(memory, projectName)}
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
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 10,
    padding: 12,
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
  marker: {
    borderRadius: 999,
    height: 38,
    marginTop: 1,
    width: 5
  },
  copy: {
    flex: 1
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
    lineHeight: 20,
    marginBottom: 3
  },
  content: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18
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
    paddingLeft: 15
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
