import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { MemoryCard } from "../../components/MemoryCard";
import { generateMetadata } from "../../services/ai";
import { StateView } from "../../components/StateView";
import {
  createMemory,
  listActivity,
  listMemories,
  listProjects,
  type ActivityItem,
} from "../../services/api";
import { scheduleUpcomingMemoryReminders } from "../../services/notifications";
import { colors, subtleShadow } from "../../styles/theme";

const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

const getDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;

const getGreeting = () => {
  const hour = new Date().getHours();

  if (hour < 12) {
    return "Good Morning";
  }

  if (hour < 18) {
    return "Good Afternoon";
  }

  return "Good Evening";
};

const getWeekdayIndex = (date: Date) => {
  const day = date.getDay();
  return day === 0 ? 6 : day - 1;
};

const getWeekdayCounts = (items: ActivityItem[]) => {
  const counts = new Array(7).fill(0);

  items.forEach((item) => {
    counts[getWeekdayIndex(new Date(item.createdAt))] += 1;
  });

  return counts;
};

const getRelativeTime = (value: string) => {
  const date = new Date(value);
  const today = getDateKey(new Date());
  const itemDay = getDateKey(date);

  if (today === itemDay) {
    return timeFormatter.format(date);
  }

  return "Earlier";
};

const getPromptQuestion = (items: ActivityItem[], projectCount: number) => {
  const latest = items[0];

  if (latest?.projectName) {
    return `What changed most recently in ${latest.projectName}?`;
  }

  if (items.some((item) => item.type === "task")) {
    return "What unfinished work have I logged recently?";
  }

  if (projectCount > 0) {
    return "Which project has the most recent activity?";
  }

  return "What should I review from this week?";
};

const getInsightSlot = () => Math.floor(new Date().getHours() / 6);

const getTodayActivityCount = (items: ActivityItem[]) => {
  const todayKey = getDateKey(new Date());

  return items.filter(
    (item) => getDateKey(new Date(item.createdAt)) === todayKey,
  ).length;
};

const getAiInsight = (
  items: ActivityItem[],
  projectCount: number,
  todayCount: number,
  taskCount: number,
  slot: number,
) => {
  const latest = items[0];
  const latestProject = latest?.projectName;
  const options = [
    latestProject
      ? `${latestProject} is leading your recent activity.`
      : "Your recent activity is building a useful trail.",
    taskCount > 0
      ? `${taskCount} task${taskCount === 1 ? "" : "s"} are active in your recent memory.`
      : "Your recent saves are more notes than tasks right now.",
    todayCount > 0
      ? `You've already captured ${todayCount} item${todayCount === 1 ? "" : "s"} today.`
      : "No captures yet today. A quick note will start the thread.",
    projectCount > 0
      ? `${projectCount} project${projectCount === 1 ? "" : "s"} are currently in motion.`
      : "Your memory is mostly general context right now."
  ];

  return options[slot % options.length];
};

export default function HomeScreen() {
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [projectCount, setProjectCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [composerText, setComposerText] = useState("");
  const [savingComposer, setSavingComposer] = useState(false);

  const greeting = getGreeting();

  const recentLogs = activity.slice(0, 4);
  const weekdayCounts = useMemo(() => getWeekdayCounts(activity), [activity]);
  const maxWeekCount = Math.max(...weekdayCounts, 1);
  const todayCount = useMemo(() => getTodayActivityCount(activity), [activity]);
  const noteCount = useMemo(
    () =>
      activity.filter((item) => item.type === "note" || item.type === "memory")
        .length,
    [activity],
  );
  const taskCount = useMemo(
    () =>
      activity.filter((item) => item.type === "task" || item.kind === "task")
        .length,
    [activity],
  );
  const askQuestion = useMemo(
    () => getPromptQuestion(activity, projectCount),
    [activity, projectCount],
  );
  const insightSlot = getInsightSlot();
  const aiInsight = useMemo(
    () => getAiInsight(activity, projectCount, todayCount, taskCount, insightSlot),
    [activity, insightSlot, projectCount, taskCount, todayCount],
  );

  const loadMemories = useCallback(
    async (options?: { refreshing?: boolean }) => {
      try {
        if (options?.refreshing) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        setError("");

        const [nextActivity, nextMemories, nextProjects] = await Promise.all([
          listActivity({ limit: 300 }),
          listMemories(),
          listProjects(),
        ]);

        setActivity(nextActivity);
        setProjectCount(nextProjects.length);
        void scheduleUpcomingMemoryReminders(nextMemories);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Unable to load memories",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [],
  );

  useFocusEffect(
    useCallback(() => {
      loadMemories();
    }, [loadMemories]),
  );

  const submitComposer = async () => {
    const trimmedContent = composerText.trim();

    if (!trimmedContent) {
      return;
    }

    try {
      setSavingComposer(true);
      setError("");

      const metadata = await generateMetadata(trimmedContent);

      await createMemory({
        title: metadata.title,
        content: trimmedContent,
        category: metadata.category,
        tags: metadata.tags,
        importance: metadata.importance,
        kind: "note",
      });

      setComposerText("");
      await loadMemories();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save memory");
    } finally {
      setSavingComposer(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView edges={["top"]} style={styles.screen}>
        <StateView title="Loading" detail="Syncing your brain." loading />
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
          onAction={() => loadMemories()}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top"]} style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.primary}
            colors={[colors.primary]}
            onRefresh={() => loadMemories({ refreshing: true })}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <View style={styles.brandRow}>
            <View style={styles.brandMark} />
            <Text style={styles.brandText}>Second Brain</Text>
          </View>
          <Pressable
            style={styles.headerAction}
            onPress={() => router.push("/search")}
          >
            <Ionicons color={colors.text} name="sparkles-outline" size={18} />
          </Pressable>
        </View>

        <View style={styles.heroBlock}>
          <Text style={styles.greeting}>{greeting}</Text>
          <View style={styles.insightRow}>
            <Ionicons color={colors.primary} name="sparkles-outline" size={14} />
            <Text style={styles.insightText}>{aiInsight}</Text>
          </View>
        </View>

        <View style={styles.composerShell}>
          <View style={styles.composerGlowA} />
          <View style={styles.composerGlowB} />

          <View style={styles.composerCard}>
            <View style={styles.composerHeader}>
              <View style={styles.composerBadge}>
                <Ionicons
                  color={colors.primary}
                  name="sparkles-outline"
                  size={13}
                />
                <Text style={styles.composerBadgeText}>AI quick capture</Text>
              </View>
            </View>

            <TextInput
              value={composerText}
              onChangeText={setComposerText}
              multiline
              placeholder="Log a memory, work update, reminder, or idea..."
              placeholderTextColor={colors.textSoft}
              style={styles.composerInput}
              textAlignVertical="top"
            />

            <View style={styles.composerFooter}>
              <View style={styles.composerHints}>
                <View style={styles.hintPill}>
                  <Text style={styles.hintText}>Auto title</Text>
                </View>
                <View style={styles.hintPill}>
                  <Text style={styles.hintText}>Smart tags</Text>
                </View>
              </View>

              <Pressable
                disabled={savingComposer}
                style={[
                  styles.sendButton,
                  savingComposer && styles.sendButtonDisabled,
                ]}
                onPress={() => void submitComposer()}
              >
                {savingComposer ? (
                  <ActivityIndicator color={colors.white} size="small" />
                ) : (
                  <Ionicons color={colors.white} name="arrow-up" size={18} />
                )}
              </Pressable>
            </View>
          </View>
        </View>

        <View style={styles.metricsRow}>
          <View style={styles.metricCardLarge}>
            <Text style={styles.metricEyebrow}>Today</Text>
            <Text style={styles.metricValue}>{todayCount}</Text>
            <Text style={styles.metricLabel}>items captured</Text>
          </View>

          <View style={styles.metricStack}>
            <View style={styles.metricCardSmall}>
              <Text style={styles.metricMiniValue}>{noteCount}</Text>
              <Text style={styles.metricMiniLabel}>notes</Text>
            </View>
            <View style={styles.metricCardSmall}>
              <Text style={styles.metricMiniValue}>{taskCount}</Text>
              <Text style={styles.metricMiniLabel}>tasks</Text>
            </View>
          </View>
        </View>

        <View style={styles.panel}>
          <View style={styles.panelHeader}>
            <Text style={styles.panelTitle}>Weekly activity</Text>
            <Text style={styles.panelCaption}>Last 7 days</Text>
          </View>

          <View style={styles.chartWrap}>
            {weekdayCounts.map((count, index) => {
              const height = activity.length
                ? Math.max(18, Math.round((count / maxWeekCount) * 94))
                : 18;

              return (
                <View key={weekdayLabels[index]} style={styles.barColumn}>
                  <View style={[styles.bar, { height }]} />
                  <Text style={styles.barLabel}>{weekdayLabels[index]}</Text>
                </View>
              );
            })}
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent activity</Text>
          <Pressable onPress={() => router.push("/(tabs)/calendar")}>
            <Text style={styles.sectionLink}>View calendar</Text>
          </Pressable>
        </View>

        {recentLogs.length ? (
          <View style={styles.recentList}>
            {recentLogs.map((item) => (
              <MemoryCard key={`${item.type}-${item._id}`} memory={item} />
            ))}
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No activity yet</Text>
            <Text style={styles.emptyText}>
              Start with one quick capture and your dashboard will build itself.
            </Text>
          </View>
        )}

        <Pressable
          style={styles.askPanel}
          onPress={() => router.push("/search")}
        >
          <View style={styles.askTopRow}>
            <View style={styles.askBadge}>
              <Ionicons
                color={colors.primary}
                name="sparkles-outline"
                size={14}
              />
              <Text style={styles.askBadgeText}>Ask Memory</Text>
            </View>
            <Ionicons color={colors.textSoft} name="arrow-forward" size={18} />
          </View>

          <Text style={styles.askQuestion}>{askQuestion}</Text>
          <Text style={styles.askDescription}>
            Search across memories, tasks, meetings, reminders, and project
            notes with natural language.
          </Text>

          <View style={styles.askPromptRow}>
            <Text numberOfLines={1} style={styles.askPromptText}>
              {askQuestion}
            </Text>
          </View>
        </Pressable>

        <View style={styles.footerSpace} />
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
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 118,
  },
  headerRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  brandRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  brandMark: {
    backgroundColor: colors.black,
    borderRadius: 999,
    height: 12,
    width: 12,
  },
  brandText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: "800",
  },
  headerAction: {
    alignItems: "center",
    backgroundColor: "#F6F7FA",
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  heroBlock: {
    marginBottom: 18,
  },
  greeting: {
    color: colors.text,
    fontSize: 32,
    fontWeight: "900",
    lineHeight: 38,
  },
  insightRow: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.accentSurface,
    borderRadius: 999,
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
    maxWidth: "96%",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  insightText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
  },
  composerShell: {
    marginBottom: 18,
    position: "relative",
  },
  composerGlowA: {
    backgroundColor: "#F3EAFF",
    borderRadius: 28,
    bottom: 8,
    left: 8,
    position: "absolute",
    right: 8,
    top: 8,
  },
  composerGlowB: {
    backgroundColor: "#EDF5FF",
    borderRadius: 28,
    bottom: 0,
    left: 18,
    opacity: 0.8,
    position: "absolute",
    right: 18,
    top: 18,
  },
  composerCard: {
    backgroundColor: colors.surface,
    borderColor: "#EDF0F5",
    borderRadius: 28,
    borderWidth: 1,
    minHeight: 204,
    padding: 18,
    position: "relative",
    ...subtleShadow,
  },
  composerHeader: {
    marginBottom: 14,
  },
  composerBadge: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.accentSurface,
    borderRadius: 999,
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  composerBadgeText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "800",
  },
  composerInput: {
    color: colors.text,
    flex: 1,
    fontSize: 18,
    fontWeight: "600",
    lineHeight: 27,
    minHeight: 94,
    padding: 0,
  },
  composerFooter: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 14,
  },
  composerHints: {
    flexDirection: "row",
    gap: 8,
  },
  hintPill: {
    backgroundColor: "#F5F7FB",
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  hintText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "800",
  },
  sendButton: {
    alignItems: "center",
    backgroundColor: colors.text,
    borderRadius: 999,
    height: 46,
    justifyContent: "center",
    width: 46,
  },
  sendButtonDisabled: {
    opacity: 0.72,
  },
  metricsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 18,
  },
  metricCardLarge: {
    backgroundColor: "#F8FBFF",
    borderColor: "#E7EEF8",
    borderRadius: 24,
    borderWidth: 1,
    flex: 1.2,
    minHeight: 142,
    padding: 18,
    ...subtleShadow,
  },
  metricEyebrow: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "800",
  },
  metricValue: {
    color: colors.text,
    fontSize: 40,
    fontWeight: "900",
    lineHeight: 46,
    marginTop: 18,
  },
  metricLabel: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: "700",
    marginTop: 6,
  },
  metricStack: {
    flex: 1,
    gap: 12,
  },
  metricCardSmall: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 20,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 16,
    ...subtleShadow,
  },
  metricMiniValue: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "900",
  },
  metricMiniLabel: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 4,
  },
  panel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 24,
    borderWidth: 1,
    marginBottom: 22,
    padding: 18,
    ...subtleShadow,
  },
  panelHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  panelTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900",
  },
  panelCaption: {
    color: colors.textSoft,
    fontSize: 13,
    fontWeight: "700",
  },
  chartWrap: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: 14,
    minHeight: 126,
    paddingTop: 12,
  },
  barColumn: {
    alignItems: "center",
    flex: 1,
    gap: 10,
  },
  bar: {
    backgroundColor: colors.text,
    borderRadius: 999,
    minHeight: 18,
    width: 24,
  },
  barLabel: {
    color: colors.textSoft,
    fontSize: 12,
    fontWeight: "700",
  },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "900",
  },
  sectionLink: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "800",
  },
  recentList: {
    marginBottom: 22,
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 22,
    padding: 18,
    ...subtleShadow,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900",
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 21,
    marginTop: 6,
  },
  askPanel: {
    backgroundColor: "#111217",
    borderRadius: 28,
    overflow: "hidden",
    padding: 18,
  },
  askTopRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  askBadge: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  askBadgeText: {
    color: "#C8B5FF",
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  askQuestion: {
    color: colors.white,
    fontSize: 28,
    fontWeight: "900",
    lineHeight: 34,
    marginTop: 18,
  },
  askDescription: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 23,
    marginTop: 10,
  },
  askPromptRow: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  askPromptText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: "700",
  },
  footerSpace: {
    height: 16,
  },
});
