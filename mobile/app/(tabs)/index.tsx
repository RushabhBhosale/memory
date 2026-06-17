import { useCallback, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MemoryCard } from '../../components/MemoryCard';
import { StateView } from '../../components/StateView';
import { listMemories, listProjects, type Memory } from '../../services/api';
import { colors, subtleShadow } from '../../styles/theme';

const dayFormatter = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
const sectionDateFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric'
});

const getDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

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

const isToday = (value: string) => {
  const date = new Date(value);
  const today = new Date();

  return date.toDateString() === today.toDateString();
};

const quickCards = [
  {
    title: 'Add task',
    body: 'Capture project work',
    tone: colors.workTag,
    route: '/add'
  },
  {
    title: 'Personal note',
    body: 'Save a quick memory',
    tone: colors.personalTag,
    route: '/add'
  },
  {
    title: 'Reminder',
    body: 'Store something important',
    tone: colors.reminderTag,
    route: '/add'
  }
] as const;

export default function HomeScreen() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [projectCount, setProjectCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedDayKey, setSelectedDayKey] = useState(() => getDateKey(new Date()));
  const weekDays = useMemo(() => getWeekDays(), []);
  const selectedMemories = useMemo(
    () => memories.filter((item) => getDateKey(new Date(item.createdAt)) === selectedDayKey),
    [memories, selectedDayKey]
  );

  const loadMemories = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const [nextMemories, nextProjects] = await Promise.all([
        listMemories(),
        listProjects()
      ]);

      setMemories(nextMemories);
      setProjectCount(nextProjects.length);
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

  if (loading) {
    return (
      <SafeAreaView edges={['top']} style={styles.screen}>
        <StateView title="Loading" detail="Syncing your notes." loading />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView edges={['top']} style={styles.screen}>
        <StateView title={error} tone="error" actionLabel="Try again" onAction={loadMemories} />
      </SafeAreaView>
    );
  }

  const latestMemory = selectedMemories[0];
  const todayCount = memories.filter((item) => isToday(item.createdAt)).length;
  const selectedDateTitle =
    selectedDayKey === getDateKey(new Date())
      ? 'Today'
      : sectionDateFormatter.format(new Date(`${selectedDayKey}T00:00:00`));

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Hi, Rushabh</Text>
            <Text style={styles.subGreeting}>Your memory workspace</Text>
          </View>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>R</Text>
          </View>
        </View>

        <View style={styles.weekRow}>
          {weekDays.map((day) => {
            const selected = day.key === selectedDayKey;

            return (
              <Pressable
                key={day.key}
                accessibilityRole="button"
                accessibilityState={{ disabled: day.disabled, selected }}
                disabled={day.disabled}
                style={[styles.dayColumn, day.disabled && styles.disabledDayColumn]}
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
                <View
                  style={[
                    styles.dayBubble,
                    selected && styles.selectedDayBubble,
                    day.disabled && styles.disabledDayBubble
                  ]}
                >
                  <Text
                    style={[
                      styles.dayNumber,
                      selected && styles.selectedDayNumber,
                      day.disabled && styles.disabledDayText
                    ]}
                  >
                    {day.day}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>My Memory</Text>
          <Pressable onPress={() => router.push('/search')}>
            <Text style={styles.seeAll}>Search</Text>
          </Pressable>
        </View>

        <View style={styles.featureRow}>
          <Pressable style={styles.featureCard} onPress={() => router.push('/add')}>
            <Text style={styles.featureTitle}>
              {latestMemory?.title || `No logs for ${selectedDateTitle}`}
            </Text>
            <Text numberOfLines={2} style={styles.featureBody}>
              {latestMemory?.content || 'Tap plus to add a task, note, reminder, or memory.'}
            </Text>
            <View style={styles.featureStats}>
              <Text style={styles.featureStat}>{selectedMemories.length} logs</Text>
              <Text style={styles.featureStat}>{todayCount} today</Text>
            </View>
          </Pressable>

          <Pressable style={styles.sideCard} onPress={() => router.push('/projects')}>
            <Text style={styles.sideCardText}>Projects</Text>
            <Text style={styles.sideCardCount}>{projectCount}</Text>
          </Pressable>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Quick Add</Text>
          <Pressable onPress={() => router.push('/add')}>
            <Text style={styles.seeAll}>New</Text>
          </Pressable>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.quickRow}
        >
          {quickCards.map((card) => (
            <Pressable
              key={card.title}
              style={[styles.quickCard, { backgroundColor: `${card.tone}24` }]}
              onPress={() => router.push(card.route)}
            >
              <Text style={styles.quickTitle}>{card.title}</Text>
              <Text style={styles.quickBody}>{card.body}</Text>
              <View style={[styles.quickPill, { backgroundColor: card.tone }]}>
                <Text style={styles.quickPillText}>Add</Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{selectedDateTitle} Logs</Text>
          <Text style={styles.seeAll}>{selectedMemories.length}</Text>
        </View>

        {selectedMemories.length ? (
          selectedMemories
            .slice(0, 12)
            .map((memory) => <MemoryCard key={memory._id} memory={memory} />)
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No logs for {selectedDateTitle}</Text>
            <Text style={styles.emptyText}>Tap plus to add a task, note, reminder, or memory.</Text>
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
    paddingBottom: 88
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20
  },
  greeting: {
    color: colors.text,
    fontSize: 32,
    fontWeight: '900',
    lineHeight: 38
  },
  subGreeting: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 2
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44
  },
  avatarText: {
    color: colors.white,
    fontSize: 20,
    fontWeight: '900'
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24
  },
  dayColumn: {
    alignItems: 'center',
    gap: 8
  },
  dayLabel: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700'
  },
  selectedDayLabel: {
    color: colors.text
  },
  dayBubble: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 999,
    height: 42,
    justifyContent: 'center',
    width: 42,
    ...subtleShadow
  },
  selectedDayBubble: {
    backgroundColor: colors.primary
  },
  disabledDayColumn: {
    opacity: 0.45
  },
  disabledDayBubble: {
    backgroundColor: colors.backgroundSoft,
    shadowOpacity: 0
  },
  dayNumber: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800'
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
    marginBottom: 12
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 21,
    fontWeight: '900'
  },
  seeAll: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800'
  },
  featureRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 28
  },
  featureCard: {
    backgroundColor: colors.primary,
    borderRadius: 20,
    flex: 1,
    minHeight: 172,
    padding: 18,
    ...subtleShadow
  },
  featureTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 27,
    marginBottom: 8
  },
  featureBody: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20
  },
  featureStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 'auto'
  },
  featureStat: {
    backgroundColor: colors.white,
    borderRadius: 999,
    color: colors.text,
    fontSize: 12,
    fontWeight: '800',
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  sideCard: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: 20,
    justifyContent: 'center',
    minHeight: 172,
    width: 88
  },
  sideCardText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '900',
    transform: [{ rotate: '-90deg' }]
  },
  sideCardCount: {
    bottom: 16,
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
    position: 'absolute'
  },
  quickRow: {
    gap: 10,
    paddingRight: 18
  },
  quickCard: {
    borderRadius: 18,
    marginBottom: 26,
    minHeight: 126,
    padding: 16,
    width: 184
  },
  quickTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 9
  },
  quickBody: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 18
  },
  quickPill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    marginTop: 'auto',
    paddingHorizontal: 12,
    paddingVertical: 6
  },
  quickPillText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '900'
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    padding: 18
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '900',
    marginBottom: 5
  },
  emptyText: {
    color: colors.textMuted,
    lineHeight: 20
  }
});
