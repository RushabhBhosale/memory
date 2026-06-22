import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
  listDesktopActivity,
  listMemories,
  listProjects,
  type ActivityItem,
  type DesktopActivity,
  type Memory,
  type Project,
} from "../../services/api";
import {
  scheduleMemoryReminder,
  scheduleUpcomingMemoryReminders,
} from "../../services/notifications";
import { colors, subtleShadow } from "../../styles/theme";
import {
  isHomeCacheFresh,
  readHomeCache,
  writeHomeCache,
} from "../../utils/homeCache";
import { parseQuickReminder } from "../../utils/quickReminder";

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

type MetricFilter = "today" | "notes" | "tasks" | null;

const getMetricFilteredActivity = (
  items: ActivityItem[],
  filter: MetricFilter,
) => {
  switch (filter) {
    case "today": {
      const todayKey = getDateKey(new Date());
      return items.filter(
        (item) => getDateKey(new Date(item.createdAt)) === todayKey,
      );
    }
    case "notes":
      return items.filter(
        (item) => item.type === "note" || item.type === "memory",
      );
    case "tasks":
      return items.filter(
        (item) => item.type === "task" || item.kind === "task",
      );
    default:
      return items.slice(0, 4);
  }
};

const getMetricFilterTitle = (filter: MetricFilter) => {
  switch (filter) {
    case "today":
      return "Today";
    case "notes":
      return "Notes";
    case "tasks":
      return "Tasks";
    default:
      return "Recent activity";
  }
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
      : "Your memory is mostly general context right now.",
  ];

  return options[slot % options.length];
};

export default function HomeScreen() {
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [desktopActivity, setDesktopActivity] = useState<DesktopActivity[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectCount, setProjectCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasCache, setHasCache] = useState(false);
  const [offlineMessage, setOfflineMessage] = useState("");
  const [error, setError] = useState("");
  const [composerText, setComposerText] = useState("");
  const [savingComposer, setSavingComposer] = useState(false);
  const [metricFilter, setMetricFilter] = useState<MetricFilter>(null);

  const greeting = getGreeting();

  const filteredActivity = useMemo(
    () => getMetricFilteredActivity(activity, metricFilter),
    [activity, metricFilter],
  );
  const activityPreview = metricFilter
    ? filteredActivity
    : filteredActivity.slice(0, 4);
  const activitySectionTitle = getMetricFilterTitle(metricFilter);
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
    () =>
      getAiInsight(activity, projectCount, todayCount, taskCount, insightSlot),
    [activity, insightSlot, projectCount, taskCount, todayCount],
  );
  const latestDesktopActivity = desktopActivity[0] ?? null;

  const hasHydratedCacheRef = useRef(false);
  const isSyncingRef = useRef(false);
  const hasCacheRef = useRef(false);
  const lastSyncedAtRef = useRef<number | null>(null);

  const applyHomeData = useCallback(
    (nextData: {
      activity: ActivityItem[];
      desktopActivity: DesktopActivity[];
      memories: Memory[];
      projects: Project[];
    }) => {
      setActivity(nextData.activity);
      setDesktopActivity(nextData.desktopActivity);
      setMemories(nextData.memories);
      setProjects(nextData.projects);
      setProjectCount(nextData.projects.length);
    },
    [],
  );

  const applyOptimisticMemory = useCallback(
    async (memory: Memory) => {
      const activityItem: ActivityItem = {
        ...memory,
        type: "memory",
      };
      const nextData = {
        activity: [activityItem, ...activity].slice(0, 300),
        desktopActivity,
        memories: [memory, ...memories],
        projects,
      };

      applyHomeData(nextData);
      setHasCache(true);
      hasCacheRef.current = true;
      lastSyncedAtRef.current = Date.now();
      await writeHomeCache(nextData).catch(() => undefined);
    },
    [activity, applyHomeData, desktopActivity, memories, projects],
  );

  const syncHomeData = useCallback(
    async (options?: { refresh?: boolean; silent?: boolean }) => {
      if (isSyncingRef.current) {
        return;
      }

      isSyncingRef.current = true;

      try {
        if (options?.refresh) {
          setRefreshing(true);
        } else if (!options?.silent) {
          setLoading(!hasCache);
        } else {
          setSyncing(true);
        }

        setError("");
        setOfflineMessage("");

        const [nextActivity, nextDesktopActivity, nextMemories, nextProjects] = await Promise.all([
          listActivity({ limit: 300 }),
          listDesktopActivity({ limit: 30 }),
          listMemories(),
          listProjects(),
        ]);
        const nextData = {
          activity: nextActivity,
          desktopActivity: nextDesktopActivity,
          memories: nextMemories,
          projects: nextProjects,
        };

        applyHomeData(nextData);
        setHasCache(true);
        hasCacheRef.current = true;
        lastSyncedAtRef.current = Date.now();
        await writeHomeCache(nextData);
        void scheduleUpcomingMemoryReminders(nextMemories);
      } catch (err) {
        if (hasCacheRef.current) {
          setOfflineMessage("Showing offline data");
        } else {
          setError(
            err instanceof Error ? err.message : "Unable to load memories",
          );
        }
      } finally {
        isSyncingRef.current = false;
        setLoading(false);
        setSyncing(false);
        setRefreshing(false);
      }
    },
    [applyHomeData, hasCache],
  );

  const loadMemories = useCallback(
    async (options?: { refreshing?: boolean }) => {
      if (options?.refreshing) {
        await syncHomeData({ refresh: true });
        return;
      }

      if (hasHydratedCacheRef.current) {
        if (isHomeCacheFresh(lastSyncedAtRef.current)) {
          return;
        }

        await syncHomeData({ silent: hasCache });
        return;
      }

      try {
        hasHydratedCacheRef.current = true;
        const cachedData = await readHomeCache();

        if (cachedData) {
          applyHomeData(cachedData);
          setHasCache(true);
          hasCacheRef.current = true;
          lastSyncedAtRef.current = cachedData.lastSyncedAt;
          setLoading(false);

          if (isHomeCacheFresh(cachedData.lastSyncedAt)) {
            return;
          }

          await syncHomeData({ silent: true });
          return;
        }

        await syncHomeData();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Unable to load memories",
        );
      } finally {
        setLoading(false);
      }
    },
    [applyHomeData, hasCache, syncHomeData],
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

      const quickReminder = parseQuickReminder(trimmedContent, projects);

      if (quickReminder) {
        const metadata = await generateMetadata(quickReminder.content);
        const memory = await createMemory({
          title: metadata.title || `Reminder: ${quickReminder.content}`,
          content: quickReminder.content,
          category: "reminder",
          tags: metadata.tags.length ? metadata.tags : ["reminder"],
          importance: metadata.importance,
          kind: "note",
          projectId: quickReminder.projectId,
          reminderAt: quickReminder.reminderAt.toISOString(),
          notificationEnabled: true,
        });

        const notificationId = await scheduleMemoryReminder(memory);

        if (!notificationId) {
          Alert.alert(
            "Reminder saved",
            "The reminder was saved, but the phone did not schedule a notification. Check notification permission and try a development build if Expo Go blocks it.",
          );
        }

        await applyOptimisticMemory(memory);
        setComposerText("");
        void syncHomeData({ silent: true });
        return;
      }

      const metadata = await generateMetadata(trimmedContent);

      const memory = await createMemory({
        title: metadata.title,
        content: trimmedContent,
        category: metadata.category,
        tags: metadata.tags,
        importance: metadata.importance,
        kind: "note",
      });

      await applyOptimisticMemory(memory);
      setComposerText("");
      void syncHomeData({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save memory");
    } finally {
      setSavingComposer(false);
    }
  };

  if (loading && !hasCache) {
    return (
      <SafeAreaView edges={["top"]} style={styles.screen}>
        <StateView title="Loading" detail="Syncing your brain." loading />
      </SafeAreaView>
    );
  }

  if (error && !hasCache) {
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
          {/* {syncing || offlineMessage ? (
            <Text style={[styles.syncStatus, offlineMessage && styles.offlineStatus]}>
              {offlineMessage || "Syncing..."}
            </Text>
          ) : null} */}
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
            <Ionicons
              color={colors.primary}
              name="sparkles-outline"
              size={14}
            />
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
          <Pressable
            accessibilityRole="button"
            style={[
              styles.metricCardLarge,
              metricFilter === "today" && styles.metricCardSelected,
            ]}
            onPress={() =>
              setMetricFilter((current) =>
                current === "today" ? null : "today",
              )
            }
          >
            <Text style={styles.metricEyebrow}>Today</Text>
            <Text style={styles.metricValue}>{todayCount}</Text>
            <Text style={styles.metricLabel}>items captured</Text>
          </Pressable>

          <View style={styles.metricStack}>
            <Pressable
              accessibilityRole="button"
              style={[
                styles.metricCardSmall,
                metricFilter === "notes" && styles.metricCardSelected,
              ]}
              onPress={() =>
                setMetricFilter((current) =>
                  current === "notes" ? null : "notes",
                )
              }
            >
              <Text style={styles.metricMiniValue}>{noteCount}</Text>
              <Text style={styles.metricMiniLabel}>notes</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              style={[
                styles.metricCardSmall,
                metricFilter === "tasks" && styles.metricCardSelected,
              ]}
              onPress={() =>
                setMetricFilter((current) =>
                  current === "tasks" ? null : "tasks",
                )
              }
            >
              <Text style={styles.metricMiniValue}>{taskCount}</Text>
              <Text style={styles.metricMiniLabel}>tasks</Text>
            </Pressable>
          </View>
        </View>

        {desktopActivity.length ? (
          <View style={styles.desktopSection}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Desktop activity</Text>
              <Text style={styles.sectionMeta}>Auto-synced from laptop</Text>
            </View>
            {latestDesktopActivity ? (
              <View style={styles.desktopStatsRow}>
                <View style={styles.desktopStatCard}>
                  <Text style={styles.desktopStatValue}>{latestDesktopActivity.codingMinutes}m</Text>
                  <Text style={styles.desktopStatLabel}>coding</Text>
                </View>
                <View style={styles.desktopStatCard}>
                  <Text style={styles.desktopStatValue}>{latestDesktopActivity.productiveMinutes}m</Text>
                  <Text style={styles.desktopStatLabel}>productive</Text>
                </View>
                <View style={styles.desktopStatCard}>
                  <Text style={styles.desktopStatValue}>{latestDesktopActivity.idleMinutes}m</Text>
                  <Text style={styles.desktopStatLabel}>idle</Text>
                </View>
              </View>
            ) : null}
            {desktopActivity.slice(0, 3).map((item) => (
              <View key={item._id} style={styles.desktopCard}>
                <View style={styles.desktopCardHeader}>
                  <Text style={styles.desktopCardTitle}>{item.title}</Text>
                  <Text style={styles.desktopCardDate}>{item.date}</Text>
                </View>
                <Text numberOfLines={3} style={styles.desktopSummary}>
                  {item.summary}
                </Text>
                <View style={styles.desktopMetrics}>
                  <View style={styles.desktopMetricPill}>
                    <Text style={styles.desktopMetricText}>{item.codingMinutes}m coding</Text>
                  </View>
                  <View style={styles.desktopMetricPill}>
                    <Text style={styles.desktopMetricText}>{item.productiveMinutes}m productive</Text>
                  </View>
                  <View style={styles.desktopMetricPill}>
                    <Text style={styles.desktopMetricText}>{item.idleMinutes}m idle</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        ) : null}

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
          <Text style={styles.sectionTitle}>{activitySectionTitle}</Text>
          {metricFilter ? (
            <Pressable onPress={() => setMetricFilter(null)}>
              <Text style={styles.sectionLink}>Clear filter</Text>
            </Pressable>
          ) : (
            <Pressable onPress={() => router.push("/(tabs)/calendar")}>
              <Text style={styles.sectionLink}>View calendar</Text>
            </Pressable>
          )}
        </View>

        {activityPreview.length ? (
          <View style={styles.recentList}>
            {activityPreview.map((item) => (
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
  syncStatus: {
    color: colors.textSoft,
    flex: 1,
    fontSize: 12,
    fontWeight: "800",
    marginHorizontal: 12,
    textAlign: "right",
  },
  offlineStatus: {
    color: colors.reminderTag,
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
  metricCardSelected: {
    borderColor: colors.primary,
    borderWidth: 2,
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
  desktopSection: {
    marginBottom: 22,
  },
  desktopStatsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
  },
  desktopStatCard: {
    backgroundColor: "#F8FBFF",
    borderColor: "#E7EEF8",
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    ...subtleShadow,
  },
  desktopStatValue: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "900",
    lineHeight: 28,
  },
  desktopStatLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 4,
  },
  sectionHeaderRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  sectionMeta: {
    color: colors.textSoft,
    fontSize: 12,
    fontWeight: "700",
  },
  desktopCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 12,
    padding: 16,
    ...subtleShadow,
  },
  desktopCardHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  desktopCardTitle: {
    color: colors.text,
    flex: 1,
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 20,
  },
  desktopCardDate: {
    color: colors.textSoft,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 2,
  },
  desktopSummary: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19,
    marginTop: 10,
  },
  desktopMetrics: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  desktopMetricPill: {
    backgroundColor: colors.backgroundSoft,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  desktopMetricText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "800",
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
