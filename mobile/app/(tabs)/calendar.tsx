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
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { MemoryCard } from "../../components/MemoryCard";
import { ScreenHeader } from "../../components/ScreenHeader";
import { StateView } from "../../components/StateView";
import { listActivity, type ActivityItem } from "../../services/api";
import { colors, subtleShadow } from "../../styles/theme";

type CalendarCell = {
  date: Date;
  day: number;
  key: string;
  inMonth: boolean;
};

const filters = ["All", "Notes", "Tasks", "Expenses", "Meetings", "Credentials"];
const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const calendarColumnGap = 4;

const monthFormatter = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
});

const shortMonthDayFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});

const formatCompactCurrency = (amount: number) => {
  if (amount >= 100000) {
    return `₹${(amount / 100000).toFixed(amount >= 1000000 ? 0 : 1)}L`;
  }

  if (amount >= 1000) {
    return `₹${(amount / 1000).toFixed(amount >= 10000 ? 0 : 1)}k`;
  }

  return `₹${Math.round(amount)}`;
};

const getDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;

const getMonthKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

const parseDateKey = (key: string) => {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
};

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const getMonthCells = (visibleMonth: Date): CalendarCell[] => {
  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  const firstDate = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startDate = new Date(year, month, 1 - firstDate.getDay());
  const totalCells = firstDate.getDay() + daysInMonth > 35 ? 42 : 35;

  return Array.from({ length: totalCells }).map((_, index) => {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + index);

    return {
      date,
      day: date.getDate(),
      key: getDateKey(date),
      inMonth: date.getMonth() === month,
    };
  });
};

const groupActivityByDay = (items: ActivityItem[]) =>
  items.reduce<Record<string, ActivityItem[]>>((groups, item) => {
    const key = getDateKey(new Date(item.timestamp || item.createdAt));

    if (!groups[key]) {
      groups[key] = [];
    }

    groups[key].push(item);

    return groups;
  }, {});

const toTitleCase = (value: string) =>
  value
    .split(/[\s-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");

const getLabel = (item: ActivityItem) => {
  if (item.type === "meeting") {
    return "Meeting";
  }

  if (item.type === "expense") {
    return item.transactionType === "income" ? "Income" : "Expense";
  }

  if (item.type === "task" || item.kind === "task") {
    return "Task";
  }

  if (item.kind === "credential") {
    return "Credentials";
  }

  if (item.type === "note") {
    return item.category?.trim() ? toTitleCase(item.category) : "Note";
  }

  return "Note";
};

const getMarkerColor = (item: ActivityItem) => {
  const label = getLabel(item);

  switch (label) {
    case "Meeting":
      return colors.primary;
    case "Task":
      return colors.secondary;
    case "Credentials":
      return colors.success;
    case "Expense":
      return colors.primary;
    case "Income":
      return colors.success;
    default:
      return colors.reminderTag;
  }
};

const matchesFilter = (item: ActivityItem, filter: string) => {
  const label = getLabel(item);

  if (filter === "All") {
    return true;
  }

  if (filter === "Notes") {
    return item.type === "note" || item.type === "memory";
  }

  if (filter === "Meetings") {
    return label === "Meeting";
  }

  if (filter === "Credentials") {
    return label === "Credentials";
  }

  if (filter === "Tasks") {
    return label === "Task";
  }

  if (filter === "Expenses") {
    return item.type === "expense";
  }

  return true;
};

const formatSectionTitle = (dayKey: string) => {
  const date = parseDateKey(dayKey);
  const todayKey = getDateKey(new Date());
  const yesterdayKey = getDateKey(addDays(new Date(), -1));
  const dateLabel = shortMonthDayFormatter.format(date);

  if (dayKey === todayKey) {
    return `Today • ${dateLabel}`;
  }

  if (dayKey === yesterdayKey) {
    return `Yesterday • ${dateLabel}`;
  }

  return dateLabel;
};

const getInsight = (
  monthTotal: number,
  averagePerDay: string,
  selectedCount: number,
) => {
  if (selectedCount > 0) {
    return `${selectedCount} saved item${selectedCount === 1 ? "" : "s"} on the selected day.`;
  }

  if (monthTotal > 0) {
    return `${monthTotal} items logged this month, averaging ${averagePerDay} per day.`;
  }

  return "Your timeline is quiet right now. New captures will appear here automatically.";
};

export default function CalendarScreen() {
  const { width: screenWidth } = useWindowDimensions();

  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [selectedDay, setSelectedDay] = useState(() => getDateKey(new Date()));
  const [visibleMonth, setVisibleMonth] = useState(() => new Date());
  const [activeFilter, setActiveFilter] = useState("All");
  const [searchText, setSearchText] = useState("");
  const [showAllPrevious, setShowAllPrevious] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const todayKey = getDateKey(new Date());
  const selectedDate = parseDateKey(selectedDay);
  const previousDayKey = getDateKey(addDays(selectedDate, -1));
  const calendarInnerWidth = screenWidth - 44 - 36;
  const dayCellSize = Math.floor((calendarInnerWidth - calendarColumnGap * 6) / 7);
  const monthCells = useMemo(() => getMonthCells(visibleMonth), [visibleMonth]);
  const visibleMonthKey = getMonthKey(visibleMonth);

  const filteredActivity = useMemo(() => {
    const query = searchText.trim().toLowerCase();

    return activity.filter((item) => {
      const searchable =
        `${item.title || ""} ${item.content || ""} ${item.category || ""} ${item.tags.join(
          " ",
        )}`.toLowerCase();

      return (
        matchesFilter(item, activeFilter) &&
        (!query || searchable.includes(query))
      );
    });
  }, [activity, activeFilter, searchText]);

  const groupedActivity = useMemo(
    () => groupActivityByDay(filteredActivity),
    [filteredActivity],
  );
  const selectedActivity = groupedActivity[selectedDay] || [];
  const previousActivity = groupedActivity[previousDayKey] || [];

  const selectedMonthItems = useMemo(
    () =>
      activity.filter((item) =>
        getDateKey(new Date(item.timestamp || item.createdAt)).startsWith(visibleMonthKey),
      ),
    [activity, visibleMonthKey],
  );

  const monthTotal = selectedMonthItems.length;
  const monthSpend = selectedMonthItems
    .filter((item) => item.type === "expense" && item.transactionType !== "income")
    .reduce((total, item) => total + (item.amount || 0), 0);
  const daysInVisibleMonth = new Date(
    visibleMonth.getFullYear(),
    visibleMonth.getMonth() + 1,
    0,
  ).getDate();
  const isCurrentMonth = visibleMonthKey === getMonthKey(new Date());
  const averagePerDay = monthTotal
    ? (
        monthTotal /
        (isCurrentMonth ? new Date().getDate() : daysInVisibleMonth)
      ).toFixed(1)
    : "0.0";

  const noteCount = selectedMonthItems.filter(
    (item) => item.type === "note" || item.type === "memory",
  ).length;
  const taskCount = selectedMonthItems.filter(
    (item) => getLabel(item) === "Task",
  ).length;
  const credentialCount = selectedMonthItems.filter(
    (item) => getLabel(item) === "Credentials",
  ).length;
  const expenseCount = selectedMonthItems.filter(
    (item) => item.type === "expense",
  ).length;
  const aiInsight = getInsight(
    monthTotal,
    averagePerDay,
    selectedActivity.length,
  );

  const loadActivity = useCallback(
    async (options?: { refreshing?: boolean }) => {
      try {
        if (options?.refreshing) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        setError("");
        const nextActivity = await listActivity({ limit: 500 });
        setActivity(nextActivity);

        const latest = nextActivity[0];

        if (latest?.createdAt) {
          const latestDate = new Date(latest.timestamp || latest.createdAt);
          setSelectedDay(getDateKey(latestDate));
          setVisibleMonth(
            new Date(latestDate.getFullYear(), latestDate.getMonth(), 1),
          );
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load history");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [],
  );

  useFocusEffect(
    useCallback(() => {
      loadActivity();
    }, [loadActivity]),
  );

  const changeMonth = (offset: number) => {
    setVisibleMonth((current) => {
      const next = new Date(
        current.getFullYear(),
        current.getMonth() + offset,
        1,
      );
      const nextMonthKey = getMonthKey(next);
      const nextSelectedDay =
        nextMonthKey === getMonthKey(new Date())
          ? todayKey
          : getDateKey(new Date(next));

      setSelectedDay(nextSelectedDay);
      setShowAllPrevious(false);

      return next;
    });
  };

  const selectCalendarDay = (cell: CalendarCell) => {
    setSelectedDay(cell.key);
    setShowAllPrevious(false);

    if (!cell.inMonth) {
      setVisibleMonth(
        new Date(cell.date.getFullYear(), cell.date.getMonth(), 1),
      );
    }
  };

  const renderSection = (
    title: string,
    items: ActivityItem[],
    options?: {
      limit?: number;
      canExpand?: boolean;
    },
  ) => {
    const visibleItems = options?.limit ? items.slice(0, options.limit) : items;

    return (
      <View style={styles.sectionBlock}>
        <View style={styles.sectionHead}>
          <Text style={styles.sectionBlockTitle}>{title}</Text>
          <Text style={styles.sectionCount}>
            {items.length} item{items.length === 1 ? "" : "s"}
          </Text>
        </View>

        {visibleItems.length ? (
          visibleItems.map((item) => (
            <MemoryCard key={`${item.type}-${item._id}`} memory={item} />
          ))
        ) : (
          <View style={styles.emptyDayCard}>
            <Text style={styles.emptyDayTitle}>No logs here</Text>
            <Text style={styles.emptyDayText}>
              Pick a marked date or change filters to explore your saved
              history.
            </Text>
          </View>
        )}

        {options?.canExpand && items.length > visibleItems.length ? (
          <Pressable
            style={styles.viewAllButton}
            onPress={() => setShowAllPrevious(true)}
          >
            <Text style={styles.viewAllText}>
              View all {items.length} items
            </Text>
            <Ionicons color={colors.primary} name="chevron-down" size={17} />
          </Pressable>
        ) : null}
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView edges={["top"]} style={styles.screen}>
        <StateView
          title="Loading history"
          detail="Building your timeline."
          loading
        />
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
          onAction={() => loadActivity()}
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
            onRefresh={() => loadActivity({ refreshing: true })}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader mode="back" title="History" />

        {/* <View style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <View style={styles.heroBadge}>
              <Ionicons color={colors.primary} name="time-outline" size={14} />
              <Text style={styles.heroBadgeText}>Timeline</Text>
            </View>
            <Text style={styles.heroMonth}>{monthFormatter.format(visibleMonth)}</Text>
          </View>

          <Text style={styles.heroTitle}>Browse your memory by date</Text>
          <Text style={styles.heroInsight}>{aiInsight}</Text>

          <View style={styles.metricRow}>
            <View style={styles.metricCard}>
              <Text style={styles.metricValue}>{monthTotal}</Text>
              <Text style={styles.metricLabel}>this month</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricValue}>{averagePerDay}</Text>
              <Text style={styles.metricLabel}>avg per day</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricValue}>{selectedActivity.length}</Text>
              <Text style={styles.metricLabel}>selected day</Text>
            </View>
          </View>
        </View> */}

        <View style={styles.searchCard}>
          <View style={styles.searchBox}>
            <Ionicons color={colors.textSoft} name="search" size={20} />
            <TextInput
              value={searchText}
              onChangeText={setSearchText}
              placeholder="Search titles, content, categories, tags..."
              placeholderTextColor={colors.textSoft}
              style={styles.searchInput}
            />
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
          >
            {filters.map((filter) => {
              const isActive = activeFilter === filter;

              return (
                <Pressable
                  key={filter}
                  style={[
                    styles.filterChip,
                    isActive && styles.activeFilterChip,
                  ]}
                  onPress={() => setActiveFilter(filter)}
                >
                  <Text
                    style={[
                      styles.filterText,
                      isActive && styles.activeFilterText,
                    ]}
                  >
                    {filter}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.calendarCard}>
          <View style={styles.calendarHead}>
            <View>
              <Text style={styles.calendarTitle}>
                {monthFormatter.format(visibleMonth)}
              </Text>
              <Text style={styles.calendarCaption}>
                Tap a day to inspect saved activity.
              </Text>
            </View>

            <View style={styles.monthControls}>
              <Pressable
                style={styles.monthControlButton}
                onPress={() => changeMonth(-1)}
              >
                <Ionicons
                  color={colors.textMuted}
                  name="chevron-back"
                  size={20}
                />
              </Pressable>
              <Pressable
                style={styles.monthControlButton}
                onPress={() => changeMonth(1)}
              >
                <Ionicons
                  color={colors.textMuted}
                  name="chevron-forward"
                  size={20}
                />
              </Pressable>
            </View>
          </View>

          <View style={styles.weekdayRow}>
            {weekdayLabels.map((weekday) => (
              <Text key={weekday} style={[styles.weekdayText, { width: dayCellSize }]}>
                {weekday}
              </Text>
            ))}
          </View>

          <View style={styles.calendarGrid}>
            {monthCells.map((cell) => {
              const dateKey = cell.key;
              const dayItems = groupedActivity[dateKey] || [];
              const count = dayItems.length;
              const daySpend = dayItems
                .filter((item) => item.type === "expense" && item.transactionType !== "income")
                .reduce((total, item) => total + (item.amount || 0), 0);
              const isSelected = selectedDay === dateKey;
              const isToday = todayKey === dateKey;
              const isFuture =
                cell.date.getTime() > new Date().setHours(23, 59, 59, 999);

              return (
                <Pressable
                  key={cell.key}
                  style={[
                    styles.dayCell,
                    { width: dayCellSize, height: dayCellSize + 6 },
                    isSelected && styles.selectedDayCell,
                    isToday && !isSelected && styles.todayDayCell,
                  ]}
                  onPress={() => selectCalendarDay(cell)}
                >
                  <Text
                    style={[
                      styles.dayText,
                      !cell.inMonth && styles.mutedDayText,
                      isFuture && cell.inMonth && styles.futureDayText,
                      count > 0 && cell.inMonth && styles.activeDayText,
                      isSelected && styles.selectedDayText,
                    ]}
                  >
                    {cell.day}
                  </Text>

                  {daySpend > 0 ? (
                    <Text
                      adjustsFontSizeToFit
                      minimumFontScale={0.72}
                      numberOfLines={1}
                      style={[
                        styles.daySpendText,
                        isSelected && styles.selectedDaySpendText,
                      ]}
                    >
                      {formatCompactCurrency(daySpend)}
                    </Text>
                  ) : count > 0 ? (
                    <View style={styles.dotRow}>
                      {dayItems
                        .slice(0, 3)
                        .map((item) => (
                          <View
                            key={`${item.type}-${item._id}`}
                            style={[
                              styles.dot,
                              { backgroundColor: getMarkerColor(item) },
                            ]}
                          />
                        ))}
                    </View>
                  ) : (
                    <View style={styles.dotRowPlaceholder} />
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.statsPanel}>
          <View style={styles.statsHeader}>
            <Text style={styles.statsTitle}>Month snapshot</Text>
            <Text style={styles.statsSubtitle}>
              {monthFormatter.format(visibleMonth)}
            </Text>
          </View>

          <View style={styles.statsList}>
            <View style={styles.statsRow}>
              <View
                style={[
                  styles.statsDot,
                  { backgroundColor: colors.reminderTag },
                ]}
              />
              <Text style={styles.statsName}>Notes and memories</Text>
              <Text style={styles.statsValue}>{noteCount}</Text>
            </View>
            <View style={styles.statsRow}>
              <View
                style={[styles.statsDot, { backgroundColor: colors.secondary }]}
              />
              <Text style={styles.statsName}>Tasks</Text>
              <Text style={styles.statsValue}>{taskCount}</Text>
            </View>
            <View style={styles.statsRow}>
              <View
                style={[styles.statsDot, { backgroundColor: colors.success }]}
              />
              <Text style={styles.statsName}>Credentials</Text>
              <Text style={styles.statsValue}>{credentialCount}</Text>
            </View>
            <View style={styles.statsRow}>
              <View
                style={[styles.statsDot, { backgroundColor: colors.primary }]}
              />
              <Text style={styles.statsName}>Expenses</Text>
              <Text style={styles.statsValue}>
                {expenseCount} · {formatCompactCurrency(monthSpend)}
              </Text>
            </View>
          </View>
        </View>

        {renderSection(formatSectionTitle(selectedDay), selectedActivity)}

        {previousActivity.length
          ? renderSection(
              formatSectionTitle(previousDayKey),
              previousActivity,
              {
                limit: showAllPrevious ? undefined : 3,
                canExpand: !showAllPrevious,
              },
            )
          : null}
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
    paddingBottom: 120,
  },
  heroCard: {
    backgroundColor: "#F8FBFF",
    borderColor: "#E7EEF8",
    borderRadius: 28,
    borderWidth: 1,
    marginBottom: 16,
    padding: 18,
    ...subtleShadow,
  },
  heroTopRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  heroBadge: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  heroBadgeText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "800",
  },
  heroMonth: {
    color: colors.textSoft,
    fontSize: 13,
    fontWeight: "700",
  },
  heroTitle: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "900",
    lineHeight: 34,
  },
  heroInsight: {
    color: colors.textMuted,
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 23,
    marginTop: 10,
  },
  metricRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 18,
  },
  metricCard: {
    backgroundColor: colors.white,
    borderRadius: 18,
    flex: 1,
    minHeight: 86,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  metricValue: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "900",
  },
  metricLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 5,
  },
  searchCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 24,
    borderWidth: 1,
    marginBottom: 16,
    padding: 16,
    ...subtleShadow,
  },
  searchBox: {
    alignItems: "center",
    backgroundColor: colors.backgroundSoft,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    height: 50,
    paddingHorizontal: 16,
  },
  searchInput: {
    color: colors.text,
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    padding: 0,
  },
  filterRow: {
    gap: 10,
    paddingRight: 10,
    paddingTop: 14,
  },
  filterChip: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    height: 36,
    justifyContent: "center",
    minWidth: 78,
    paddingHorizontal: 16,
  },
  activeFilterChip: {
    backgroundColor: colors.text,
    borderColor: colors.text,
  },
  filterText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "800",
  },
  activeFilterText: {
    color: colors.white,
  },
  calendarCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 28,
    borderWidth: 1,
    marginBottom: 16,
    padding: 18,
    ...subtleShadow,
  },
  calendarHead: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  calendarTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900",
  },
  calendarCaption: {
    color: colors.textSoft,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 4,
  },
  monthControls: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  monthControlButton: {
    alignItems: "center",
    backgroundColor: colors.backgroundSoft,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  weekdayRow: {
    flexDirection: "row",
    gap: calendarColumnGap,
    marginBottom: 10,
  },
  weekdayText: {
    color: colors.textSoft,
    fontSize: 12,
    fontWeight: "800",
    textAlign: "center",
  },
  calendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: calendarColumnGap,
    justifyContent: "flex-start",
  },
  dayCell: {
    alignItems: "center",
    borderRadius: 16,
    justifyContent: "center",
  },
  selectedDayCell: {
    backgroundColor: colors.text,
  },
  todayDayCell: {
    backgroundColor: colors.accentSurface,
  },
  dayText: {
    color: colors.textMuted,
    fontSize: 15,
    fontWeight: "800",
  },
  mutedDayText: {
    color: "#D0D5DF",
  },
  futureDayText: {
    color: "#C2C8D2",
  },
  activeDayText: {
    color: colors.text,
  },
  selectedDayText: {
    color: colors.white,
  },
  daySpendText: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: "900",
    height: 12,
    marginTop: 6,
    maxWidth: "92%",
    textAlign: "center",
  },
  selectedDaySpendText: {
    color: colors.white,
  },
  dotRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 3,
    height: 12,
    marginTop: 6,
  },
  dotRowPlaceholder: {
    height: 12,
    marginTop: 6,
  },
  dot: {
    borderRadius: 999,
    height: 5,
    width: 5,
  },
  statsPanel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 24,
    borderWidth: 1,
    marginBottom: 18,
    padding: 18,
    ...subtleShadow,
  },
  statsHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  statsTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900",
  },
  statsSubtitle: {
    color: colors.textSoft,
    fontSize: 13,
    fontWeight: "700",
  },
  statsList: {
    gap: 12,
  },
  statsRow: {
    alignItems: "center",
    flexDirection: "row",
  },
  statsDot: {
    borderRadius: 999,
    height: 8,
    marginRight: 10,
    width: 8,
  },
  statsName: {
    color: colors.textMuted,
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
  },
  statsValue: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900",
  },
  sectionBlock: {
    marginBottom: 20,
  },
  sectionHead: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionBlockTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900",
  },
  sectionCount: {
    color: colors.textSoft,
    fontSize: 13,
    fontWeight: "700",
  },
  emptyDayCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
    ...subtleShadow,
  },
  emptyDayTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900",
  },
  emptyDayText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 21,
    marginTop: 6,
  },
  viewAllButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: 6,
    marginTop: 4,
  },
  viewAllText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: "800",
  },
});
