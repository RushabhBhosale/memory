import { Ionicons } from "@expo/vector-icons";
import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { MemoryCard } from "../../components/MemoryCard";
import { StateView } from "../../components/StateView";
import { listMemories, listProjects, type Memory } from "../../services/api";
import { scheduleUpcomingMemoryReminders } from "../../services/notifications";
import { colors, subtleShadow } from "../../styles/theme";

type IconName = keyof typeof Ionicons.glyphMap;

const dayFormatter = new Intl.DateTimeFormat(undefined, { weekday: "short" });
const sectionDateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
});

const getDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;

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
      disabled: startOfDay(date).getTime() > todayStart,
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
    title: "Add task",
    body: "Capture project work",
    icon: "checkbox-outline",
    mode: "task",
    tone: colors.workTag,
  },
  {
    title: "Personal note",
    body: "Save a quick memory",
    icon: "document-text-outline",
    mode: "personal",
    tone: colors.personalTag,
  },
  {
    title: "Reminder",
    body: "Store something important",
    icon: "notifications-outline",
    mode: "reminder",
    tone: colors.reminderTag,
  },
  {
    title: "Project context",
    body: "Requirement or detail",
    icon: "folder-open-outline",
    mode: "project",
    tone: colors.projectTag,
  },
] as const satisfies ReadonlyArray<{
  body: string;
  icon: IconName;
  mode: string;
  title: string;
  tone: string;
}>;

const getMemoryTone = (memory?: Memory) => {
  if (!memory) {
    return colors.primary;
  }

  switch (memory.kind) {
    case "task":
    case "work_done":
      return colors.workTag;
    case "credential":
      return colors.reminderTag;
    case "requirement":
      return colors.projectTag;
    default:
      return colors.personalTag;
  }
};

export default function HomeScreen() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [projectCount, setProjectCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedDayKey, setSelectedDayKey] = useState(() =>
    getDateKey(new Date()),
  );
  const weekDays = useMemo(() => getWeekDays(), []);
  const selectedMemories = useMemo(
    () =>
      memories.filter(
        (item) => getDateKey(new Date(item.createdAt)) === selectedDayKey,
      ),
    [memories, selectedDayKey],
  );

  const loadMemories = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const [nextMemories, nextProjects] = await Promise.all([
        listMemories(),
        listProjects(),
      ]);

      setMemories(nextMemories);
      setProjectCount(nextProjects.length);
      void scheduleUpcomingMemoryReminders(nextMemories);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load memories");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadMemories();
    }, [loadMemories]),
  );

  if (loading) {
    return (
      <SafeAreaView edges={["top"]} style={styles.screen}>
        <StateView title="Loading" detail="Syncing your notes." loading />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView edges={["top"]} style={styles.screen}>
        <StateView
          title={error}
          tone="error"
          actionLabel="Try again"
          onAction={loadMemories}
        />
      </SafeAreaView>
    );
  }

  const latestMemory = selectedMemories[0];
  const latestTone = getMemoryTone(latestMemory);
  const todayCount = memories.filter((item) => isToday(item.createdAt)).length;
  const selectedDateTitle =
    selectedDayKey === getDateKey(new Date())
      ? "Today"
      : sectionDateFormatter.format(new Date(`${selectedDayKey}T00:00:00`));

  return (
    <SafeAreaView edges={["top"]} style={styles.screen}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
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
                style={[
                  styles.dayColumn,
                  day.disabled && styles.disabledDayColumn,
                ]}
                onPress={() => setSelectedDayKey(day.key)}
              >
                <Text
                  style={[
                    styles.dayLabel,
                    selected && styles.selectedDayLabel,
                    day.disabled && styles.disabledDayText,
                  ]}
                >
                  {day.label}
                </Text>
                <View
                  style={[
                    styles.dayBubble,
                    selected && styles.selectedDayBubble,
                    day.disabled && styles.disabledDayBubble,
                  ]}
                >
                  <Text
                    style={[
                      styles.dayNumber,
                      selected && styles.selectedDayNumber,
                      day.disabled && styles.disabledDayText,
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
          <Pressable onPress={() => router.push("/search")}>
            <Text style={styles.seeAll}>Search</Text>
          </Pressable>
        </View>

        <View style={styles.featureRow}>
          <Pressable
            accessibilityLabel={
              latestMemory
                ? `Open ${latestMemory.title}`
                : `Add a memory for ${selectedDateTitle}`
            }
            accessibilityRole="button"
            style={styles.featureCard}
            onPress={() => {
              if (latestMemory) {
                router.push({
                  pathname: "/memories/[id]",
                  params: { id: latestMemory._id },
                });
                return;
              }

              router.push("/add");
            }}
          >
            <View
              style={[styles.featureAccentBar, { backgroundColor: latestTone }]}
            />
            <View style={styles.featureHeader}>
              <View
                style={[
                  styles.featureBadge,
                  { backgroundColor: `${latestTone}1F` },
                ]}
              >
                <View
                  style={[
                    styles.featureBadgeDot,
                    { backgroundColor: latestTone },
                  ]}
                />
                <Text style={[styles.featureBadgeText, { color: latestTone }]}>
                  {latestMemory ? "Latest log" : "Ready to save"}
                </Text>
              </View>
              <Text style={styles.featureActionText}>
                {latestMemory ? "Open" : "Add"}
              </Text>
            </View>
            <Text style={styles.featureTitle}>
              {latestMemory?.title || `No logs for ${selectedDateTitle}`}
            </Text>
            <Text numberOfLines={2} style={styles.featureBody}>
              {latestMemory?.content ||
                "Tap plus to add a task, note, reminder, or memory."}
            </Text>
            <View style={styles.featureStats}>
              <Text style={styles.featureStat}>
                {selectedMemories.length} logs today
              </Text>
            </View>
          </Pressable>

          <Pressable
            accessibilityLabel="Open projects"
            accessibilityRole="button"
            style={styles.sideCard}
            onPress={() => router.push("/projects")}
          >
            <View style={styles.sideIcon}>
              <Ionicons
                color={colors.projectTag}
                name="folder-open-outline"
                size={22}
              />
            </View>
            <Text style={styles.sideCardText}>Projects</Text>
            <Text style={styles.sideCardCount}>{projectCount}</Text>
            <Text style={styles.sideCardCaption}>active</Text>
          </Pressable>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Quick Add</Text>
          <Pressable onPress={() => router.push("/add")}>
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
              accessibilityLabel={card.title}
              accessibilityRole="button"
              style={[styles.quickCard, { borderColor: `${card.tone}55` }]}
              onPress={() =>
                router.push({
                  pathname: "/add",
                  params: { mode: card.mode },
                })
              }
            >
              <View
                style={[
                  styles.quickIcon,
                  { backgroundColor: `${card.tone}1F` },
                ]}
              >
                <Ionicons color={card.tone} name={card.icon} size={17} />
              </View>
              <Text style={styles.quickTitle}>{card.title}</Text>
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
            <Text style={styles.emptyTitle}>
              No logs for {selectedDateTitle}
            </Text>
            <Text style={styles.emptyText}>
              Tap plus to add a task, note, reminder, or memory.
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
    backgroundColor: colors.background,
  },
  content: {
    padding: 18,
    paddingBottom: 88,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  greeting: {
    color: colors.text,
    fontSize: 32,
    fontWeight: "900",
    lineHeight: 38,
  },
  subGreeting: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: "700",
    marginTop: 2,
  },
  avatar: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 22,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  avatarText: {
    color: colors.white,
    fontSize: 20,
    fontWeight: "900",
  },
  weekRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  dayColumn: {
    alignItems: "center",
    gap: 8,
  },
  dayLabel: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "700",
  },
  selectedDayLabel: {
    color: colors.text,
  },
  dayBubble: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 999,
    height: 42,
    justifyContent: "center",
    width: 42,
    ...subtleShadow,
  },
  selectedDayBubble: {
    backgroundColor: colors.primary,
  },
  disabledDayColumn: {
    opacity: 0.45,
  },
  disabledDayBubble: {
    backgroundColor: colors.backgroundSoft,
    shadowOpacity: 0,
  },
  dayNumber: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
  },
  selectedDayNumber: {
    color: colors.white,
  },
  disabledDayText: {
    color: colors.textSoft,
  },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 21,
    fontWeight: "900",
  },
  seeAll: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
  featureRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 28,
  },
  featureCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 22,
    borderWidth: 1,
    flex: 1,
    minHeight: 172,
    overflow: "hidden",
    padding: 18,
    ...subtleShadow,
  },
  featureAccentBar: {
    bottom: 0,
    left: 0,
    position: "absolute",
    top: 0,
    width: 6,
  },
  featureHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 14,
    paddingLeft: 4,
  },
  featureBadge: {
    alignItems: "center",
    borderRadius: 999,
    flexDirection: "row",
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  featureBadgeDot: {
    borderRadius: 999,
    height: 7,
    width: 7,
  },
  featureBadgeText: {
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  featureActionText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "900",
  },
  featureTitle: {
    color: colors.text,
    fontSize: 21,
    fontWeight: "900",
    lineHeight: 26,
    marginBottom: 8,
  },
  featureBody: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  featureStats: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: "auto",
  },
  featureStat: {
    backgroundColor: colors.backgroundSoft,
    borderRadius: 999,
    color: colors.text,
    fontSize: 12,
    fontWeight: "800",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  sideCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 22,
    borderWidth: 1,
    minHeight: 172,
    padding: 14,
    width: 108,
    ...subtleShadow,
  },
  sideIcon: {
    alignItems: "center",
    backgroundColor: `${colors.projectTag}1F`,
    borderRadius: 999,
    height: 38,
    justifyContent: "center",
    marginBottom: "auto",
    width: 38,
  },
  sideCardText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "900",
    marginTop: 18,
  },
  sideCardCount: {
    color: colors.text,
    fontSize: 30,
    fontWeight: "900",
    lineHeight: 34,
    marginTop: 2,
  },
  sideCardCaption: {
    color: colors.textSoft,
    fontSize: 12,
    fontWeight: "800",
  },
  quickRow: {
    gap: 8,
    paddingBottom: 22,
    paddingRight: 18,
  },
  quickCard: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    minHeight: 42,
    paddingLeft: 7,
    paddingRight: 14,
    ...subtleShadow,
  },
  quickIcon: {
    alignItems: "center",
    borderRadius: 999,
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  quickTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "900",
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "900",
    marginBottom: 5,
  },
  emptyText: {
    color: colors.textMuted,
    lineHeight: 20,
  },
});
