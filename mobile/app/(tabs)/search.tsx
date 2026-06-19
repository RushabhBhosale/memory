import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { MemoryCard } from "../../components/MemoryCard";
import { ScreenHeader } from "../../components/ScreenHeader";
import { StateView } from "../../components/StateView";
import { searchActivity, type ActivityItem } from "../../services/api";
import { colors, subtleShadow } from "../../styles/theme";

const filters = ["All", "Notes", "Meetings", "Tasks"];
const recentSearches = [
  "marketing strategy",
  "plant watering app",
  "running goals",
];
const suggestions = [
  {
    icon: "sparkles-outline",
    title: "Show me all my creative ideas from this month",
    detail: "Find patterns in your creative thinking",
    tone: colors.primary,
  },
  {
    icon: "analytics-outline",
    title: "What were my productivity patterns last week?",
    detail: "Analyze your work habits and energy levels",
    tone: colors.secondary,
  },
  {
    icon: "bulb-outline",
    title: "Find connections between my health and mood logs",
    detail: "Discover insights about your wellbeing",
    tone: colors.projectTag,
  },
] as const;

const matchesFilter = (item: ActivityItem, filter: string) => {
  if (filter === "All") {
    return true;
  }

  if (filter === "Notes") {
    return item.type === "note";
  }

  if (filter === "Meetings") {
    return item.type === "meeting";
  }

  if (filter === "Tasks") {
    return item.type === "task" || item.kind === "task";
  }

  return true;
};

export default function SearchScreen() {
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("All");
  const [results, setResults] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");

  const runSearch = async (
    value = query,
    options?: { refreshing?: boolean },
  ) => {
    const nextQuery = value.trim();

    if (!nextQuery) {
      setResults([]);
      setSearched(false);
      setError("");
      return;
    }

    try {
      if (options?.refreshing) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError("");
      setSearched(true);
      setQuery(nextQuery);
      setResults(await searchActivity(nextQuery));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to search activity",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const refreshSearch = () => {
    if (searched && query.trim()) {
      runSearch(query, { refreshing: true });
    }
  };

  const showResults = searched || loading || error;
  const filteredResults = results.filter((item) =>
    matchesFilter(item, activeFilter),
  );

  return (
    <SafeAreaView edges={["top"]} style={styles.screen}>
      <ScreenHeader mode="back" title="Search" />

      <View style={styles.searchPanel}>
        <Ionicons color={colors.primary} name="search" size={21} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => runSearch()}
          placeholder="Search your memories..."
          placeholderTextColor={colors.textMuted}
          returnKeyType="search"
          style={styles.searchInput}
        />
        <Ionicons color={colors.textSoft} name="mic" size={19} />
      </View>

      <View style={styles.filterRow}>
        {filters.map((filter) => {
          const selected = filter === activeFilter;

          return (
            <Pressable
              key={filter}
              style={[styles.filterChip, selected && styles.selectedFilterChip]}
              onPress={() => setActiveFilter(filter)}
            >
              <Text
                style={[
                  styles.filterText,
                  selected && styles.selectedFilterText,
                ]}
              >
                {filter}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {showResults ? (
        loading ? (
          <StateView
            title="Searching"
            detail="Checking saved context."
            loading
          />
        ) : error ? (
          <StateView title={error} tone="error" />
        ) : (
          <FlatList
            data={filteredResults}
            keyExtractor={(item) => `${item.type}-${item._id}`}
            contentContainerStyle={
              filteredResults.length ? styles.resultList : styles.emptyList
            }
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                tintColor={colors.primary}
                colors={[colors.primary]}
                onRefresh={refreshSearch}
              />
            }
            ListHeaderComponent={
              filteredResults.length ? (
                <View style={styles.resultHeader}>
                  <Text style={styles.sectionTitle}>Results</Text>
                  <Text style={styles.resultCount}>
                    {filteredResults.length}
                  </Text>
                </View>
              ) : null
            }
            ListEmptyComponent={
              <StateView
                title="No matches found"
                detail="Try a shorter phrase or a nearby word."
              />
            }
            renderItem={({ item }) => <MemoryCard memory={item} />}
          />
        )
      ) : (
        <>
          <Text style={styles.sectionTitle}>Recent Searches</Text>
          <View style={styles.recentList}>
            {recentSearches.map((item) => (
              <Pressable
                key={item}
                style={styles.recentRow}
                onPress={() => runSearch(item)}
              >
                <View style={styles.recentLeft}>
                  <Ionicons color={colors.textSoft} name="refresh" size={17} />
                  <Text style={styles.recentText}>{item}</Text>
                </View>
                <Ionicons
                  color={colors.borderStrong}
                  name="open-outline"
                  size={15}
                />
              </Pressable>
            ))}
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 22,
  },
  searchPanel: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    ...subtleShadow,
  },
  searchInput: {
    color: colors.text,
    flex: 1,
    fontSize: 18,
    fontWeight: "600",
    padding: 0,
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 24,
  },
  filterChip: {
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 17,
    paddingVertical: 10,
  },
  selectedFilterChip: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: "700",
  },
  selectedFilterText: {
    color: colors.white,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 14,
  },
  recentList: {
    marginBottom: 38,
  },
  recentRow: {
    alignItems: "center",
    backgroundColor: colors.backgroundSoft,
    borderRadius: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
    paddingHorizontal: 13,
    paddingVertical: 13,
  },
  recentLeft: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
  },
  recentText: {
    color: colors.textMuted,
    fontSize: 15,
    fontWeight: "700",
  },
  aiTitle: {
    marginBottom: 16,
  },
  suggestionList: {
    paddingBottom: 112,
  },
  aiCard: {
    alignItems: "flex-start",
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    marginBottom: 13,
    padding: 16,
  },
  aiCopy: {
    flex: 1,
  },
  aiCardTitle: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: "900",
    lineHeight: 20,
    marginBottom: 8,
  },
  aiCardDetail: {
    color: colors.textSoft,
    fontSize: 13,
    fontWeight: "700",
  },
  resultList: {
    paddingBottom: 112,
  },
  emptyList: {
    flexGrow: 1,
    paddingBottom: 112,
  },
  resultHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  resultCount: {
    color: colors.textSoft,
    fontSize: 13,
    fontWeight: "900",
  },
});
