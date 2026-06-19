import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MemoryCard } from '../../components/MemoryCard';
import { StateView } from '../../components/StateView';
import {
  listActivity,
  listMemories,
  listProjects,
  type ActivityItem
} from '../../services/api';
import { scheduleUpcomingMemoryReminders } from '../../services/notifications';
import { colors, subtleShadow } from '../../styles/theme';

type IconName = keyof typeof Ionicons.glyphMap;

const dayFormatter = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
const sectionDateFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric'
});

const getDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;

const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

const getWeekDays = () => {
  const today = new Date();
  const todayStart = startOfDay(today).getTime();
  const currentDay = today.getDay();
  const mondayOffset = currentDay === 0 ? -6 : 1 - currentDay;

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() + mondayOffset + index);

    return {
      key: getDateKey(date),
      label: dayFormatter.format(date),
      day: date.getDate(),
      disabled: startOfDay(date).getTime() > todayStart
    };
  });
};

const quickCards = [
  {
    title: 'Task',
    body: 'Work to finish',
    icon: 'checkbox-outline',
    mode: 'task',
    tone: colors.workTag
  },
  {
    title: 'Note',
    body: 'Save context',
    icon: 'document-text-outline',
    mode: 'personal',
    tone: colors.personalTag
  },
  {
    title: 'Reminder',
    body: 'Remember later',
    icon: 'notifications-outline',
    mode: 'reminder',
    tone: colors.reminderTag
  },
  {
    title: 'Project',
    body: 'Requirement or detail',
    icon: 'folder-open-outline',
    mode: 'project',
    tone: colors.projectTag
  }
] as const satisfies ReadonlyArray<{
  body: string;
  icon: IconName;
  mode: string;
  title: string;
  tone: string;
}>;

const getActivityTone = (item?: ActivityItem) => {
  if (!item) {
    return colors.primary;
  }

  switch (item.type) {
    case 'task':
      return colors.workTag;
    case 'meeting':
      return colors.reminderTag;
    case 'note':
      return colors.projectTag;
    default:
      break;
  }

  switch (item.kind) {
    case 'task':
    case 'work_done':
      return colors.workTag;
    case 'credential':
      return colors.reminderTag;
    case 'requirement':
      return colors.projectTag;
    default:
      return colors.personalTag;
  }
};

const getTodayCount = (items: ActivityItem[]) => {
  const todayKey = getDateKey(new Date());
  return items.filter((item) => getDateKey(new Date(item.createdAt)) === todayKey).length;
};

export default function HomeScreen() {
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [projectCount, setProjectCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [selectedDayKey, setSelectedDayKey] = useState(() => getDateKey(new Date()));
  const weekDays = useMemo(() => getWeekDays(), []);
  const selectedLogs = useMemo(
    () =>
      activity.filter((item) => getDateKey(new Date(item.createdAt)) === selectedDayKey),
    [activity, selectedDayKey]
  );
  const todayCount = useMemo(() => getTodayCount(activity), [activity]);
  const latestLog = activity[0];
  const latestTone = getActivityTone(latestLog);

  const loadMemories = useCallback(async (options?: { refreshing?: boolean }) => {
    try {
      if (options?.refreshing) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError('');

      const [nextActivity, nextMemories, nextProjects] = await Promise.all([
        listActivity({ limit: 300 }),
        listMemories(),
        listProjects()
      ]);

      setActivity(nextActivity);
      setProjectCount(nextProjects.length);
      void scheduleUpcomingMemoryReminders(nextMemories);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load memories');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadMemories();
    }, [loadMemories])
  );

  if (loading) {
    return (
      <SafeAreaView edges={['top']} style={styles.screen}>
        <StateView title="Loading" detail="Syncing your workspace." loading />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView edges={['top']} style={styles.screen}>
        <StateView
          title={error}
          tone="error"
          actionLabel="Try again"
          onAction={loadMemories}
        />
      </SafeAreaView>
    );
  }

  const selectedDateTitle =
    selectedDayKey === getDateKey(new Date())
      ? 'Today'
      : sectionDateFormatter.format(new Date(`${selectedDayKey}T00:00:00`));

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.primary}
            colors={[colors.primary]}
            onRefresh={() => loadMemories({ refreshing: true })}
          />
        }
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>Memory workspace</Text>
            <Text style={styles.greeting}>Hi, Rushabh</Text>
          </View>
          <Pressable
            accessibilityLabel="Search memories"
            accessibilityRole="button"
            style={styles.iconButton}
            onPress={() => router.push('/search')}
          >
            <Ionicons color={colors.text} name="search-outline" size={21} />
          </Pressable>
        </View>

        <View style={styles.commandPanel}>
          <View style={styles.commandCopy}>
            <Text style={styles.commandLabel}>Today</Text>
            <Text style={styles.commandTitle}>
              {todayCount ? `${todayCount} items captured` : 'Ready to capture'}
            </Text>
            <Text style={styles.commandBody}>
              {latestLog?.title || 'Add the next useful detail before it slips away.'}
            </Text>
          </View>
          <Pressable
            accessibilityLabel="Add new memory"
            accessibilityRole="button"
            style={styles.addButton}
            onPress={() => router.push('/add')}
          >
            <Ionicons color={colors.white} name="add" size={26} />
          </Pressable>
        </View>

        <View style={styles.statsGrid}>
          <Pressable
            accessibilityLabel="Open calendar"
            accessibilityRole="button"
            style={styles.statCard}
            onPress={() => router.push('/calendar')}
          >
            <Text style={styles.statValue}>{todayCount}</Text>
            <Text style={styles.statLabel}>Today</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Open search"
            accessibilityRole="button"
            style={styles.statCard}
            onPress={() => router.push('/search')}
          >
            <Text style={styles.statValue}>{activity.length}</Text>
            <Text style={styles.statLabel}>Activity</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Open projects"
            accessibilityRole="button"
            style={styles.statCard}
            onPress={() => router.push('/projects')}
          >
            <Text style={styles.statValue}>{projectCount}</Text>
            <Text style={styles.statLabel}>Projects</Text>
          </Pressable>
        </View>

        <View style={styles.weekPanel}>
          {weekDays.map((day) => {
            const selected = day.key === selectedDayKey;

            return (
              <Pressable
                key={day.key}
                accessibilityRole="button"
                accessibilityState={{ disabled: day.disabled, selected }}
                disabled={day.disabled}
                style={[
                  styles.dayColumn,
                  selected && styles.selectedDayColumn,
                  day.disabled && styles.disabledDayColumn
                ]}
                onPress={() => setSelectedDayKey(day.key)}
              >
                <Text
                  style={[
                    styles.dayLabel,
                    selected && styles.selectedDayLabel,
                    day.disabled && styles.disabledDayText
                  ]}
                >
                  {day.label}
                </Text>
                <Text
                  style={[
                    styles.dayNumber,
                    selected && styles.selectedDayNumber,
                    day.disabled && styles.disabledDayText
                  ]}
                >
                  {day.day}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Quick Add</Text>
          <Pressable onPress={() => router.push('/add')}>
            <Text style={styles.linkText}>New</Text>
          </Pressable>
        </View>

        <View style={styles.quickGrid}>
          {quickCards.map((card) => (
            <Pressable
              key={card.title}
              accessibilityLabel={card.title}
              accessibilityRole="button"
              style={styles.quickCard}
              onPress={() =>
                router.push({
                  pathname: '/add',
                  params: { mode: card.mode }
                })
              }
            >
              <View style={[styles.quickIcon, { backgroundColor: `${card.tone}1F` }]}>
                <Ionicons color={card.tone} name={card.icon} size={19} />
              </View>
              <View style={styles.quickCopy}>
                <Text style={styles.quickTitle}>{card.title}</Text>
                <Text numberOfLines={1} style={styles.quickBody}>
                  {card.body}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Latest Activity</Text>
          <Text style={styles.countText}>{activity.length}</Text>
        </View>

        <Pressable
          accessibilityLabel={
            latestLog ? `Open ${latestLog.title}` : 'Add your first memory'
          }
          accessibilityRole="button"
          style={styles.latestCard}
          onPress={() => {
            if (latestLog) {
              router.push({
                pathname: '/activity/[type]/[id]',
                params: { id: latestLog._id, type: latestLog.type }
              });
              return;
            }

            router.push('/add');
          }}
        >
          <View style={[styles.latestIcon, { backgroundColor: `${latestTone}1F` }]}>
            <Ionicons color={latestTone} name="sparkles-outline" size={20} />
          </View>
          <View style={styles.latestCopy}>
            <Text style={styles.latestLabel}>{latestLog ? 'Most recent' : 'No items yet'}</Text>
            <Text numberOfLines={2} style={styles.latestTitle}>
              {latestLog?.title || 'Create your first memory'}
            </Text>
            <Text numberOfLines={2} style={styles.latestBody}>
              {latestLog?.content || 'Tasks, notes, meetings, reminders, and logs show up here.'}
            </Text>
          </View>
          <Ionicons color={colors.textSoft} name="chevron-forward" size={20} />
        </Pressable>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{selectedDateTitle} Timeline</Text>
          <Text style={styles.countText}>{selectedLogs.length}</Text>
        </View>

        {selectedLogs.length ? (
          selectedLogs
            .slice(0, 12)
            .map((memory) => (
              <MemoryCard key={`${memory.type}-${memory._id}`} memory={memory} />
            ))
        ) : (
          <View style={styles.emptyCard}>
            <Ionicons color={colors.textSoft} name="calendar-clear-outline" size={24} />
            <Text style={styles.emptyTitle}>No activity for {selectedDateTitle}</Text>
            <Text style={styles.emptyText}>
              Add a task, note, reminder, or memory and it will land in this timeline.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background
  },
  content: {
    padding: 18,
    paddingBottom: 92
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14
  },
  eyebrow: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0,
    marginBottom: 2,
    textTransform: 'uppercase'
  },
  greeting: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '900',
    lineHeight: 36
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
    ...subtleShadow
  },
  commandPanel: {
    alignItems: 'center',
    backgroundColor: colors.black,
    borderRadius: 16,
    flexDirection: 'row',
    gap: 14,
    marginBottom: 12,
    padding: 18
  },
  commandCopy: {
    flex: 1
  },
  commandLabel: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 6,
    textTransform: 'uppercase'
  },
  commandTitle: {
    color: colors.white,
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 29,
    marginBottom: 6
  },
  commandBody: {
    color: '#C9D1CC',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18
  },
  addButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 14,
    height: 52,
    justifyContent: 'center',
    width: 52
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16
  },
  statCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    padding: 13,
    ...subtleShadow
  },
  statValue: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 28
  },
  statLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 3
  },
  weekPanel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 22,
    padding: 6,
    ...subtleShadow
  },
  dayColumn: {
    alignItems: 'center',
    borderRadius: 10,
    flex: 1,
    gap: 4,
    paddingVertical: 9
  },
  selectedDayColumn: {
    backgroundColor: colors.primary
  },
  disabledDayColumn: {
    opacity: 0.42
  },
  dayLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '800'
  },
  selectedDayLabel: {
    color: colors.white
  },
  dayNumber: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '900'
  },
  selectedDayNumber: {
    color: colors.white
  },
  disabledDayText: {
    color: colors.textSoft
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900'
  },
  linkText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '900'
  },
  countText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '900'
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 22
  },
  quickCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 68,
    padding: 12,
    width: '48.5%',
    ...subtleShadow
  },
  quickIcon: {
    alignItems: 'center',
    borderRadius: 10,
    height: 38,
    justifyContent: 'center',
    width: 38
  },
  quickCopy: {
    flex: 1,
    minWidth: 0
  },
  quickTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
    marginBottom: 2
  },
  quickBody: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700'
  },
  latestCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    marginBottom: 22,
    padding: 14,
    ...subtleShadow
  },
  latestIcon: {
    alignItems: 'center',
    borderRadius: 10,
    height: 42,
    justifyContent: 'center',
    width: 42
  },
  latestCopy: {
    flex: 1,
    minWidth: 0
  },
  latestLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '900',
    marginBottom: 3,
    textTransform: 'uppercase'
  },
  latestTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
    lineHeight: 20,
    marginBottom: 3
  },
  latestBody: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17
  },
  emptyCard: {
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
    padding: 16,
    ...subtleShadow
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900'
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19
  }
});
