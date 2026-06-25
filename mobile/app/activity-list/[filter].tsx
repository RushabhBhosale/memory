import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { MemoryCard } from "../../components/MemoryCard";
import { ScreenHeader } from "../../components/ScreenHeader";
import { StateView } from "../../components/StateView";
import { listActivity, type ActivityItem } from "../../services/api";
import { colors } from "../../styles/theme";

const PAGE_SIZE = 30;
const FETCH_LIMIT = 500;

type ActivityFilter = "notes" | "tasks";

const isActivityFilter = (value: unknown): value is ActivityFilter =>
  value === "notes" || value === "tasks";

const getFilterTitle = (filter: ActivityFilter) =>
  filter === "tasks" ? "Tasks" : "Notes";

const getFilterSubtitle = (filter: ActivityFilter) =>
  filter === "tasks"
    ? "All task-like items from recent activity."
    : "All notes and saved memories from recent activity.";

const filterItems = (items: ActivityItem[], filter: ActivityFilter) => {
  if (filter === "tasks") {
    return items.filter((item) => item.type === "task" || item.kind === "task");
  }

  return items.filter((item) => item.type === "note" || item.type === "memory");
};

export default function ActivityListScreen() {
  const params = useLocalSearchParams<{ filter?: string }>();
  const filter = isActivityFilter(params.filter) ? params.filter : "notes";
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const filteredItems = useMemo(
    () => filterItems(activity, filter),
    [activity, filter],
  );
  const visibleItems = filteredItems.slice(0, visibleCount);
  const hasMore = visibleCount < filteredItems.length;

  const loadActivity = useCallback(async (options?: { refresh?: boolean }) => {
    try {
      if (options?.refresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError("");
      const nextActivity = await listActivity({ limit: FETCH_LIMIT });
      setActivity(nextActivity);
      setVisibleCount(PAGE_SIZE);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load activity");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadActivity();
    }, [loadActivity]),
  );

  const loadMore = () => {
    if (!hasMore) {
      return;
    }

    setVisibleCount((current) => Math.min(current + PAGE_SIZE, filteredItems.length));
  };

  if (loading && !activity.length) {
    return (
      <SafeAreaView edges={["top"]} style={styles.screen}>
        <ScreenHeader mode="back" title={getFilterTitle(filter)} />
        <StateView title="Loading" detail="Pulling your recent activity." loading />
      </SafeAreaView>
    );
  }

  if (error && !activity.length) {
    return (
      <SafeAreaView edges={["top"]} style={styles.screen}>
        <ScreenHeader mode="back" title={getFilterTitle(filter)} />
        <StateView
          title={error}
          tone="error"
          actionLabel="Try again"
          onAction={() => void loadActivity()}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top"]} style={styles.screen}>
      <ScreenHeader mode="back" title={getFilterTitle(filter)} />

      <FlatList
        data={visibleItems}
        keyExtractor={(item) => `${item.type}-${item._id}`}
        renderItem={({ item }) => <MemoryCard memory={item} />}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.primary}
            colors={[colors.primary]}
            onRefresh={() => void loadActivity({ refresh: true })}
          />
        }
        ListHeaderComponent={
          <View style={styles.headerCard}>
            <View>
              <Text style={styles.eyebrow}>{filteredItems.length} items</Text>
              <Text style={styles.title}>{getFilterTitle(filter)}</Text>
              <Text style={styles.subtitle}>{getFilterSubtitle(filter)}</Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <Ionicons color={colors.textSoft} name="file-tray-outline" size={24} />
            <Text style={styles.emptyTitle}>Nothing here yet</Text>
            <Text style={styles.emptyText}>
              New {filter === "tasks" ? "tasks" : "notes"} will show up here as you capture them.
            </Text>
          </View>
        }
        ListFooterComponent={
          filteredItems.length ? (
            <View style={styles.footer}>
              {hasMore ? (
                <Pressable style={styles.loadMoreButton} onPress={loadMore}>
                  <Text style={styles.loadMoreText}>Load more</Text>
                </Pressable>
              ) : (
                <Text style={styles.endText}>End of list</Text>
              )}
            </View>
          ) : null
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: 18,
    paddingBottom: 28,
  },
  headerCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 16,
    padding: 16,
  },
  eyebrow: {
    color: colors.textSoft,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  title: {
    color: colors.text,
    fontSize: 26,
    fontWeight: "900",
    lineHeight: 31,
    marginTop: 6,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 21,
    marginTop: 6,
  },
  emptyCard: {
    alignItems: "center",
    backgroundColor: colors.backgroundSoft,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    padding: 24,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900",
    marginTop: 10,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 21,
    marginTop: 6,
    textAlign: "center",
  },
  footer: {
    alignItems: "center",
    paddingVertical: 10,
  },
  loadMoreButton: {
    backgroundColor: colors.text,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  loadMoreText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: "900",
  },
  endText: {
    color: colors.textSoft,
    fontSize: 12,
    fontWeight: "800",
  },
});
