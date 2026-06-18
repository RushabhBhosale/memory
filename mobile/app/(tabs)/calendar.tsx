import { Ionicons } from '@expo/vector-icons';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MemoryCard } from '../../components/MemoryCard';
import { listActivity, type ActivityItem } from '../../services/api';
import { cardShadow, colors, subtleShadow } from '../../styles/theme';
import { formatDayHeading, formatDayLabel } from '../../utils/memoryDates';

const monthFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'long',
  year: 'numeric'
});

const shortWeekdayFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: 'short'
});

const getDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;

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

const getMonthDays = (anchorDate: Date) => {
  const year = anchorDate.getFullYear();
  const month = anchorDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();

  return Array.from({ length: daysInMonth }, (_, index) => {
    const date = new Date(year, month, index + 1);

    return {
      key: getDateKey(date),
      date,
      day: index + 1,
      disabled: date.getTime() > today.getTime()
    };
  });
};

export default function CalendarScreen() {
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [selectedDay, setSelectedDay] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const groupedActivity = useMemo(() => groupActivityByDay(activity), [activity]);
  const days = useMemo(() => Object.keys(groupedActivity).sort().reverse(), [groupedActivity]);
  const selectedActivity = selectedDay ? groupedActivity[selectedDay] || [] : [];
  const anchorDate = useMemo(
    () => (selectedDay ? new Date(`${selectedDay}T00:00:00`) : new Date()),
    [selectedDay]
  );
  const monthDays = useMemo(() => getMonthDays(anchorDate), [anchorDate]);
  const selectedMonthCount = useMemo(() => {
    const monthKey = `${anchorDate.getFullYear()}-${String(anchorDate.getMonth() + 1).padStart(
      2,
      '0'
    )}`;
    return activity.filter((item) => getDateKey(new Date(item.createdAt)).startsWith(monthKey)).length;
  }, [activity, anchorDate]);

  const loadActivity = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const nextActivity = await listActivity({ limit: 500 });
      const nextGroups = groupActivityByDay(nextActivity);
      const nextDays = Object.keys(nextGroups).sort().reverse();

      setActivity(nextActivity);
      setSelectedDay((currentDay) =>
        currentDay && nextGroups[currentDay] ? currentDay : nextDays[0] || getDateKey(new Date())
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load calendar');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadActivity();
    }, [loadActivity])
  );

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>Calendar</Text>
          <Text style={styles.title}>Activity by day</Text>
        </View>
        <View style={styles.headerIcon}>
          <Ionicons color={colors.primary} name="calendar-clear-outline" size={22} />
        </View>
      </View>

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.mutedText}>Loading calendar...</Text>
        </View>
      ) : error ? (
        <View style={styles.centerState}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.secondaryButton} onPress={loadActivity}>
            <Text style={styles.secondaryButtonText}>Try again</Text>
          </Pressable>
        </View>
      ) : activity.length ? (
        <>
          <View style={styles.monthPanel}>
            <View>
              <Text style={styles.monthLabel}>{monthFormatter.format(anchorDate)}</Text>
              <Text style={styles.monthMeta}>
                {selectedMonthCount} saved across {days.length} active days
              </Text>
            </View>
            <View style={styles.monthCount}>
              <Text style={styles.monthCountValue}>{selectedActivity.length}</Text>
              <Text style={styles.monthCountLabel}>selected</Text>
            </View>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.monthScroller}
            contentContainerStyle={styles.monthScrollerContent}
          >
            {monthDays.map((day) => {
              const count = groupedActivity[day.key]?.length || 0;
              const isSelected = day.key === selectedDay;

              return (
                <Pressable
                  key={day.key}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected, disabled: day.disabled }}
                  disabled={day.disabled}
                  style={[
                    styles.dayCell,
                    isSelected && styles.selectedDayCell,
                    day.disabled && styles.disabledDayCell
                  ]}
                  onPress={() => setSelectedDay(day.key)}
                >
                  <Text style={[styles.weekday, isSelected && styles.selectedDayText]}>
                    {shortWeekdayFormatter.format(day.date)}
                  </Text>
                  <Text style={[styles.dayNumber, isSelected && styles.selectedDayText]}>
                    {day.day}
                  </Text>
                  <View style={styles.dotRow}>
                    {groupedActivity[day.key]?.slice(0, 3).map((item) => (
                      <View
                        key={`${item.type}-${item._id}`}
                        style={[styles.dot, { backgroundColor: getActivityTone(item) }]}
                      />
                    ))}
                    {count > 3 ? <Text style={styles.moreDots}>+</Text> : null}
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.dayScroller}
            contentContainerStyle={styles.dayScrollerContent}
          >
            {days.map((day) => {
              const isSelected = day === selectedDay;

              return (
                <Pressable
                  key={day}
                  style={[styles.dayChip, isSelected && styles.selectedDayChip]}
                  onPress={() => setSelectedDay(day)}
                >
                  <Text style={[styles.dayLabel, isSelected && styles.selectedChipText]}>
                    {formatDayLabel(day)}
                  </Text>
                  <Text style={[styles.dayCount, isSelected && styles.selectedChipText]}>
                    {groupedActivity[day].length} saved
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{formatDayHeading(selectedDay)}</Text>
            <Text style={styles.sectionCount}>{selectedActivity.length}</Text>
          </View>

          <FlatList
            data={selectedActivity}
            keyExtractor={(item) => `${item.type}-${item._id}`}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => <MemoryCard memory={item} />}
            showsVerticalScrollIndicator={false}
          />
        </>
      ) : (
        <View style={styles.centerState}>
          <Ionicons color={colors.textSoft} name="calendar-outline" size={34} />
          <Text style={styles.mutedText}>No saved activity yet.</Text>
        </View>
      )}
    </SafeAreaView>
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
    backgroundColor: colors.black,
    borderRadius: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
    padding: 16
  },
  monthLabel: {
    color: colors.white,
    fontSize: 21,
    fontWeight: '900',
    lineHeight: 26
  },
  monthMeta: {
    color: '#C9D1CC',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4
  },
  monthCount: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    minWidth: 76,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  monthCountValue: {
    color: colors.accent,
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 28
  },
  monthCountLabel: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '800'
  },
  monthScroller: {
    flexGrow: 0,
    marginBottom: 12
  },
  monthScrollerContent: {
    gap: 8,
    paddingRight: 8
  },
  dayCell: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    height: 82,
    justifyContent: 'center',
    width: 58,
    ...subtleShadow
  },
  selectedDayCell: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  disabledDayCell: {
    opacity: 0.35
  },
  weekday: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 5
  },
  dayNumber: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 24
  },
  selectedDayText: {
    color: colors.white
  },
  dotRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 3,
    height: 11,
    marginTop: 7
  },
  dot: {
    borderRadius: 999,
    height: 5,
    width: 5
  },
  moreDots: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '900',
    lineHeight: 11
  },
  dayScroller: {
    flexGrow: 0,
    marginBottom: 14
  },
  dayScrollerContent: {
    gap: 8,
    paddingRight: 8
  },
  dayChip: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    minWidth: 118,
    paddingHorizontal: 12,
    paddingVertical: 10,
    ...cardShadow
  },
  selectedDayChip: {
    backgroundColor: colors.accent,
    borderColor: colors.accent
  },
  dayLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
    marginBottom: 4
  },
  dayCount: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '800'
  },
  selectedChipText: {
    color: colors.black
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10
  },
  sectionTitle: {
    color: colors.text,
    flex: 1,
    fontSize: 15,
    fontWeight: '900'
  },
  sectionCount: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '900',
    marginLeft: 12
  },
  list: {
    paddingBottom: 88
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
