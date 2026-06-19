import { Ionicons } from '@expo/vector-icons';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MemoryCard } from '../../components/MemoryCard';
import { listActivity, type ActivityItem } from '../../services/api';
import { colors, subtleShadow } from '../../styles/theme';
import { formatDayHeading } from '../../utils/memoryDates';

type CalendarCell = {
  date: Date | null;
  day: number | null;
  key: string;
};

const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const monthFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'long',
  year: 'numeric'
});

const getDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;

const getMonthKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

const getStartOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

const getActivityTone = (item: ActivityItem) => {
  switch (item.type) {
    case 'task':
      return colors.workTag;
    case 'meeting':
      return colors.reminderTag;
    case 'note':
      return colors.projectTag;
    default:
      return colors.personalTag;
  }
};

const groupActivityByDay = (items: ActivityItem[]) =>
  items.reduce<Record<string, ActivityItem[]>>((groups, item) => {
    const dayKey = getDateKey(new Date(item.createdAt));

    if (!groups[dayKey]) {
      groups[dayKey] = [];
    }

    groups[dayKey].push(item);
    return groups;
  }, {});

const getMonthCells = (visibleMonth: Date): CalendarCell[] => {
  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: CalendarCell[] = [];

  for (let index = 0; index < firstDay.getDay(); index += 1) {
    cells.push({
      date: null,
      day: null,
      key: `empty-start-${index}`
    });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month, day);

    cells.push({
      date,
      day,
      key: getDateKey(date)
    });
  }

  while (cells.length % 7 !== 0 || cells.length < 42) {
    cells.push({
      date: null,
      day: null,
      key: `empty-end-${cells.length}`
    });
  }

  return cells;
};

const getRelativeMonth = (date: Date, offset: number) =>
  new Date(date.getFullYear(), date.getMonth() + offset, 1);

export default function CalendarScreen() {
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [selectedDay, setSelectedDay] = useState(() => getDateKey(new Date()));
  const [visibleMonth, setVisibleMonth] = useState(() => new Date());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const groupedActivity = useMemo(() => groupActivityByDay(activity), [activity]);
  const selectedActivity = selectedDay ? groupedActivity[selectedDay] || [] : [];
  const monthCells = useMemo(() => getMonthCells(visibleMonth), [visibleMonth]);
  const selectedMonthKey = getMonthKey(visibleMonth);
  const todayKey = getDateKey(new Date());
  const currentMonthKey = getMonthKey(new Date());
  const todayStart = getStartOfDay(new Date()).getTime();
  const monthActivityCount = useMemo(
    () =>
      activity.filter((item) => getDateKey(new Date(item.createdAt)).startsWith(selectedMonthKey))
        .length,
    [activity, selectedMonthKey]
  );
  const activeDaysThisMonth = useMemo(
    () => Object.keys(groupedActivity).filter((day) => day.startsWith(selectedMonthKey)).length,
    [groupedActivity, selectedMonthKey]
  );

  const loadActivity = useCallback(async (options?: { refreshing?: boolean }) => {
    try {
      if (options?.refreshing) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError('');

      const nextActivity = await listActivity({ limit: 500 });
      const nextTodayKey = getDateKey(new Date());

      setActivity(nextActivity);
      setSelectedDay((currentDay) => currentDay || nextTodayKey);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load calendar');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadActivity();
    }, [loadActivity])
  );

  const changeMonth = (offset: number) => {
    const nextMonth = getRelativeMonth(visibleMonth, offset);
    const nextMonthKey = getMonthKey(nextMonth);

    setVisibleMonth(nextMonth);
    setSelectedDay((currentDay) => {
      if (currentDay && currentDay.startsWith(nextMonthKey)) {
        return currentDay;
      }

      return nextMonthKey === currentMonthKey ? todayKey : '';
    });
  };

  const selectedHeading = selectedDay ? formatDayHeading(selectedDay) : 'Select a date';
  const selectedSubtitle = selectedDay
    ? selectedActivity.length
      ? `${selectedActivity.length} saved item${selectedActivity.length === 1 ? '' : 's'}`
      : 'No saved items on this date'
    : 'Tap a marked date to see saved details';

  const renderCalendarHeader = () => (
    <View>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>Calendar</Text>
          <Text style={styles.title}>Logged days</Text>
        </View>
        <View style={styles.headerIcon}>
          <Ionicons color={colors.primary} name="calendar-clear-outline" size={22} />
        </View>
      </View>

      <View style={styles.monthPanel}>
        <Pressable
          accessibilityLabel="Previous month"
          accessibilityRole="button"
          style={styles.monthButton}
          onPress={() => changeMonth(-1)}
        >
          <Ionicons color={colors.text} name="chevron-back" size={20} />
        </Pressable>
        <View style={styles.monthCopy}>
          <Text style={styles.monthLabel}>{monthFormatter.format(visibleMonth)}</Text>
          <Text style={styles.monthMeta}>
            {monthActivityCount} saved on {activeDaysThisMonth} days
          </Text>
        </View>
        <Pressable
          accessibilityLabel="Next month"
          accessibilityRole="button"
          style={styles.monthButton}
          onPress={() => changeMonth(1)}
        >
          <Ionicons color={colors.text} name="chevron-forward" size={20} />
        </Pressable>
      </View>

      <View style={styles.calendarCard}>
        <View style={styles.weekdayRow}>
          {weekdayLabels.map((weekday) => (
            <Text key={weekday} style={styles.weekdayLabel}>
              {weekday}
            </Text>
          ))}
        </View>

        <View style={styles.calendarGrid}>
          {monthCells.map((cell) => {
            if (!cell.date || !cell.day) {
              return <View key={cell.key} style={styles.emptyDayCell} />;
            }

            const dayKey = cell.key;
            const count = groupedActivity[dayKey]?.length || 0;
            const isSelected = dayKey === selectedDay;
            const isToday = dayKey === todayKey;
            const isFuture = getStartOfDay(cell.date).getTime() > todayStart;

            return (
              <Pressable
                key={dayKey}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected, disabled: isFuture }}
                disabled={isFuture}
                style={[
                  styles.calendarDay,
                  count > 0 && styles.loggedDay,
                  isSelected && styles.selectedCalendarDay,
                  isToday && !isSelected && styles.todayCalendarDay,
                  isFuture && styles.futureDay
                ]}
                onPress={() => setSelectedDay(dayKey)}
              >
                <Text
                  style={[
                    styles.calendarDayText,
                    count > 0 && styles.loggedDayText,
                    isSelected && styles.selectedCalendarDayText
                  ]}
                >
                  {cell.day}
                </Text>
                <View style={styles.markerRow}>
                  {groupedActivity[dayKey]?.slice(0, 3).map((item) => (
                    <View
                      key={`${item.type}-${item._id}`}
                      style={[styles.markerDot, { backgroundColor: getActivityTone(item) }]}
                    />
                  ))}
                </View>
                {count > 3 ? (
                  <Text style={[styles.moreCount, isSelected && styles.selectedCalendarDayText]}>
                    +{count - 3}
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.personalTag }]} />
          <Text style={styles.legendText}>Memory</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.workTag }]} />
          <Text style={styles.legendText}>Task</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.projectTag }]} />
          <Text style={styles.legendText}>Note</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.reminderTag }]} />
          <Text style={styles.legendText}>Meeting</Text>
        </View>
      </View>

      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionTitle}>{selectedHeading}</Text>
          <Text style={styles.sectionSubtitle}>{selectedSubtitle}</Text>
        </View>
        <View style={styles.sectionCountPill}>
          <Text style={styles.sectionCount}>{selectedActivity.length}</Text>
        </View>
      </View>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView edges={['top']} style={styles.screen}>
        <View style={styles.centerState}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.mutedText}>Loading calendar...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView edges={['top']} style={styles.screen}>
        <View style={styles.centerState}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.secondaryButton} onPress={() => loadActivity()}>
            <Text style={styles.secondaryButtonText}>Try again</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <FlatList
        data={selectedActivity}
        keyExtractor={(item) => `${item.type}-${item._id}`}
        ListHeaderComponent={renderCalendarHeader}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons color={colors.textSoft} name="calendar-outline" size={28} />
            <Text style={styles.emptyTitle}>
              {activity.length
                ? selectedDay
                  ? 'Nothing logged here'
                  : 'Select a logged date'
                : 'No saved activity yet'}
            </Text>
            <Text style={styles.emptyText}>
              {activity.length
                ? 'Pick a marked date to see saved logs, notes, tasks, and meetings.'
                : 'Saved memories, logs, tasks, notes, and meetings will appear on this calendar.'}
            </Text>
          </View>
        }
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.primary}
            colors={[colors.primary]}
            onRefresh={() => loadActivity({ refreshing: true })}
          />
        }
        renderItem={({ item }) => <MemoryCard memory={item} />}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 12,
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
    fontWeight: '900',
    marginBottom: 3,
    textTransform: 'uppercase'
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '900',
    lineHeight: 34
  },
  headerIcon: {
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
  monthPanel: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
    padding: 12,
    ...subtleShadow
  },
  monthButton: {
    alignItems: 'center',
    backgroundColor: colors.backgroundSoft,
    borderRadius: 10,
    height: 40,
    justifyContent: 'center',
    width: 40
  },
  monthCopy: {
    alignItems: 'center',
    flex: 1
  },
  monthLabel: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 25
  },
  monthMeta: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 3
  },
  calendarCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 12,
    padding: 10,
    ...subtleShadow
  },
  weekdayRow: {
    flexDirection: 'row',
    marginBottom: 6
  },
  weekdayLabel: {
    color: colors.textSoft,
    flex: 1,
    fontSize: 11,
    fontWeight: '900',
    textAlign: 'center',
    textTransform: 'uppercase'
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 6
  },
  emptyDayCell: {
    aspectRatio: 1,
    width: `${100 / 7}%`
  },
  calendarDay: {
    alignItems: 'center',
    aspectRatio: 1,
    borderColor: 'transparent',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    paddingVertical: 4,
    width: `${100 / 7}%`
  },
  loggedDay: {
    backgroundColor: colors.successSurface,
    borderColor: colors.borderStrong
  },
  selectedCalendarDay: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  todayCalendarDay: {
    borderColor: colors.primary
  },
  futureDay: {
    opacity: 0.35
  },
  calendarDayText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 18
  },
  loggedDayText: {
    color: colors.primary
  },
  selectedCalendarDayText: {
    color: colors.white
  },
  markerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 2,
    height: 7,
    justifyContent: 'center',
    marginTop: 4
  },
  markerDot: {
    borderRadius: 999,
    height: 4,
    width: 4
  },
  moreCount: {
    color: colors.textMuted,
    fontSize: 8,
    fontWeight: '900',
    lineHeight: 10,
    marginTop: 1
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 18
  },
  legendItem: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7
  },
  legendDot: {
    borderRadius: 999,
    height: 7,
    width: 7
  },
  legendText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '900'
  },
  sectionHeader: {
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
  sectionSubtitle: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 3
  },
  sectionCountPill: {
    alignItems: 'center',
    backgroundColor: colors.backgroundSoft,
    borderRadius: 999,
    minWidth: 34,
    paddingHorizontal: 10,
    paddingVertical: 7
  },
  sectionCount: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '900'
  },
  emptyState: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    gap: 7,
    padding: 18,
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
    lineHeight: 19,
    textAlign: 'center'
  },
  secondaryButton: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
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
    paddingBottom: 80
  },
  mutedText: {
    color: colors.textMuted,
    fontWeight: '700'
  },
  errorText: {
    color: colors.danger,
    textAlign: 'center'
  }
});
