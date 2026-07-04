import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
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

import { AppHeader, HeaderIcon } from "../../components/AppHeader";
import { MemoryCard } from "../../components/MemoryCard";
import { useSmartCaptureCenter } from "../../components/SmartCaptureCenterContext";
import { generateMetadata } from "../../services/ai";
import { StateView } from "../../components/StateView";
import {
  createMemory,
  listActivity,
  listDesktopActivity,
  listMemories,
  updateActivityItem,
  type ActivityItem,
  type DesktopActivity,
  type Memory,
} from "../../services/api";
import {
  listExpenses,
  subscribeToExpenseChanges,
  type ExpenseEntry,
} from "../../services/expenses";
import {
  scheduleMemoryReminder,
  scheduleUpcomingMemoryReminders,
} from "../../services/notifications";
import {
  listScreenshots,
  type ScreenshotInboxItem,
} from "../../services/screenshotWatcher";
import { colors, subtleShadow } from "../../styles/theme";
import {
  isHomeCacheFresh,
  getHomeMutationRevision,
  readHomeCache,
  writeHomeCache,
} from "../../utils/homeCache";
import { parseQuickReminder } from "../../utils/quickReminder";

const SHOW_DESKTOP_ACTIVITY_SURFACE = false;

const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

const currencyFormatter = new Intl.NumberFormat("en-IN", {
  currency: "INR",
  maximumFractionDigits: 0,
  style: "currency",
});

const weekMonthFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
});

const getDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;

const getMonthKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

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

const getWeekRange = (date = new Date()) => {
  const start = new Date(date);
  const offset = getWeekdayIndex(start);
  start.setDate(start.getDate() - offset);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(start.getDate() + 7);

  return { start, end };
};

const getWeekRangeLabel = (start: Date, end: Date) => {
  const lastDay = new Date(end);
  lastDay.setDate(end.getDate() - 1);

  const startMonth = weekMonthFormatter.format(start);
  const endMonth = weekMonthFormatter.format(lastDay);

  if (startMonth === endMonth) {
    return `${startMonth} ${start.getDate()}-${lastDay.getDate()}`;
  }

  return `${startMonth} ${start.getDate()}-${endMonth} ${lastDay.getDate()}`;
};

const getWeekdayLabels = (weekStart: Date) =>
  weekdayLabels.map((weekday, index) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + index);
    return { day: date.getDate(), weekday };
  });

const getWeekdayCounts = (items: ActivityItem[], weekStart: Date, weekEnd: Date) => {
  const counts = new Array(7).fill(0);
  const startTime = weekStart.getTime();
  const endTime = weekEnd.getTime();

  items.forEach((item) => {
    const itemDate = new Date(item.createdAt);
    const itemTime = itemDate.getTime();

    if (itemTime >= startTime && itemTime < endTime) {
      counts[getWeekdayIndex(itemDate)] += 1;
    }
  });

  return counts;
};

const formatCurrency = (amount: number) => currencyFormatter.format(Math.round(amount));

const getDailySummary = (
  items: ActivityItem[],
  expenses: ExpenseEntry[],
) => {
  const todayKey = getDateKey(new Date());
  const todayItems = items.filter(
    (item) => getDateKey(new Date(item.createdAt)) === todayKey,
  );
  const memoriesCaptured = todayItems.filter(
    (item) => item.type === "memory" || item.type === "note" || item.kind === "note",
  ).length;
  const tasksCompleted = todayItems.filter(
    (item) =>
      (item.type === "task" || item.kind === "task") &&
      String(item.status || "").toLowerCase() === "completed",
  ).length;
  const spentToday = expenses
    .filter(
      (expense) =>
        expense.type === "expense" &&
        getDateKey(new Date(expense.timestamp)) === todayKey,
    )
    .reduce((total, expense) => total + expense.amount, 0);
  const sentence = spentToday > 0
      ? `You logged ${formatCurrency(spentToday)} in expenses today.`
      : todayItems.length > 0
        ? "Your captures today are building a useful daily trail."
        : "No major activity yet today. One quick capture will start the summary.";

  return {
    memoriesCaptured,
    sentence,
    spentToday,
    tasksCompleted,
  };
};

const getExpenseSummary = (expenses: ExpenseEntry[]) => {
  const now = new Date();
  const todayKey = getDateKey(now);
  const monthKey = getMonthKey(now);
  const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previousMonthKey = getMonthKey(previousMonth);
  const expenseItems = expenses.filter((expense) => expense.type === "expense");
  const todaySpend = expenseItems
    .filter((expense) => getDateKey(new Date(expense.timestamp)) === todayKey)
    .reduce((total, expense) => total + expense.amount, 0);
  const monthSpend = expenseItems
    .filter((expense) => getMonthKey(new Date(expense.timestamp)) === monthKey)
    .reduce((total, expense) => total + expense.amount, 0);
  const previousMonthSpend = expenseItems
    .filter((expense) => getMonthKey(new Date(expense.timestamp)) === previousMonthKey)
    .reduce((total, expense) => total + expense.amount, 0);
  const categoryTotals = expenseItems
    .filter((expense) => getMonthKey(new Date(expense.timestamp)) === monthKey)
    .reduce<Record<string, number>>((totals, expense) => {
      const category = expense.category || "general";
      totals[category] = (totals[category] || 0) + expense.amount;
      return totals;
    }, {});
  const topCategory = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1])[0]?.[0] || "None";
  const trendPercent = previousMonthSpend
    ? Math.round(((monthSpend - previousMonthSpend) / previousMonthSpend) * 100)
    : 0;

  return {
    monthSpend,
    todaySpend,
    topCategory,
    trendPercent,
  };
};

const hasReminderIntent = (input: string) =>
  /\b(?:remind\s+me|remember\s+to|need\s+to|don't\s+forget|do\s+not\s+forget|notify\s+me|alert\s+me)\b/i.test(input);

const normalizeHomepageMetadata = (
  metadata: Awaited<ReturnType<typeof generateMetadata>>,
  input: string,
) => {
  if (hasReminderIntent(input) || metadata.category !== "reminder") {
    return metadata;
  }

  return {
    ...metadata,
    category: "personal",
    tags: metadata.tags.filter((tag) => tag !== "reminder"),
  };
};

const getScreenshotInboxSummary = (screenshots: ScreenshotInboxItem[]) => {
  const todayKey = getDateKey(new Date());
  const pending = screenshots.filter((item) => !item.processed && !item.dismissed).length;
  const processedToday = screenshots.filter(
    (item) =>
      item.processed &&
      getDateKey(new Date(item.updatedAt || item.capturedAt)) === todayKey,
  ).length;

  return {
    pending,
    processedToday,
    shouldShow: pending > 0 || processedToday > 0,
  };
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
  todayCount: number,
  taskCount: number,
  slot: number,
) => {
  const options = [
    "Your recent activity is building a useful trail.",
    taskCount > 0
      ? `${taskCount} task${taskCount === 1 ? "" : "s"} are active in your recent memory.`
      : "Your recent saves are more notes than tasks right now.",
    todayCount > 0
      ? `You've already captured ${todayCount} item${todayCount === 1 ? "" : "s"} today.`
      : "No captures yet today. A quick note will start the thread.",
    "Your memory is mostly general context right now.",
  ];

  return options[slot % options.length];
};

const isTaskLike = (item: ActivityItem) =>
  item.type === "task" ||
  item.kind === "task" ||
  item.category === "task" ||
  item.category === "reminder" ||
  Boolean(item.reminderAt);

const isOpenTask = (item: ActivityItem) =>
  !["completed", "done", "triggered"].includes(String(item.status || "").toLowerCase());

const getUpcomingFocusItems = (items: ActivityItem[]) => {
  const now = Date.now();

  return items
    .filter(isTaskLike)
    .filter(isOpenTask)
    .sort((a, b) => {
      const aTime = a.reminderAt ? new Date(a.reminderAt).getTime() : new Date(a.createdAt).getTime();
      const bTime = b.reminderAt ? new Date(b.reminderAt).getTime() : new Date(b.createdAt).getTime();
      return aTime - bTime;
    })
    .filter((item) => !item.reminderAt || new Date(item.reminderAt).getTime() >= now - 24 * 60 * 60 * 1000)
    .slice(0, 3);
};

const getRecentMemoryItems = (items: ActivityItem[]) =>
  items
    .filter(
      (item) =>
        item.type === "memory" ||
        item.type === "note" ||
        item.kind === "note" ||
        item.type === "daily_summary",
    )
    .slice(0, 3);

const focusDateFormatter = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
});

const focusTimeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

const getFocusMeta = (item: ActivityItem) => {
  if (!item.reminderAt) {
    return "Open task";
  }

  const date = new Date(item.reminderAt);
  return `${focusDateFormatter.format(date)} at ${focusTimeFormatter.format(date)}`;
};

const getItemTitle = (item: ActivityItem) =>
  item.title || item.summary || item.content || item.merchant || "Saved item";

const getItemMeta = (item: ActivityItem) => {
  if (item.type === "expense" && item.amount) {
    return `${formatCurrency(item.amount)} ${item.merchant ? `at ${item.merchant}` : ""}`.trim();
  }

  if (item.category) {
    return item.category;
  }

  return getRelativeTime(item.createdAt);
};

export default function HomeScreen() {
  const captureCenter = useSmartCaptureCenter();
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [desktopActivity, setDesktopActivity] = useState<DesktopActivity[]>([]);
  const [expenses, setExpenses] = useState<ExpenseEntry[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [screenshots, setScreenshots] = useState<ScreenshotInboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasCache, setHasCache] = useState(false);
  const [offlineMessage, setOfflineMessage] = useState("");
  const [error, setError] = useState("");
  const [composerText, setComposerText] = useState("");
  const [completingFocusItemId, setCompletingFocusItemId] = useState("");
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
  const currentWeek = getWeekRange();
  const weekRangeLabel = getWeekRangeLabel(currentWeek.start, currentWeek.end);
  const weeklyActivityLabels = getWeekdayLabels(currentWeek.start);
  const weekdayCounts = useMemo(
    () => getWeekdayCounts(activity, currentWeek.start, currentWeek.end),
    [activity, currentWeek.end, currentWeek.start],
  );
  const maxWeekCount = Math.max(...weekdayCounts, 1);
  const weeklyActivityTotal = weekdayCounts.reduce((total, count) => total + count, 0);
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
  const insightSlot = getInsightSlot();
  const aiInsight = useMemo(
    () =>
      getAiInsight(activity, todayCount, taskCount, insightSlot),
    [activity, insightSlot, taskCount, todayCount],
  );
  const latestDesktopActivity = desktopActivity[0] ?? null;
  const latestDesktopApp = latestDesktopActivity?.appBreakdown[0]?.appName;
  const latestDesktopTotalMinutes = latestDesktopActivity
    ? Math.max(
        latestDesktopActivity.productiveMinutes + latestDesktopActivity.idleMinutes,
        1,
      )
    : 1;
  const desktopAppBreakdown = latestDesktopActivity?.appBreakdown.slice(0, 5) ?? [];
  const maxDesktopAppMinutes = Math.max(
    ...desktopAppBreakdown.map((item) => item.durationMinutes),
    1,
  );

  const dailySummary = useMemo(
    () => getDailySummary(activity, expenses),
    [activity, expenses],
  );
  const expenseSummary = useMemo(
    () => getExpenseSummary(expenses),
    [expenses],
  );
  const screenshotInboxSummary = useMemo(
    () => getScreenshotInboxSummary(screenshots),
    [screenshots],
  );
  const focusItems = useMemo(() => getUpcomingFocusItems(activity), [activity]);
  const recentMemoryItems = useMemo(() => getRecentMemoryItems(activity), [activity]);

  const hasHydratedCacheRef = useRef(false);
  const isSyncingRef = useRef(false);
  const hasCacheRef = useRef(false);
  const lastSyncedAtRef = useRef<number | null>(null);
  const lastSeenHomeMutationRef = useRef(getHomeMutationRevision());

  const applyHomeData = useCallback(
    (nextData: {
      activity: ActivityItem[];
      desktopActivity: DesktopActivity[];
      memories: Memory[];
    }) => {
      setActivity(nextData.activity);
      setDesktopActivity(nextData.desktopActivity);
      setMemories(nextData.memories);
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
      };

      applyHomeData(nextData);
      setHasCache(true);
      hasCacheRef.current = true;
      lastSyncedAtRef.current = Date.now();
      await writeHomeCache(nextData).catch(() => undefined);
    },
    [activity, applyHomeData, desktopActivity, memories],
  );

  const loadDashboardData = useCallback(async () => {
    const [
      nextExpenses,
      nextScreenshots,
    ] = await Promise.all([
      listExpenses().catch(() => []),
      listScreenshots().catch(() => []),
    ]);

    setExpenses(nextExpenses);
    setScreenshots(nextScreenshots);
  }, []);

  const loadExpenses = useCallback(async () => {
    const nextExpenses = await listExpenses().catch(() => []);
    setExpenses(nextExpenses);
  }, []);

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

        const [nextActivity, nextDesktopActivity, nextMemories] = await Promise.all([
          listActivity({ limit: 300 }),
          listDesktopActivity({ limit: 30 }),
          listMemories(),
        ]);
        const nextData = {
          activity: nextActivity,
          desktopActivity: nextDesktopActivity,
          memories: nextMemories,
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
        const mutationRevision = getHomeMutationRevision();
        const hasExternalMutation = mutationRevision !== lastSeenHomeMutationRef.current;

        if (!hasExternalMutation && isHomeCacheFresh(lastSyncedAtRef.current)) {
          return;
        }

        lastSeenHomeMutationRef.current = mutationRevision;
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

  const completeFocusItem = useCallback(
    async (item: ActivityItem) => {
      if (item.type !== "task" && item.type !== "memory") {
        return;
      }

      if (completingFocusItemId) {
        return;
      }

      const nextActivity = activity.map((activityItem) =>
        activityItem._id === item._id && activityItem.type === item.type
          ? { ...activityItem, status: "completed" as const }
          : activityItem,
      );
      const nextMemories = memories.map((memory) =>
        memory._id === item._id ? { ...memory, status: "completed" as const } : memory,
      );
      const nextData = {
        activity: nextActivity,
        desktopActivity,
        memories: nextMemories,
      };

      try {
        setCompletingFocusItemId(item._id);
        setError("");
        applyHomeData(nextData);
        await writeHomeCache({
          ...nextData,
          syncedAt: lastSyncedAtRef.current || Date.now(),
        }).catch(() => undefined);

        if (item.type === "task") {
          await updateActivityItem("task", item._id, { status: "completed" });
        } else if (item.type === "memory") {
          await updateActivityItem("memory", item._id, { status: "completed" });
        }

        void syncHomeData({ silent: true });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to mark task done");
        void syncHomeData({ silent: true });
      } finally {
        setCompletingFocusItemId("");
      }
    },
    [
      activity,
      applyHomeData,
      completingFocusItemId,
      desktopActivity,
      memories,
      syncHomeData,
    ],
  );

  useFocusEffect(
    useCallback(() => {
      loadMemories();
      void loadDashboardData();
    }, [loadDashboardData, loadMemories]),
  );

  useEffect(() => {
    const expenseSubscription = subscribeToExpenseChanges(() => {
      void loadExpenses();
    });
    const appStateSubscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void loadExpenses();
      }
    });

    return () => {
      expenseSubscription.remove();
      appStateSubscription.remove();
    };
  }, [loadExpenses]);

  const submitComposer = async () => {
    const trimmedContent = composerText.trim();

    if (!trimmedContent) {
      return;
    }

    try {
      setSavingComposer(true);
      setError("");

      const quickReminder = parseQuickReminder(trimmedContent);

      if (quickReminder) {
        const metadata = await generateMetadata(quickReminder.content);
        const memory = await createMemory({
          title: metadata.title || `Reminder: ${quickReminder.content}`,
          content: quickReminder.content,
          category: "reminder",
          tags: metadata.tags.length ? metadata.tags : ["reminder"],
          importance: metadata.importance,
          kind: "note",
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

      const metadata = normalizeHomepageMetadata(
        await generateMetadata(trimmedContent),
        trimmedContent,
      );

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
        <AppHeader
          title="Memory"
          rightIcons={
            <>
              <HeaderIcon name="search-outline" onPress={() => router.push("/(tabs)/search")} />
              <HeaderIcon name="settings-outline" onPress={() => router.push("/settings")} />
            </>
          }
        />

        <Pressable
          accessibilityRole="button"
          style={styles.assistantPanel}
          onPress={() => router.push("/(tabs)/search")}
        >
          <View style={styles.assistantTopRow}>
            <View style={styles.assistantIcon}>
              <Ionicons color={colors.white} name="sparkles" size={22} />
            </View>
            <View style={styles.syncPill}>
              <Text style={styles.syncPillText}>
                {offlineMessage || (syncing ? "Syncing" : "Ready")}
              </Text>
            </View>
          </View>
          <Text style={styles.assistantEyebrow}>{greeting}</Text>
          <Text style={styles.assistantTitle}>Ask your memory anything.</Text>
          <Text numberOfLines={2} style={styles.assistantBody}>
            {aiInsight}
          </Text>
          <View style={styles.askInputMock}>
            <Text style={styles.askInputText}>What should I know right now?</Text>
            <Ionicons color={colors.white} name="arrow-forward" size={18} />
          </View>
        </Pressable>

        <View style={styles.quickCapturePanel}>
          <View style={styles.quickCaptureHeader}>
            <View>
              <Text style={styles.sectionEyebrow}>Quick capture</Text>
              <Text style={styles.quickCaptureTitle}>Save a thought fast</Text>
            </View>
            <View style={styles.quickCaptureActions}>
              <Pressable
                accessibilityRole="button"
                style={styles.smallIconButton}
                onPress={captureCenter.openVoiceCapture}
              >
                <Ionicons color={colors.text} name="mic-outline" size={18} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                style={styles.smallIconButton}
                onPress={() => router.push("/(tabs)/create")}
              >
                <Ionicons color={colors.text} name="expand-outline" size={18} />
              </Pressable>
            </View>
          </View>
          <TextInput
            value={composerText}
            onChangeText={setComposerText}
            multiline
            placeholder="Type a note, task, or reminder..."
            placeholderTextColor={colors.textSoft}
            style={styles.composerInput}
            textAlignVertical="top"
          />

          <View style={styles.composerFooter}>
            <Text style={styles.composerHelper}>AI will file it into memory.</Text>
            <Pressable
              disabled={savingComposer || !composerText.trim()}
              style={[
                styles.sendButton,
                (!composerText.trim() || savingComposer) && styles.sendButtonDisabled,
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

        {error && hasCache ? <Text style={styles.inlineError}>{error}</Text> : null}

        <View style={styles.todaySnapshot}>
          <Pressable style={styles.snapshotItem} onPress={() => router.push("/(tabs)/calendar")}>
            <Text style={styles.snapshotValue}>{todayCount}</Text>
            <Text style={styles.snapshotLabel}>today</Text>
          </Pressable>
          <View style={styles.snapshotDivider} />
          <Pressable style={styles.snapshotItem} onPress={() => router.push("/(tabs)/tasks")}>
            <Text style={styles.snapshotValue}>{focusItems.length}</Text>
            <Text style={styles.snapshotLabel}>focus</Text>
          </Pressable>
          <View style={styles.snapshotDivider} />
          <Pressable style={styles.snapshotItem} onPress={() => router.push("/(tabs)/expenses")}>
            <Text adjustsFontSizeToFit minimumFontScale={0.72} numberOfLines={1} style={styles.snapshotValue}>
              {formatCurrency(dailySummary.spentToday)}
            </Text>
            <Text style={styles.snapshotLabel}>spent</Text>
          </Pressable>
        </View>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionEyebrow}>Today</Text>
            <Text style={styles.sectionTitle}>What needs attention</Text>
          </View>
          <Pressable onPress={() => router.push("/(tabs)/tasks")}>
            <Text style={styles.sectionLink}>Tasks</Text>
          </Pressable>
        </View>

        <View style={styles.focusList}>
          {focusItems.length ? (
            focusItems.map((item) => (
              <View
                key={`${item.type}-${item._id}`}
                style={styles.focusRow}
              >
                {item.type === "task" || item.type === "memory" ? (
                  <Pressable
                    accessibilityLabel="Mark done"
                    accessibilityRole="button"
                    disabled={completingFocusItemId === item._id}
                    style={[
                      styles.focusCompleteButton,
                      completingFocusItemId === item._id && styles.focusCompleteButtonBusy,
                    ]}
                    onPress={() => void completeFocusItem(item)}
                  >
                    {completingFocusItemId === item._id ? (
                      <ActivityIndicator color={colors.primary} size="small" />
                    ) : (
                      <Ionicons color={colors.primary} name="checkmark" size={18} />
                    )}
                  </Pressable>
                ) : (
                  <View style={styles.focusIcon}>
                    <Ionicons color={colors.reminderTag} name="time-outline" size={18} />
                  </View>
                )}
                <Pressable
                  accessibilityRole="button"
                  style={styles.focusOpenTarget}
                  onPress={() =>
                    router.push({
                      pathname: "/activity/[type]/[id]",
                      params: { id: item._id, type: item.type },
                    })
                  }
                >
                  <View style={styles.focusCopy}>
                    <Text numberOfLines={1} style={styles.focusTitle}>
                      {getItemTitle(item)}
                    </Text>
                    <Text numberOfLines={1} style={styles.focusMeta}>
                      {getFocusMeta(item)}
                    </Text>
                  </View>
                  <Ionicons color={colors.textSoft} name="chevron-forward" size={18} />
                </Pressable>
              </View>
            ))
          ) : (
            <View style={styles.emptyFocus}>
              <Text style={styles.emptyFocusTitle}>No urgent items</Text>
              <Text style={styles.emptyFocusText}>Your next tasks and reminders will appear here.</Text>
            </View>
          )}

          {screenshotInboxSummary.pending ? (
            <Pressable style={styles.focusRow} onPress={() => router.push("/screenshots")}>
              <View style={[styles.focusIcon, styles.screenshotIcon]}>
                <Ionicons color={colors.secondary} name="images-outline" size={18} />
              </View>
              <View style={styles.focusCopy}>
                <Text style={styles.focusTitle}>Screenshot inbox</Text>
                <Text style={styles.focusMeta}>
                  {screenshotInboxSummary.pending} waiting for review
                </Text>
              </View>
              <Ionicons color={colors.textSoft} name="chevron-forward" size={18} />
            </Pressable>
          ) : null}
        </View>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionEyebrow}>Continue</Text>
            <Text style={styles.sectionTitle}>Recent memories</Text>
          </View>
          <Pressable onPress={() => router.push("/(tabs)/calendar")}>
            <Text style={styles.sectionLink}>History</Text>
          </Pressable>
        </View>

        {recentMemoryItems.length ? (
          <View style={styles.recentRows}>
            {recentMemoryItems.map((item) => (
              <Pressable
                key={`${item.type}-${item._id}`}
                accessibilityRole="button"
                style={styles.recentRow}
                onPress={() =>
                  router.push({
                    pathname: "/activity/[type]/[id]",
                    params: { id: item._id, type: item.type },
                  })
                }
              >
                <View style={styles.recentDot} />
                <View style={styles.recentCopy}>
                  <Text numberOfLines={1} style={styles.recentTitle}>
                    {getItemTitle(item)}
                  </Text>
                  <Text numberOfLines={1} style={styles.recentMeta}>
                    {getItemMeta(item)}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        ) : (
          <View style={styles.emptyFocus}>
            <Text style={styles.emptyFocusTitle}>No memories yet</Text>
            <Text style={styles.emptyFocusText}>Start with one quick capture.</Text>
          </View>
        )}

        <View style={styles.shortcutGrid}>
          <Pressable style={styles.shortcutTile} onPress={() => router.push("/(tabs)/tasks")}>
            <Ionicons color={colors.primary} name="checkbox-outline" size={21} />
            <Text style={styles.shortcutText}>Tasks</Text>
          </Pressable>
          <Pressable style={styles.shortcutTile} onPress={() => router.push("/(tabs)/expenses")}>
            <Ionicons color={colors.success} name="wallet-outline" size={21} />
            <Text style={styles.shortcutText}>Expenses</Text>
          </Pressable>
          <Pressable style={styles.shortcutTile} onPress={() => router.push("/(tabs)/vault")}>
            <Ionicons color={colors.text} name="key-outline" size={21} />
            <Text style={styles.shortcutText}>Vault</Text>
          </Pressable>
          <Pressable style={styles.shortcutTile} onPress={() => router.push("/(tabs)/more")}>
            <Ionicons color={colors.accent} name="grid-outline" size={21} />
            <Text style={styles.shortcutText}>More</Text>
          </Pressable>
        </View>

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
    paddingHorizontal: 16,
    paddingTop: 12,
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
  headerActions: {
    flexDirection: "row",
    gap: 8,
  },
  heroBlock: {
    marginBottom: 16,
  },
  greeting: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "900",
    lineHeight: 34,
  },
  heroSentence: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 21,
    marginTop: 6,
  },
  composerCard: {
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 10,
    minHeight: 122,
    padding: 14,
  },
  composerInput: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "600",
    lineHeight: 24,
    minHeight: 68,
    padding: 0,
  },
  composerFooter: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10,
  },
  composerHelper: {
    color: colors.textSoft,
    flex: 1,
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
  primaryActions: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: 4,
    marginBottom: 10,
    padding: 5,
  },
  primaryAction: {
    alignItems: "center",
    borderRadius: 13,
    flex: 1,
    gap: 6,
    justifyContent: "center",
    minHeight: 64,
    paddingHorizontal: 6,
    position: "relative",
  },
  primaryActionText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "800",
  },
  actionBadge: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderColor: colors.white,
    borderRadius: 999,
    borderWidth: 2,
    height: 22,
    justifyContent: "center",
    minWidth: 22,
    position: "absolute",
    right: 8,
    top: 7,
  },
  actionBadgeText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: "900",
  },
  overviewGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 12,
  },
  overviewCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    flexBasis: "47%",
    flexGrow: 1,
    minHeight: 96,
    padding: 13,
  },
  overviewCardSelected: {
    backgroundColor: colors.accentSurface,
    borderColor: "#E4D7FF",
  },
  overviewTopRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  overviewLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  overviewValue: {
    color: colors.text,
    fontSize: 25,
    fontWeight: "900",
    lineHeight: 30,
    marginTop: 13,
  },
  overviewHint: {
    color: colors.textSoft,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 2,
  },
  todayPanel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 18,
    padding: 16,
  },
  panelLinkButton: {
    backgroundColor: colors.backgroundSoft,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    flexShrink: 0,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  panelLinkText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "900",
  },
  todayPanelHeader: {
    marginBottom: 14,
  },
  todayPanelTopRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  todayRows: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    marginTop: 14,
  },
  todayRow: {
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 66,
    paddingVertical: 12,
  },
  todayIcon: {
    alignItems: "center",
    borderRadius: 999,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  todayCopy: {
    flex: 1,
  },
  todayTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900",
  },
  todayMeta: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
    marginTop: 3,
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
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    marginBottom: 14,
  },
  panelHeaderCopy: {
    flex: 1,
    minWidth: 0,
  },
  panelTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900",
  },
  panelCaption: {
    color: colors.textSoft,
    flexShrink: 1,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
    marginTop: 3,
  },
  desktopSection: {
    marginBottom: 22,
  },
  desktopOverviewCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 24,
    borderWidth: 1,
    marginBottom: 14,
    padding: 18,
    ...subtleShadow,
  },
  desktopOverviewHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  desktopOverviewTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900",
  },
  desktopOverviewDate: {
    color: colors.textSoft,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
  },
  desktopOverviewBadge: {
    backgroundColor: colors.accentSurface,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  desktopOverviewBadgeText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "800",
  },
  desktopStatsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
    marginTop: 16,
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
  desktopStackTrack: {
    backgroundColor: colors.backgroundSoft,
    borderRadius: 999,
    flexDirection: "row",
    height: 12,
    marginTop: 4,
    overflow: "hidden",
  },
  desktopStackSegment: {
    height: "100%",
  },
  desktopProductiveSegment: {
    backgroundColor: colors.workTag,
  },
  desktopIdleSegment: {
    backgroundColor: colors.reminderTag,
  },
  desktopLegendRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  desktopLegendText: {
    color: colors.textSoft,
    fontSize: 11,
    fontWeight: "800",
  },
  desktopHighlightsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14,
  },
  desktopHighlightPill: {
    backgroundColor: colors.backgroundSoft,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  desktopHighlightText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "800",
  },
  desktopTrendCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 24,
    borderWidth: 1,
    marginBottom: 14,
    padding: 18,
    ...subtleShadow,
  },
  desktopAppList: {
    gap: 12,
    paddingTop: 6,
  },
  desktopAppRow: {
    gap: 8,
  },
  desktopAppMeta: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  desktopAppName: {
    color: colors.text,
    flex: 1,
    fontSize: 14,
    fontWeight: "800",
  },
  desktopAppMinutes: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "800",
  },
  desktopAppTrack: {
    backgroundColor: "#F7F8FC",
    borderRadius: 999,
    height: 12,
    overflow: "hidden",
  },
  desktopAppBar: {
    backgroundColor: colors.workTag,
    borderRadius: 999,
    height: "100%",
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
    minHeight: 126,
    paddingTop: 12,
  },
  barColumn: {
    alignItems: "center",
    flex: 1,
    gap: 8,
    minWidth: 0,
  },
  bar: {
    backgroundColor: colors.text,
    borderRadius: 999,
    minHeight: 18,
    width: 22,
  },
  barDateLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: "800",
  },
  barLabel: {
    color: colors.textSoft,
    fontSize: 10,
    fontWeight: "800",
    lineHeight: 12,
  },
  barLabelStack: {
    alignItems: "center",
    minHeight: 26,
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
  assistantBody: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 22,
    marginTop: 10,
  },
  assistantEyebrow: {
    color: "rgba(255,255,255,0.68)",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0,
    marginTop: 22,
    textTransform: "uppercase",
  },
  assistantIcon: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 999,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  assistantPanel: {
    backgroundColor: colors.black,
    borderRadius: 24,
    marginBottom: 14,
    padding: 20,
  },
  assistantTitle: {
    color: colors.white,
    fontSize: 32,
    fontWeight: "900",
    lineHeight: 38,
    marginTop: 6,
    maxWidth: 320,
  },
  assistantTopRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  askInputMock: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    marginTop: 18,
    minHeight: 54,
    paddingHorizontal: 15,
  },
  askInputText: {
    color: colors.white,
    flex: 1,
    fontSize: 15,
    fontWeight: "800",
  },
  emptyFocus: {
    backgroundColor: colors.backgroundSoft,
    borderRadius: 18,
    padding: 16,
  },
  emptyFocusText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 19,
    marginTop: 4,
  },
  emptyFocusTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900",
  },
  focusCopy: {
    flex: 1,
  },
  focusCompleteButton: {
    alignItems: "center",
    backgroundColor: colors.successSurface,
    borderColor: colors.borderStrong,
    borderRadius: 999,
    borderWidth: 1,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  focusCompleteButtonBusy: {
    opacity: 0.72,
  },
  focusIcon: {
    alignItems: "center",
    backgroundColor: colors.accentSurface,
    borderRadius: 999,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  focusList: {
    gap: 10,
    marginBottom: 22,
  },
  focusMeta: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 3,
  },
  focusOpenTarget: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 72,
  },
  focusRow: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 72,
    paddingHorizontal: 14,
  },
  focusTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900",
  },
  inlineError: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
    marginBottom: 12,
  },
  quickCaptureHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  quickCaptureActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  quickCapturePanel: {
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 12,
    padding: 16,
  },
  quickCaptureTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "900",
    marginTop: 3,
  },
  recentCopy: {
    flex: 1,
  },
  recentDot: {
    backgroundColor: colors.primary,
    borderRadius: 999,
    height: 8,
    marginTop: 7,
    width: 8,
  },
  recentMeta: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 3,
    textTransform: "capitalize",
  },
  recentRow: {
    alignItems: "flex-start",
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 62,
    paddingVertical: 12,
  },
  recentRows: {
    marginBottom: 22,
  },
  recentTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900",
  },
  screenshotIcon: {
    backgroundColor: "#EEF5FF",
  },
  sectionEyebrow: {
    color: colors.textSoft,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0,
    textTransform: "uppercase",
  },
  shortcutGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 22,
  },
  shortcutText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "900",
    marginTop: 8,
  },
  shortcutTile: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    flexBasis: "47%",
    flexGrow: 1,
    minHeight: 82,
    justifyContent: "center",
  },
  smallIconButton: {
    alignItems: "center",
    backgroundColor: colors.backgroundSoft,
    borderRadius: 999,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  snapshotDivider: {
    backgroundColor: colors.border,
    height: 42,
    width: 1,
  },
  snapshotItem: {
    alignItems: "center",
    flex: 1,
    minWidth: 0,
  },
  snapshotLabel: {
    color: colors.textSoft,
    fontSize: 11,
    fontWeight: "900",
    marginTop: 3,
    textTransform: "uppercase",
  },
  snapshotValue: {
    color: colors.text,
    fontSize: 19,
    fontWeight: "900",
    lineHeight: 24,
    maxWidth: "100%",
  },
  syncPill: {
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  syncPillText: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 11,
    fontWeight: "900",
  },
  todaySnapshot: {
    alignItems: "center",
    backgroundColor: colors.backgroundSoft,
    borderRadius: 18,
    flexDirection: "row",
    marginBottom: 22,
    minHeight: 78,
    paddingHorizontal: 8,
  },
  footerSpace: {
    height: 16,
  },
});
