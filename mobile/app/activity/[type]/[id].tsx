import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import {
  getActivityItem,
  type ActivityItem,
  type ActivityType
} from '../../../services/api';
import { colors, subtleShadow } from '../../../styles/theme';

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));

const formatDateOnly = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: 'long'
  }).format(new Date(value));

const getActivityLabel = (item: ActivityItem) => {
  switch (item.type) {
    case 'task':
      return 'Task';
    case 'meeting':
      return 'Meeting';
    case 'note':
      return item.kind === 'work_done' ? 'Work' : 'Note';
    default:
      return item.category === 'reminder' ? 'Reminder' : 'Memory';
  }
};

const getActivityTone = (item: ActivityItem) => {
  switch (item.type) {
    case 'task':
      return colors.workTag;
    case 'meeting':
      return colors.reminderTag;
    case 'note':
      return colors.projectTag;
    default:
      return item.category === 'reminder' ? colors.reminderTag : colors.personalTag;
  }
};

const getProjectId = (item: ActivityItem) => {
  if (!item.projectId) {
    return '';
  }

  if (typeof item.projectId === 'string') {
    return item.projectId;
  }

  return item.projectId._id;
};

const getProjectName = (item: ActivityItem) =>
  item.projectName ||
  (item.projectId && typeof item.projectId === 'object' ? item.projectId.name : '');

const getParam = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value || '';

export default function ActivityDetailScreen() {
  const params = useLocalSearchParams<{ id: string; type: ActivityType }>();
  const id = getParam(params.id);
  const type = getParam(params.type) as ActivityType;

  const [item, setItem] = useState<ActivityItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadItem = useCallback(async () => {
    if (!id || !type) {
      setError('Activity id is missing');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError('');
      setItem(await getActivityItem(type, id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load details');
    } finally {
      setLoading(false);
    }
  }, [id, type]);

  useEffect(() => {
    loadItem();
  }, [loadItem]);

  if (loading) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.mutedText}>Loading details...</Text>
      </View>
    );
  }

  if (error && !item) {
    return (
      <View style={styles.centerState}>
        <Text style={styles.errorText}>{error}</Text>
        <Pressable style={styles.secondaryButton} onPress={loadItem}>
          <Text style={styles.secondaryButtonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  if (!item) {
    return (
      <View style={styles.centerState}>
        <Text style={styles.mutedText}>Activity not found.</Text>
      </View>
    );
  }

  const tone = getActivityTone(item);
  const projectName = getProjectName(item);
  const projectId = getProjectId(item);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.headerPanel}>
        <Text style={styles.dateHero}>{formatDateOnly(item.createdAt)}</Text>
        <Text style={styles.title}>{item.title}</Text>

        <View style={styles.tagRow}>
          <View style={[styles.tagPill, { backgroundColor: `${tone}1F` }]}>
            <Text style={[styles.tagText, { color: tone }]}>{getActivityLabel(item)}</Text>
          </View>
          {item.status ? (
            <View style={styles.tagPill}>
              <Text style={styles.tagText}>{item.status}</Text>
            </View>
          ) : null}
          {projectName ? (
            <View style={[styles.tagPill, { backgroundColor: `${colors.projectTag}1F` }]}>
              <Text style={[styles.tagText, { color: colors.projectTag }]}>{projectName}</Text>
            </View>
          ) : null}
          {item.tags.map((tag) => (
            <View key={tag} style={styles.tagPill}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.metaCard}>
        <View style={styles.metaBlock}>
          <Text style={styles.metaLabel}>Created</Text>
          <Text style={styles.metaValue}>{formatDateTime(item.createdAt)}</Text>
        </View>
        <View style={styles.metaDivider} />
        <View style={styles.metaBlock}>
          <Text style={styles.metaLabel}>Importance</Text>
          <Text style={styles.metaValue}>{item.importance || 3}/5</Text>
        </View>
      </View>

      {item.reminderAt ? (
        <View style={styles.infoCard}>
          <Text style={styles.metaLabel}>Reminder</Text>
          <Text style={styles.metaValue}>{formatDateTime(item.reminderAt)}</Text>
        </View>
      ) : null}

      <View style={styles.bodyCard}>
        {item.content ? (
          <Text style={styles.body}>{item.content}</Text>
        ) : (
          <Text style={styles.emptyBody}>No additional details.</Text>
        )}
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {projectId ? (
        <Pressable
          style={styles.primaryButton}
          onPress={() =>
            router.push({
              pathname: '/projects/[id]',
              params: { id: projectId }
            })
          }
        >
          <Text style={styles.primaryButtonText}>Open project</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background
  },
  content: {
    padding: 20,
    paddingBottom: 38
  },
  headerPanel: {
    alignItems: 'center',
    paddingTop: 8
  },
  dateHero: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 12
  },
  title: {
    color: colors.text,
    fontSize: 32,
    fontWeight: '900',
    lineHeight: 38,
    marginBottom: 16,
    textAlign: 'center'
  },
  tagRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center'
  },
  tagPill: {
    backgroundColor: colors.surface,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    ...subtleShadow
  },
  tagText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'capitalize'
  },
  metaCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 24,
    padding: 16,
    ...subtleShadow
  },
  metaBlock: {
    flex: 1
  },
  metaDivider: {
    backgroundColor: colors.border,
    marginHorizontal: 14,
    width: 1
  },
  metaLabel: {
    color: colors.textSoft,
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 6,
    textTransform: 'uppercase'
  },
  metaValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 19
  },
  infoCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 12,
    padding: 16,
    ...subtleShadow
  },
  bodyCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 14,
    padding: 18,
    ...subtleShadow
  },
  body: {
    color: colors.text,
    fontSize: 17,
    lineHeight: 26
  },
  emptyBody: {
    color: colors.textSoft,
    fontSize: 15,
    lineHeight: 22
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 999,
    marginTop: 18,
    padding: 15
  },
  primaryButtonText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '900'
  },
  secondaryButton: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  secondaryButtonText: {
    color: colors.text,
    fontWeight: '800'
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
