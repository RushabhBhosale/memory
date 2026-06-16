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

import { MemoryCard } from '../../components/MemoryCard';
import { listMemories, type Memory } from '../../services/api';
import { cardShadow, colors } from '../../styles/theme';
import {
  formatDayHeading,
  formatDayLabel,
  groupMemoriesByDay
} from '../../utils/memoryDates';

export default function CalendarScreen() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [selectedDay, setSelectedDay] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const groupedMemories = useMemo(() => groupMemoriesByDay(memories), [memories]);
  const days = useMemo(() => Object.keys(groupedMemories).sort().reverse(), [groupedMemories]);
  const selectedMemories = selectedDay ? groupedMemories[selectedDay] || [] : [];

  const loadMemories = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const nextMemories = await listMemories();
      const nextGroups = groupMemoriesByDay(nextMemories);
      const nextDays = Object.keys(nextGroups).sort().reverse();

      setMemories(nextMemories);
      setSelectedDay((currentDay) =>
        currentDay && nextGroups[currentDay] ? currentDay : nextDays[0] || ''
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load calendar');
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
        <Text style={styles.eyebrow}>Calendar</Text>
        <Text style={styles.title}>By day</Text>
      </View>

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator />
          <Text style={styles.mutedText}>Loading calendar...</Text>
        </View>
      ) : error ? (
        <View style={styles.centerState}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.secondaryButton} onPress={loadMemories}>
            <Text style={styles.secondaryButtonText}>Try again</Text>
          </Pressable>
        </View>
      ) : days.length ? (
        <>
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
                  <Text style={[styles.dayLabel, isSelected && styles.selectedDayText]}>
                    {formatDayLabel(day)}
                  </Text>
                  <Text style={[styles.dayCount, isSelected && styles.selectedDayText]}>
                    {groupedMemories[day].length} saved
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <Text style={styles.sectionTitle}>{formatDayHeading(selectedDay)}</Text>
          <FlatList
            data={selectedMemories}
            keyExtractor={(item) => item._id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => <MemoryCard memory={item} />}
          />
        </>
      ) : (
        <View style={styles.centerState}>
          <Text style={styles.mutedText}>No saved days yet.</Text>
        </View>
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
    borderRadius: 8,
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
    fontWeight: '800',
    marginBottom: 4
  },
  dayCount: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700'
  },
  selectedDayText: {
    color: colors.surface
  },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 10
  },
  list: {
    paddingBottom: 88
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
