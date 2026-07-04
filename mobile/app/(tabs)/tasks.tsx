import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppHeader, HeaderIcon } from "../../components/AppHeader";
import { MemoryCard } from "../../components/MemoryCard";
import { StateView } from "../../components/StateView";
import { listActivity, type ActivityItem } from "../../services/api";
import { colors } from "../../styles/theme";

type TaskFilter = "today" | "upcoming" | "all";

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
});

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

const getDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;

const isTaskLike = (item: ActivityItem) =>
  item.type === "task" ||
  item.kind === "task" ||
  item.category === "task" ||
  item.category === "reminder" ||
  Boolean(item.reminderAt);

const isOpenTask = (item: ActivityItem) =>
  !["completed", "done", "triggered"].includes(String(item.status || "").toLowerCase());

const formatReminderTime = (value?: string) => {
  if (!value) {
    return "No time set";
  }

  const date = new Date(value);
  return `${dateFormatter.format(date)} at ${timeFormatter.format(date)}`;
};

const filterItems = (items: ActivityItem[], filter: TaskFilter) => {
  const todayKey = getDateKey(new Date());
  const now = Date.now();

  switch (filter) {
    case "today":
      return items.filter((item) => {
        const reminderDate = item.reminderAt ? new Date(item.reminderAt) : new Date(item.createdAt);
        return getDateKey(reminderDate) === todayKey;
      });
    case "upcoming":
      return items.filter((item) => {
        if (!item.reminderAt) {
          return false;
        }

        return new Date(item.reminderAt).getTime() >= now;
      });
    default:
      return items;
  }
};

export default function TasksScreen() {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<TaskFilter>("today");

  const loadTasks = useCallback(async (options?: { refreshing?: boolean }) => {
    try {
      if (options?.refreshing) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError("");
      const nextItems = await listActivity({ limit: 300 });
      setItems(nextItems.filter(isTaskLike).filter(isOpenTask));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load tasks");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadTasks();
    }, [loadTasks]),
  );

  const filteredItems = useMemo(() => filterItems(items, filter), [filter, items]);
  const upcomingCount = useMemo(() => filterItems(items, "upcoming").length, [items]);
  const todayCount = useMemo(() => filterItems(items, "today").length, [items]);

  if (loading) {
    return (
      <SafeAreaView edges={["top"]} style={styles.screen}>
        <StateView title="Loading" detail="Finding open tasks." loading />
      </SafeAreaView>
    );
  }

  if (error && !items.length) {
    return (
      <SafeAreaView edges={["top"]} style={styles.screen}>
        <StateView
          title={error}
          tone="error"
          actionLabel="Try again"
          onAction={() => void loadTasks()}
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
            onRefresh={() => void loadTasks({ refreshing: true })}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <AppHeader
          title="Tasks"
          rightIcons={<HeaderIcon name="add-outline" onPress={() => router.push({ pathname: "/add", params: { mode: "task" } })} />}
        />

        <View style={styles.intro}>
          <Text style={styles.title}>Today’s commitments</Text>
          <Text style={styles.subtitle}>
            {todayCount
              ? `${todayCount} item${todayCount === 1 ? "" : "s"} need attention today.`
              : "No dated tasks for today."}
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          style={styles.primaryAction}
          onPress={() => router.push({ pathname: "/add", params: { mode: "reminder" } })}
        >
          <View style={styles.primaryActionIcon}>
            <Ionicons color={colors.white} name="notifications-outline" size={20} />
          </View>
          <View style={styles.primaryActionCopy}>
            <Text style={styles.primaryActionTitle}>Add reminder</Text>
            <Text style={styles.primaryActionText}>{upcomingCount} upcoming</Text>
          </View>
          <Ionicons color={colors.textSoft} name="chevron-forward" size={18} />
        </Pressable>

        <View style={styles.filterRow}>
          {(["today", "upcoming", "all"] as const).map((item) => {
            const selected = filter === item;

            return (
              <Pressable
                key={item}
                accessibilityRole="button"
                style={[styles.filterChip, selected && styles.filterChipActive]}
                onPress={() => setFilter(item)}
              >
                <Text style={[styles.filterText, selected && styles.filterTextActive]}>
                  {item === "today" ? "Today" : item === "upcoming" ? "Upcoming" : "All"}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {filteredItems.length ? (
          <View style={styles.list}>
            {filteredItems.slice(0, 24).map((item) => (
              <View key={`${item.type}-${item._id}`} style={styles.itemWrap}>
                {item.reminderAt ? (
                  <View style={styles.reminderLine}>
                    <Ionicons color={colors.reminderTag} name="time-outline" size={15} />
                    <Text style={styles.reminderText}>{formatReminderTime(item.reminderAt)}</Text>
                  </View>
                ) : null}
                <MemoryCard memory={item} />
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Ionicons color={colors.primary} name="checkbox-outline" size={25} />
            </View>
            <Text style={styles.emptyTitle}>Nothing due here</Text>
            <Text style={styles.emptyText}>Add a task or reminder when something needs a clear next step.</Text>
          </View>
        )}

        <View style={styles.footerSpace} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: 118,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  empty: {
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 34,
  },
  emptyIcon: {
    alignItems: "center",
    backgroundColor: colors.backgroundSoft,
    borderRadius: 999,
    height: 60,
    justifyContent: "center",
    marginBottom: 14,
    width: 60,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
    marginTop: 8,
    textAlign: "center",
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "900",
  },
  filterChip: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    flex: 1,
    minHeight: 42,
    justifyContent: "center",
  },
  filterChipActive: {
    backgroundColor: colors.black,
    borderColor: colors.black,
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 18,
  },
  filterText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "900",
  },
  filterTextActive: {
    color: colors.white,
  },
  footerSpace: {
    height: 8,
  },
  intro: {
    marginBottom: 16,
  },
  itemWrap: {
    gap: 8,
  },
  list: {
    gap: 12,
  },
  primaryAction: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
    minHeight: 74,
    paddingHorizontal: 14,
  },
  primaryActionCopy: {
    flex: 1,
  },
  primaryActionIcon: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 999,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  primaryActionText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 3,
  },
  primaryActionTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "900",
  },
  reminderLine: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 4,
  },
  reminderText: {
    color: colors.reminderTag,
    fontSize: 12,
    fontWeight: "900",
  },
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 22,
    marginTop: 6,
  },
  title: {
    color: colors.text,
    fontSize: 31,
    fontWeight: "900",
    lineHeight: 37,
  },
});
