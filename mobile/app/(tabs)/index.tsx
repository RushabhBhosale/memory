import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
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

import { AppUsageLinkCard } from "../../components/AppUsageLinkCard";
import { MemoryCard } from "../../components/MemoryCard";
import { generateMetadata } from "../../services/ai";
import { StateView } from "../../components/StateView";
import {
  createMemory,
  listActivity,
  listDesktopActivity,
  listMemories,
  type ActivityItem,
  type DesktopActivity,
  type Memory,
} from "../../services/api";
import {
  listExpenses,
  type ExpenseEntry,
} from "../../services/expenses";
import {
  scheduleMemoryReminder,
  scheduleUpcomingMemoryReminders,
} from "../../services/notifications";
import {
  createLocationReminder,
  getLocationDebugState,
  getTimelineByRange,
  getWorkHoursSummary,
  listLocationReminders,
  listPlaces,
  parseLocationReminderRequest,
  readLocationSettings,
  type LocationDebugState,
  type LocationReminder,
  type PlaceTimelineEvent,
  type SavedPlace,
  type WorkHoursSummary,
} from "../../services/locationIntelligence";
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

const SHOW_APP_USAGE_SURFACE = false;
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

const formatDuration = (minutes: number) => {
  if (minutes <= 0) {
    return "0m";
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (!hours) {
    return `${remainingMinutes}m`;
  }

  return `${hours}h ${remainingMinutes}m`;
};

const getPlaceMinutesForToday = (
  timeline: PlaceTimelineEvent[],
  place: SavedPlace | undefined,
) => {
  if (!place) {
    return 0;
  }

  const todayKey = getDateKey(new Date());
  const sorted = timeline
    .filter((event) => event.placeId === place.id)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  let minutes = 0;
  let openEnterTimestamp = "";

  sorted.forEach((event) => {
    if (getDateKey(new Date(event.timestamp)) !== todayKey) {
      return;
    }

    if (event.eventType === "enter") {
      openEnterTimestamp = event.timestamp;
      return;
    }

    if (event.eventType === "exit" && openEnterTimestamp) {
      minutes +=
        event.durationMinutes ||
        Math.max(
          1,
          Math.round(
            (new Date(event.timestamp).getTime() - new Date(openEnterTimestamp).getTime()) /
              60000,
          ),
        );
      openEnterTimestamp = "";
    }
  });

  if (openEnterTimestamp) {
    minutes += Math.max(
      1,
      Math.round((Date.now() - new Date(openEnterTimestamp).getTime()) / 60000),
    );
  }

  return minutes;
};

const getDailySummary = (
  items: ActivityItem[],
  expenses: ExpenseEntry[],
  timeline: PlaceTimelineEvent[],
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
  const placesVisited = new Set(
    timeline
      .filter(
        (event) =>
          event.eventType === "enter" &&
          getDateKey(new Date(event.timestamp)) === todayKey,
      )
      .map((event) => event.placeId),
  ).size;
  const sentence = spentToday > 0
      ? `You logged ${formatCurrency(spentToday)} in expenses today.`
      : todayItems.length > 0
        ? "Your captures today are building a useful daily trail."
        : "No major activity yet today. One quick capture will start the summary.";

  return {
    memoriesCaptured,
    placesVisited,
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

const getLocationSummary = (
  places: SavedPlace[],
  timeline: PlaceTimelineEvent[],
  reminders: LocationReminder[],
  workHours: WorkHoursSummary | null,
  debug: LocationDebugState | null,
) => {
  const home = places.find((place) => place.type === "home");
  const office = places.find((place) => place.type === "office");
  const lastEnter = [...timeline]
    .filter((event) => event.eventType === "enter")
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
  const currentLocation =
    debug?.lastTimelineEvent?.eventType === "enter"
      ? debug.lastTimelineEvent.placeName
      : lastEnter?.placeName || "Unknown";
  const activeLocationReminders = reminders.filter(
    (reminder) => reminder.status === "pending",
  ).length;

  return {
    activeLocationReminders,
    currentLocation,
    homeMinutes: getPlaceMinutesForToday(timeline, home),
    officeMinutes: workHours?.todayMinutes || getPlaceMinutesForToday(timeline, office),
    savedPlaces: places.length,
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

const getPromptQuestion = (items: ActivityItem[]) => {
  if (items.some((item) => item.type === "task")) {
    return "What unfinished work have I logged recently?";
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

type DashboardInsightCardProps = {
  accentColor?: string;
  children: ReactNode;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  subtitle?: string;
  title: string;
};

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

function DashboardInsightCard({
  accentColor = colors.primary,
  children,
  icon,
  onPress,
  subtitle,
  title,
}: DashboardInsightCardProps) {
  return (
    <Pressable style={styles.dashboardCard} onPress={onPress}>
      <View style={styles.dashboardCardHeader}>
        <View style={[styles.dashboardIcon, { backgroundColor: `${accentColor}18` }]}>
          <Ionicons color={accentColor} name={icon} size={18} />
        </View>
        <View style={styles.dashboardTitleBlock}>
          <Text style={styles.dashboardTitle}>{title}</Text>
          {subtitle ? <Text style={styles.dashboardSubtitle}>{subtitle}</Text> : null}
        </View>
        <Ionicons color={colors.textSoft} name="arrow-forward" size={18} />
      </View>
      {children}
    </Pressable>
  );
}

export default function HomeScreen() {
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [desktopActivity, setDesktopActivity] = useState<DesktopActivity[]>([]);
  const [expenses, setExpenses] = useState<ExpenseEntry[]>([]);
  const [locationDebug, setLocationDebug] = useState<LocationDebugState | null>(null);
  const [locationReminders, setLocationReminders] = useState<LocationReminder[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [places, setPlaces] = useState<SavedPlace[]>([]);
  const [placeTimeline, setPlaceTimeline] = useState<PlaceTimelineEvent[]>([]);
  const [screenshots, setScreenshots] = useState<ScreenshotInboxItem[]>([]);
  const [workHours, setWorkHours] = useState<WorkHoursSummary | null>(null);
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
  const askQuestion = useMemo(
    () => getPromptQuestion(activity),
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
    () => getDailySummary(activity, expenses, placeTimeline),
    [activity, expenses, placeTimeline],
  );
  const expenseSummary = useMemo(
    () => getExpenseSummary(expenses),
    [expenses],
  );
  const locationSummary = useMemo(
    () =>
      getLocationSummary(
        places,
        placeTimeline,
        locationReminders,
        workHours,
        locationDebug,
      ),
    [locationDebug, locationReminders, placeTimeline, places, workHours],
  );
  const screenshotInboxSummary = useMemo(
    () => getScreenshotInboxSummary(screenshots),
    [screenshots],
  );

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
      nextPlaces,
      nextTimeline,
      nextReminders,
      nextDebug,
      nextWorkHours,
      nextScreenshots,
    ] = await Promise.all([
      listExpenses().catch(() => []),
      listPlaces().catch(() => []),
      getTimelineByRange("today").catch(() => []),
      listLocationReminders().catch(() => []),
      getLocationDebugState().catch(() => null),
      getWorkHoursSummary().catch(() => null),
      listScreenshots().catch(() => []),
    ]);

    setExpenses(nextExpenses);
    setPlaces(nextPlaces);
    setPlaceTimeline(nextTimeline);
    setLocationReminders(nextReminders);
    setLocationDebug(nextDebug);
    setWorkHours(nextWorkHours);
    setScreenshots(nextScreenshots);
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

  useFocusEffect(
    useCallback(() => {
      loadMemories();
      void loadDashboardData();
    }, [loadDashboardData, loadMemories]),
  );

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

      const locationReminder = await parseLocationReminderRequest(trimmedContent);

      if (locationReminder?.missingPlace) {
        Alert.alert(
          "Save place first",
          locationReminder.placeName
            ? `I found a location reminder, but ${locationReminder.placeName} is not saved yet. Add it from Location.`
            : "I found a location reminder, but the place is not saved yet. Add it from Location.",
          [
            { text: "Later", style: "cancel" },
            { text: "Open Location", onPress: () => router.push("/(tabs)/location") },
          ],
        );
        return;
      }

      if (locationReminder && !locationReminder.missingPlace) {
        const locationSettings = await readLocationSettings();

        if (!locationSettings.locationReminders) {
          Alert.alert(
            "Location reminders are off",
            "Turn them on from Location settings before creating geofence reminders.",
            [
              { text: "Cancel", style: "cancel" },
              { text: "Open Location", onPress: () => router.push("/(tabs)/location") },
            ],
          );
          return;
        }

        const description = locationReminder.description || trimmedContent;
        const metadata = await generateMetadata(description);
        const memory = await createMemory({
          title: metadata.title || `Location reminder: ${description}`,
          content: description,
          category: "reminder",
          tags: metadata.tags.length ? metadata.tags : ["reminder", "location"],
          importance: metadata.importance,
          kind: "note",
          notificationEnabled: true,
          reminderType: "location",
          triggerType: locationReminder.triggerType,
          placeId: locationReminder.place.id,
          placeName: locationReminder.place.name,
          latitude: locationReminder.place.latitude,
          longitude: locationReminder.place.longitude,
          radiusMeters: locationReminder.place.radiusMeters,
          status: "pending",
        });

        await createLocationReminder({
          description,
          memoryId: memory._id,
          place: locationReminder.place,
          title: memory.title,
          triggerType: locationReminder.triggerType,
        });
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

        <View style={styles.dashboardStack}>
          {screenshotInboxSummary.shouldShow ? (
            <DashboardInsightCard
              accentColor={colors.secondary}
              icon="images-outline"
              title="Screenshot Inbox"
              subtitle={`${screenshotInboxSummary.pending} pending screenshots`}
              onPress={() => router.push("/screenshots")}
            >
              <View style={styles.screenshotInboxRow}>
                <View>
                  <Text style={styles.screenshotInboxValue}>
                    {screenshotInboxSummary.pending} pending
                  </Text>
                  <Text style={styles.screenshotInboxLabel}>
                    waiting to become memories
                  </Text>
                </View>
                <View style={styles.screenshotProcessedPill}>
                  <Text style={styles.screenshotProcessedText}>
                    {screenshotInboxSummary.processedToday} processed today
                  </Text>
                </View>
              </View>
            </DashboardInsightCard>
          ) : null}

          <DashboardInsightCard
            accentColor={colors.primary}
            icon="sparkles-outline"
            title="Today's Summary"
            subtitle="Daily dashboard"
            onPress={() => router.push("/summary/daily")}
          >
            <View style={styles.summaryGrid}>
              <View style={styles.summaryMetric}>
                <Text style={styles.summaryMetricValue}>
                  {dailySummary.memoriesCaptured}
                </Text>
                <Text style={styles.summaryMetricLabel}>memories</Text>
              </View>
              <View style={styles.summaryMetric}>
                <Text style={styles.summaryMetricValue}>
                  {dailySummary.tasksCompleted}
                </Text>
                <Text style={styles.summaryMetricLabel}>tasks completed</Text>
              </View>
              <View style={styles.summaryMetric}>
                <Text style={styles.summaryMetricValue}>
                  {formatCurrency(dailySummary.spentToday)}
                </Text>
                <Text style={styles.summaryMetricLabel}>spent</Text>
              </View>
              <View style={styles.summaryMetric}>
                <Text style={styles.summaryMetricValue}>
                  {dailySummary.placesVisited}
                </Text>
                <Text style={styles.summaryMetricLabel}>places visited</Text>
              </View>
            </View>
            <Text style={styles.dashboardInsightText}>{dailySummary.sentence}</Text>
          </DashboardInsightCard>

          <DashboardInsightCard
            accentColor={colors.success}
            icon="wallet-outline"
            title="Expenses"
            subtitle={`Top category: ${expenseSummary.topCategory}`}
            onPress={() => router.push("/(tabs)/expenses")}
          >
            <View style={styles.expenseDashboardRow}>
              <View>
                <Text style={styles.expenseAmount}>
                  {formatCurrency(expenseSummary.todaySpend)} today
                </Text>
                <Text style={styles.expenseMonthText}>
                  {formatCurrency(expenseSummary.monthSpend)} this month
                </Text>
              </View>
              <View
                style={[
                  styles.trendPill,
                  expenseSummary.trendPercent <= 0 && styles.trendPillDown,
                ]}
              >
                <Ionicons
                  color={
                    expenseSummary.trendPercent <= 0
                      ? colors.success
                      : colors.reminderTag
                  }
                  name={
                    expenseSummary.trendPercent <= 0
                      ? "arrow-down"
                      : "arrow-up"
                  }
                  size={13}
                />
                <Text
                  style={[
                    styles.trendText,
                    expenseSummary.trendPercent <= 0 && styles.trendTextDown,
                  ]}
                >
                  {Math.abs(expenseSummary.trendPercent)}% vs last month
                </Text>
              </View>
            </View>
          </DashboardInsightCard>

          <DashboardInsightCard
            accentColor={colors.secondary}
            icon="location-outline"
            title="Location Intelligence"
            subtitle={`Current: ${locationSummary.currentLocation}`}
            onPress={() => router.push("/(tabs)/location")}
          >
            <View style={styles.locationDashboardGrid}>
              <View style={styles.locationDashboardMetric}>
                <Text style={styles.locationDashboardValue}>
                  {formatDuration(locationSummary.officeMinutes)}
                </Text>
                <Text style={styles.locationDashboardLabel}>Office today</Text>
              </View>
              <View style={styles.locationDashboardMetric}>
                <Text style={styles.locationDashboardValue}>
                  {formatDuration(locationSummary.homeMinutes)}
                </Text>
                <Text style={styles.locationDashboardLabel}>Home today</Text>
              </View>
            </View>
            <View style={styles.locationFooterRow}>
              <Text style={styles.locationFooterText}>
                {locationSummary.savedPlaces} saved places
              </Text>
              {locationSummary.activeLocationReminders ? (
                <Text style={styles.locationReminderText}>
                  {locationSummary.activeLocationReminders} active location reminders
                </Text>
              ) : (
                <Text style={styles.locationReminderText}>No active location reminders</Text>
              )}
            </View>
          </DashboardInsightCard>
        </View>

        {SHOW_APP_USAGE_SURFACE ? <AppUsageLinkCard /> : null}

        {SHOW_DESKTOP_ACTIVITY_SURFACE && desktopActivity.length ? (
          <View style={styles.desktopSection}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Desktop activity</Text>
              <Text style={styles.sectionMeta}>Auto-synced from laptop</Text>
            </View>
            {latestDesktopActivity ? (
              <View style={styles.desktopOverviewCard}>
                <View style={styles.desktopOverviewHeader}>
                  <View>
                    <Text style={styles.desktopOverviewTitle}>Latest laptop snapshot</Text>
                    <Text style={styles.desktopOverviewDate}>{latestDesktopActivity.date}</Text>
                  </View>
                  <View style={styles.desktopOverviewBadge}>
                    <Text style={styles.desktopOverviewBadgeText}>
                      {latestDesktopActivity.productivityScore}% score
                    </Text>
                  </View>
                </View>

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

                <View style={styles.desktopStackTrack}>
                  <View
                    style={[
                      styles.desktopStackSegment,
                      styles.desktopProductiveSegment,
                      {
                        flex:
                          latestDesktopActivity.productiveMinutes /
                          latestDesktopTotalMinutes,
                      },
                    ]}
                  />
                  <View
                    style={[
                      styles.desktopStackSegment,
                      styles.desktopIdleSegment,
                      {
                        flex:
                          latestDesktopActivity.idleMinutes /
                          latestDesktopTotalMinutes,
                      },
                    ]}
                  />
                </View>
                <View style={styles.desktopLegendRow}>
                  <Text style={styles.desktopLegendText}>productive</Text>
                  <Text style={styles.desktopLegendText}>idle</Text>
                </View>

                <View style={styles.desktopHighlightsRow}>
                  {latestDesktopApp ? (
                    <View style={styles.desktopHighlightPill}>
                      <Text style={styles.desktopHighlightText}>Top app: {latestDesktopApp}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            ) : null}

            {desktopAppBreakdown.length ? (
              <View style={styles.desktopTrendCard}>
                <View style={styles.panelHeader}>
                  <Text style={styles.panelTitle}>Top apps</Text>
                  <Text style={styles.panelCaption}>Latest sync</Text>
                </View>
                <View style={styles.desktopAppList}>
                  {desktopAppBreakdown.map((item) => (
                    <View key={item.appName} style={styles.desktopAppRow}>
                      <View style={styles.desktopAppMeta}>
                        <Text numberOfLines={1} style={styles.desktopAppName}>
                          {item.appName}
                        </Text>
                        <Text style={styles.desktopAppMinutes}>
                          {item.durationMinutes}m
                        </Text>
                      </View>
                      <View style={styles.desktopAppTrack}>
                        <View
                          style={[
                            styles.desktopAppBar,
                            {
                              width: `${Math.max(
                                8,
                                (item.durationMinutes / maxDesktopAppMinutes) * 100,
                              )}%`,
                            },
                          ]}
                        />
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {desktopActivity.slice(0, 3).map((item) => (
              <View key={item._id} style={styles.desktopCard}>
                <View style={styles.desktopCardHeader}>
                  <Text style={styles.desktopCardTitle}>{item.title}</Text>
                  <Text style={styles.desktopCardDate}>{item.date}</Text>
                </View>
                <Text numberOfLines={2} style={styles.desktopSummary}>
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
            <Text style={styles.panelCaption}>{weekRangeLabel}</Text>
          </View>

          <View style={styles.chartWrap}>
            {weekdayCounts.map((count, index) => {
              const height = weeklyActivityTotal
                ? Math.max(18, Math.round((count / maxWeekCount) * 94))
                : 18;

              return (
                <View key={`${weeklyActivityLabels[index].weekday}-${weeklyActivityLabels[index].day}`} style={styles.barColumn}>
                  <View style={[styles.bar, { height }]} />
                  <View style={styles.barLabelStack}>
                    <Text style={styles.barLabel}>{weeklyActivityLabels[index].weekday}</Text>
                    <Text style={styles.barDateLabel}>{weeklyActivityLabels[index].day}</Text>
                  </View>
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
            Search across memories, tasks, reminders, notes, and daily context
            with natural language.
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
  dashboardCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 24,
    borderWidth: 1,
    padding: 18,
    ...subtleShadow,
  },
  dashboardCardHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    marginBottom: 14,
  },
  dashboardIcon: {
    alignItems: "center",
    borderRadius: 999,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  dashboardInsightText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 21,
    marginTop: 14,
  },
  dashboardStack: {
    gap: 16,
    marginBottom: 22,
  },
  dashboardSubtitle: {
    color: colors.textSoft,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 3,
  },
  dashboardTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900",
  },
  dashboardTitleBlock: {
    flex: 1,
  },
  expenseAmount: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "900",
    lineHeight: 28,
  },
  expenseDashboardRow: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  expenseMonthText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: "800",
    marginTop: 5,
  },
  locationDashboardGrid: {
    flexDirection: "row",
    gap: 12,
  },
  locationDashboardLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 5,
  },
  locationDashboardMetric: {
    backgroundColor: colors.backgroundSoft,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    padding: 14,
  },
  locationDashboardValue: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "900",
  },
  locationFooterRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "space-between",
    marginTop: 14,
  },
  locationFooterText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "800",
  },
  locationReminderText: {
    color: colors.secondary,
    fontSize: 12,
    fontWeight: "900",
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
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  summaryMetric: {
    backgroundColor: colors.backgroundSoft,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    flexBasis: "47%",
    flexGrow: 1,
    padding: 14,
  },
  screenshotInboxLabel: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "800",
    marginTop: 5,
  },
  screenshotInboxRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  screenshotInboxValue: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "900",
  },
  screenshotProcessedPill: {
    backgroundColor: "#EEF5FF",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  screenshotProcessedText: {
    color: colors.secondary,
    fontSize: 12,
    fontWeight: "900",
  },
  summaryMetricLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 5,
  },
  summaryMetricValue: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "900",
  },
  trendPill: {
    alignItems: "center",
    backgroundColor: colors.dangerSurface,
    borderRadius: 999,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  trendPillDown: {
    backgroundColor: colors.successSurface,
  },
  trendText: {
    color: colors.reminderTag,
    fontSize: 11,
    fontWeight: "900",
  },
  trendTextDown: {
    color: colors.success,
  },
  locationCopy: {
    flex: 1,
  },
  locationIcon: {
    alignItems: "center",
    backgroundColor: colors.accentSurface,
    borderRadius: 999,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  locationPanel: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    marginBottom: 18,
    padding: 16,
    ...subtleShadow,
  },
  locationText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
    marginTop: 3,
  },
  locationTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900",
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
  footerSpace: {
    height: 16,
  },
});
