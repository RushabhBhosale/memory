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

import { ScreenHeader } from "../../components/ScreenHeader";
import { listActivity, type ActivityItem } from "../../services/api";
import { colors } from "../../styles/theme";

type CalendarCell = {
  date: Date;
  day: number;
  key: string;
  inMonth: boolean;
};

const filters = ["All", "Notes", "Meetings", "Credentials", "Tasks"];
const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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
    const key = getDateKey(new Date(item.createdAt));

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
  if (item.type === "meeting") return "Meeting";
  if (item.type === "task" || item.kind === "task") return "Task";
  if (item.kind === "credential") return "Credentials";
  if (item.type === "note") {
    return item.category?.trim() ? toTitleCase(item.category) : "Note";
  }

  return "Note";
};

const getCategoryStyle = (item: ActivityItem) => {
  const label = getLabel(item);

  switch (label) {
    case "Meeting":
      return {
        color: "#9B6CFF",
        backgroundColor: "#F3E9FF",
      };
    case "Task":
      return {
        color: "#4F8EF7",
        backgroundColor: "#EAF2FF",
      };
    case "Credentials":
      return {
        color: "#20C987",
        backgroundColor: "#E9FFF5",
      };
    case "Note":
      return {
        color: "#4F8EF7",
        backgroundColor: "#EAF2FF",
      };
    default:
      return {
        color: "#FF8A3D",
        backgroundColor: "#FFF0E5",
      };
  }
};

const getMarkerColor = (item: ActivityItem) => {
  const label = getLabel(item);

  switch (label) {
    case "Meeting":
      return "#8B5CF6";
    case "Task":
      return "#3B82F6";
    case "Credentials":
      return "#18C58B";
    case "Note":
      return "#3B82F6";
    default:
      return "#FF914D";
  }
};

const matchesFilter = (item: ActivityItem, filter: string) => {
  const label = getLabel(item);

  if (filter === "All") return true;
  if (filter === "Notes") return item.type === "note";
  if (filter === "Meetings") return label === "Meeting";
  if (filter === "Credentials") return label === "Credentials";
  if (filter === "Tasks") return label === "Task";

  return true;
};

const formatSectionTitle = (dayKey: string) => {
  const date = parseDateKey(dayKey);
  const todayKey = getDateKey(new Date());
  const yesterdayKey = getDateKey(addDays(new Date(), -1));
  const dateLabel = shortMonthDayFormatter.format(date);

  if (dayKey === todayKey) {
    return `Today - ${dateLabel}`;
  }

  if (dayKey === yesterdayKey) {
    return `Yesterday - ${dateLabel}`;
  }

  return dateLabel;
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

  const calendarInnerWidth = screenWidth - 52 - 44;
  const dayCellSize = Math.floor(calendarInnerWidth / 7);

  const monthCells = useMemo(() => getMonthCells(visibleMonth), [visibleMonth]);
  const visibleMonthKey = getMonthKey(visibleMonth);

  const filteredActivity = useMemo(() => {
    const query = searchText.trim().toLowerCase();

    return activity.filter((item) => {
      const title = item.title || "";
      const content = item.content || "";
      const project = item.projectName || "";
      const searchable = `${title} ${content} ${project}`.toLowerCase();

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
        getDateKey(new Date(item.createdAt)).startsWith(visibleMonthKey),
      ),
    [activity, visibleMonthKey],
  );

  const monthTotal = selectedMonthItems.length;

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
    (item) => item.type === "note",
  ).length;
  const taskCount = selectedMonthItems.filter(
    (item) => getLabel(item) === "Task",
  ).length;
  const healthCount = selectedMonthItems.filter(
    (item) => getLabel(item) === "Credentials",
  ).length;

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
          const latestDate = new Date(latest.createdAt);
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

  const renderLogCard = (item: ActivityItem) => {
    const category = getCategoryStyle(item);

    return (
      <Pressable
        key={`${item.type}-${item._id}`}
        style={styles.logCard}
        onPress={() =>
          router.push({
            pathname: "/activity/[type]/[id]",
            params: {
              id: item._id,
              type: item.type,
            },
          })
        }
      >
        <View style={styles.logTopRow}>
          <View
            style={[
              styles.categoryPill,
              {
                backgroundColor: category.backgroundColor,
              },
            ]}
          >
            <Text style={[styles.categoryText, { color: category.color }]}>
              {getLabel(item)}
            </Text>
          </View>

          <Text style={styles.logTime}>
            {timeFormatter.format(new Date(item.createdAt))}
          </Text>
        </View>

        <Text numberOfLines={3} style={styles.logText}>
          {item.content || item.title}
        </Text>
      </Pressable>
    );
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
      <View style={styles.daySection}>
        <View style={styles.daySectionHeader}>
          <Text style={styles.daySectionTitle}>{title}</Text>

          <Text style={styles.daySectionCount}>
            {items.length} log{items.length === 1 ? "" : "s"}
          </Text>
        </View>

        {visibleItems.length ? (
          visibleItems.map(renderLogCard)
        ) : (
          <View style={styles.emptyDayCard}>
            <Text style={styles.emptyDayTitle}>No logs here</Text>
            <Text style={styles.emptyDayText}>
              Pick a marked date from the calendar to view your saved memories.
            </Text>
          </View>
        )}

        {options?.canExpand && items.length > visibleItems.length ? (
          <Pressable
            style={styles.viewAllButton}
            onPress={() => setShowAllPrevious(true)}
          >
            <Text style={styles.viewAllText}>View all {items.length} logs</Text>
            <Ionicons color="#9B6CFF" name="chevron-down" size={17} />
          </Pressable>
        ) : null}
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView edges={["top"]} style={styles.screen}>
        <View style={styles.centerState}>
          <ActivityIndicator color="#8B5CF6" />
          <Text style={styles.centerText}>Loading history...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView edges={["top"]} style={styles.screen}>
        <View style={styles.centerState}>
          <Text style={styles.errorText}>{error}</Text>

          <Pressable style={styles.retryButton} onPress={() => loadActivity()}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top"]} style={styles.screen}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor="#8B5CF6"
            colors={["#8B5CF6"]}
            onRefresh={() => loadActivity({ refreshing: true })}
          />
        }
      >
        <ScreenHeader mode="back" title="History" />

        <View style={styles.searchBox}>
          <Ionicons color="#A0A7B4" name="search" size={21} />

          <TextInput
            value={searchText}
            onChangeText={setSearchText}
            placeholder="Search your memories..."
            placeholderTextColor="#5F626B"
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
                style={[styles.filterChip, isActive && styles.activeFilterChip]}
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

        <View style={styles.calendarCard}>
          <View style={styles.monthHeader}>
            <Text style={styles.monthTitle}>
              {monthFormatter.format(visibleMonth)}
            </Text>

            <View style={styles.monthControls}>
              <Pressable
                style={styles.monthControlButton}
                onPress={() => changeMonth(-1)}
              >
                <Ionicons color="#A0A7B4" name="chevron-back" size={21} />
              </Pressable>

              <Pressable
                style={styles.monthControlButton}
                onPress={() => changeMonth(1)}
              >
                <Ionicons color="#A0A7B4" name="chevron-forward" size={21} />
              </Pressable>
            </View>
          </View>

          <View style={styles.weekdayRow}>
            {weekdayLabels.map((weekday) => (
              <Text key={weekday} style={styles.weekdayText}>
                {weekday}
              </Text>
            ))}
          </View>

          <View style={styles.calendarGrid}>
            {monthCells.map((cell) => {
              const dateKey = cell.key;
              const count = groupedActivity[dateKey]?.length || 0;
              const isSelected = selectedDay === dateKey;
              const isToday = todayKey === dateKey;
              const isFuture =
                cell.date.getTime() > new Date().setHours(23, 59, 59, 999);

              return (
                <Pressable
                  key={cell.key}
                  style={[
                    styles.dayCell,
                    {
                      width: dayCellSize,
                    },
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

                  {!isSelected ? (
                    <View style={styles.dotRow}>
                      {(groupedActivity[dateKey] || [])
                        .slice(0, 3)
                        .map((item) => (
                          <View
                            key={`${item.type}-${item._id}`}
                            style={[
                              styles.dot,
                              {
                                backgroundColor: getMarkerColor(item),
                              },
                            ]}
                          />
                        ))}
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
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

        <View style={styles.monthStatsPanel}>
          <Text style={styles.statsTitle}>This Month</Text>

          <View style={styles.statCardsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{monthTotal}</Text>
              <Text style={styles.statLabel}>Total Logs</Text>
            </View>

            <View style={styles.statCard}>
              <Text style={styles.statValue}>{averagePerDay}</Text>
              <Text style={styles.statLabel}>Avg per Day</Text>
            </View>
          </View>

          <View style={styles.categoryCard}>
            <Text style={styles.categoryCardTitle}>Most Active Categories</Text>

            <View style={styles.categoryRow}>
              <View
                style={[styles.categoryDot, { backgroundColor: "#8B5CF6" }]}
              />
              <Text style={styles.categoryName}>Notes</Text>
              <Text style={styles.categoryValue}>{noteCount}</Text>
            </View>

            <View style={styles.categoryRow}>
              <View
                style={[styles.categoryDot, { backgroundColor: "#3B82F6" }]}
              />
              <Text style={styles.categoryName}>Tasks</Text>
              <Text style={styles.categoryValue}>{taskCount}</Text>
            </View>

            <View style={styles.categoryRow}>
              <View
                style={[styles.categoryDot, { backgroundColor: "#18C58B" }]}
              />
              <Text style={styles.categoryName}>Credentials</Text>
              <Text style={styles.categoryValue}>{healthCount}</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const cardShadow = {
  shadowColor: "#000000",
  shadowOffset: {
    width: 0,
    height: 8,
  },
  shadowOpacity: 0.045,
  shadowRadius: 18,
  elevation: 3,
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  content: {
    paddingHorizontal: 22,
    // paddingTop: 16,
    paddingBottom: 120,
  },
  searchBox: {
    alignItems: "center",
    backgroundColor: "#F8F9FB",
    borderColor: "#EEF0F4",
    borderRadius: 11,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    height: 48,
    marginBottom: 17,
    paddingHorizontal: 16,
  },
  searchInput: {
    color: "#202126",
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    padding: 0,
  },
  filterRow: {
    gap: 9,
    marginBottom: 43,
    paddingRight: 26,
  },
  filterChip: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#EEF0F4",
    borderRadius: 999,
    borderWidth: 1,
    height: 36,
    justifyContent: "center",
    minWidth: 75,
    paddingHorizontal: 17,
  },
  activeFilterChip: {
    backgroundColor: "#17171D",
    borderColor: "#17171D",
  },
  filterText: {
    color: "#747B89",
    fontSize: 13,
    fontWeight: "800",
  },
  activeFilterText: {
    color: "#FFFFFF",
  },
  calendarCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    marginBottom: 42,
    paddingHorizontal: 22,
    paddingTop: 26,
    paddingBottom: 25,
    ...cardShadow,
  },
  monthHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 30,
  },
  monthTitle: {
    color: "#202126",
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: -0.3,
  },
  monthControls: {
    alignItems: "center",
    flexDirection: "row",
    gap: 18,
  },
  monthControlButton: {
    alignItems: "center",
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  weekdayRow: {
    flexDirection: "row",
    marginBottom: 17,
  },
  weekdayText: {
    color: "#A8ADB8",
    flex: 1,
    fontSize: 12,
    fontWeight: "800",
    textAlign: "center",
  },
  calendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 8,
  },
  dayCell: {
    alignItems: "center",
    borderRadius: 9,
    height: 42,
    justifyContent: "center",
  },
  selectedDayCell: {
    backgroundColor: "#8A5CF6CA",
    borderRadius: 30,
  },
  todayDayCell: {
    borderColor: "#17171D",
    borderWidth: 1,
  },
  dayText: {
    color: "#4E515A",
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 17,
  },
  activeDayText: {
    color: "#34363D",
  },
  mutedDayText: {
    color: "#D4D8DF",
  },
  futureDayText: {
    color: "#B8BEC8",
  },
  selectedDayText: {
    color: "#FFFFFF",
  },
  dotRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 3,
    height: 6,
    justifyContent: "center",
    marginTop: 3,
  },
  dot: {
    borderRadius: 999,
    height: 4,
    width: 4,
  },
  daySection: {
    marginBottom: 26,
  },
  daySectionHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 17,
  },
  daySectionTitle: {
    color: "#202126",
    flex: 1,
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: -0.3,
    lineHeight: 24,
  },
  daySectionCount: {
    color: "#A8ADB8",
    fontSize: 13,
    fontWeight: "800",
    marginTop: 2,
  },
  logCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 11,
    marginBottom: 16,
    paddingHorizontal: 18,
    paddingTop: 17,
    paddingBottom: 18,
    ...cardShadow,
  },
  logTopRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 13,
  },
  categoryPill: {
    borderRadius: 5,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  categoryText: {
    fontSize: 13,
    fontWeight: "900",
  },
  logTime: {
    color: "#A8ADB8",
    fontSize: 13,
    fontWeight: "700",
  },
  logText: {
    color: "#747B89",
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 24,
  },
  viewAllButton: {
    alignItems: "center",
    alignSelf: "center",
    flexDirection: "row",
    gap: 5,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  viewAllText: {
    color: "#9B6CFF",
    fontSize: 15,
    fontWeight: "800",
  },
  emptyDayCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 11,
    padding: 18,
    ...cardShadow,
  },
  emptyDayTitle: {
    color: "#202126",
    fontSize: 16,
    fontWeight: "900",
    marginBottom: 6,
  },
  emptyDayText: {
    color: "#747B89",
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 21,
  },
  monthStatsPanel: {
    backgroundColor: "#F7F8FA",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    marginHorizontal: -26,
    marginTop: 31,
    paddingHorizontal: 26,
    paddingTop: 28,
    paddingBottom: 26,
  },
  statsTitle: {
    color: "#202126",
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: -0.3,
    marginBottom: 20,
  },
  statCardsRow: {
    flexDirection: "row",
    gap: 18,
    marginBottom: 18,
  },
  statCard: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 13,
    flex: 1,
    minHeight: 92,
    justifyContent: "center",
    paddingVertical: 16,
    ...cardShadow,
  },
  statValue: {
    color: "#202126",
    fontSize: 31,
    fontWeight: "900",
    letterSpacing: -1,
  },
  statLabel: {
    color: "#85868E",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 3,
  },
  categoryCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 13,
    paddingHorizontal: 18,
    paddingTop: 19,
    paddingBottom: 18,
    ...cardShadow,
  },
  categoryCardTitle: {
    color: "#747B89",
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 14,
  },
  categoryRow: {
    alignItems: "center",
    flexDirection: "row",
    marginTop: 13,
  },
  categoryDot: {
    borderRadius: 999,
    height: 8,
    marginRight: 12,
    width: 8,
  },
  categoryName: {
    color: "#34363D",
    flex: 1,
    fontSize: 16,
    fontWeight: "800",
  },
  categoryValue: {
    color: "#5E6470",
    fontSize: 16,
    fontWeight: "900",
  },
  centerState: {
    alignItems: "center",
    flex: 1,
    gap: 12,
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  centerText: {
    color: "#747B89",
    fontSize: 14,
    fontWeight: "700",
  },
  errorText: {
    color: "#EF4444",
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center",
  },
  retryButton: {
    backgroundColor: "#17171D",
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  retryText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
  },
});
