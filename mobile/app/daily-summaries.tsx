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

import { ScreenHeader } from "../components/ScreenHeader";
import { listDailySummaries, type DailySummary } from "../services/api";
import { colors } from "../styles/theme";

const formatDate = (date: string) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: "full",
  }).format(new Date(`${date}T00:00:00`));

const unique = (values: string[]) =>
  Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort();

export default function DailySummariesScreen() {
  const [summaries, setSummaries] = useState<DailySummary[]>([]);
  const [query, setQuery] = useState("");
  const [project, setProject] = useState("");
  const [tag, setTag] = useState("");
  const [source, setSource] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadSummaries = useCallback(async (options?: { refreshing?: boolean }) => {
    try {
      if (options?.refreshing) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError("");
      setSummaries(await listDailySummaries({ limit: 300 }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load daily summaries");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadSummaries();
    }, [loadSummaries]),
  );

  const projects = useMemo(() => unique(summaries.flatMap((item) => item.projects)), [summaries]);
  const tags = useMemo(() => unique(summaries.flatMap((item) => item.tags)), [summaries]);
  const sources = useMemo(() => unique(summaries.map((item) => item.source)), [summaries]);

  const filteredSummaries = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return summaries.filter((item) => {
      const searchText = [
        item.title,
        item.summary,
        item.bodyMarkdown,
        ...item.projects,
        ...item.tags,
        ...item.keyQuestions,
        ...item.decisions,
        ...item.topics.flatMap((topic) => [topic.title, topic.summary, topic.project, ...topic.tags]),
        ...item.tasks.flatMap((task) => [task.task, task.project, task.status]),
      ]
        .join(" ")
        .toLowerCase();

      return (
        (!normalizedQuery || searchText.includes(normalizedQuery)) &&
        (!project || item.projects.includes(project)) &&
        (!tag || item.tags.includes(tag)) &&
        (!source || item.source === source) &&
        (!from || item.date >= from) &&
        (!to || item.date <= to)
      );
    });
  }, [from, project, query, source, summaries, tag, to]);

  const clearFilters = () => {
    setQuery("");
    setProject("");
    setTag("");
    setSource("");
    setFrom("");
    setTo("");
  };

  return (
    <SafeAreaView edges={["top"]} style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            colors={[colors.primary]}
            refreshing={refreshing}
            tintColor={colors.primary}
            onRefresh={() => void loadSummaries({ refreshing: true })}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader mode="back" title="Daily Summaries" />

        <View style={styles.heroPanel}>
          <Text style={styles.heroTitle}>ChatGPT daily history</Text>
          <Text style={styles.heroText}>
            Browse saved daily summaries by project, tag, source, and date.
          </Text>
        </View>

        <View style={styles.searchPanel}>
          <View style={styles.searchBox}>
            <Ionicons color={colors.textSoft} name="search-outline" size={18} />
            <TextInput
              placeholder="Search summaries, tasks, questions..."
              placeholderTextColor={colors.textSoft}
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
            />
          </View>

          <View style={styles.dateRow}>
            <TextInput
              placeholder="From YYYY-MM-DD"
              placeholderTextColor={colors.textSoft}
              style={styles.dateInput}
              value={from}
              onChangeText={setFrom}
            />
            <TextInput
              placeholder="To YYYY-MM-DD"
              placeholderTextColor={colors.textSoft}
              style={styles.dateInput}
              value={to}
              onChangeText={setTo}
            />
          </View>

          <FilterRow label="Projects" options={projects} value={project} onChange={setProject} />
          <FilterRow label="Tags" options={tags} value={tag} onChange={setTag} />
          <FilterRow label="Sources" options={sources} value={source} onChange={setSource} />

          {query || project || tag || source || from || to ? (
            <Pressable style={styles.clearButton} onPress={clearFilters}>
              <Text style={styles.clearButtonText}>Clear filters</Text>
            </Pressable>
          ) : null}
        </View>

        {loading ? (
          <View style={styles.statePanel}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.stateText}>Loading daily summaries...</Text>
          </View>
        ) : error ? (
          <View style={styles.statePanel}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable style={styles.retryButton} onPress={() => void loadSummaries()}>
              <Text style={styles.retryButtonText}>Try again</Text>
            </Pressable>
          </View>
        ) : filteredSummaries.length ? (
          <>
            <Text style={styles.resultCount}>
              {filteredSummaries.length} summar{filteredSummaries.length === 1 ? "y" : "ies"}
            </Text>
            {filteredSummaries.map((summary) => (
              <SummaryCard key={summary._id} summary={summary} />
            ))}
          </>
        ) : (
          <View style={styles.statePanel}>
            <Ionicons color={colors.textSoft} name="calendar-clear-outline" size={24} />
            <Text style={styles.stateTitle}>No daily summaries yet</Text>
            <Text style={styles.stateText}>
              ChatGPT Scheduled Tasks can save one summary per day through the API.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function FilterRow({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: string[];
  value: string;
}) {
  if (!options.length) {
    return null;
  }

  return (
    <View style={styles.filterBlock}>
      <Text style={styles.filterLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.chipRow}>
          <Pressable
            style={[styles.chip, !value && styles.chipSelected]}
            onPress={() => onChange("")}
          >
            <Text style={[styles.chipText, !value && styles.chipTextSelected]}>All</Text>
          </Pressable>
          {options.map((option) => {
            const selected = value === option;

            return (
              <Pressable
                key={option}
                style={[styles.chip, selected && styles.chipSelected]}
                onPress={() => onChange(selected ? "" : option)}
              >
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                  {option}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

function SummaryCard({ summary }: { summary: DailySummary }) {
  return (
    <Pressable
      style={styles.summaryCard}
      onPress={() =>
        router.push({
          pathname: "/daily-summaries/[date]",
          params: { date: summary.date },
        })
      }
    >
      <Text style={styles.cardDate}>{formatDate(summary.date)}</Text>
      <Text style={styles.cardTitle}>{summary.title}</Text>
      <Text numberOfLines={3} style={styles.cardSummary}>
        {summary.summary || summary.bodyMarkdown || "No overview saved."}
      </Text>

      <View style={styles.metricRow}>
        <Text style={styles.metricText}>{summary.topics.length} topics</Text>
        <Text style={styles.metricText}>{summary.tasks.length} tasks</Text>
      </View>

      <View style={styles.tagRow}>
        {summary.projects.slice(0, 3).map((project) => (
          <Text key={project} style={styles.projectPill}>
            {project}
          </Text>
        ))}
        {summary.tags.slice(0, 3).map((tag) => (
          <Text key={tag} style={styles.tagPill}>
            #{tag}
          </Text>
        ))}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cardDate: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "900",
    marginBottom: 6,
  },
  cardSummary: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 21,
    marginTop: 8,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900",
    lineHeight: 23,
  },
  chip: {
    backgroundColor: colors.backgroundSoft,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipRow: {
    flexDirection: "row",
    gap: 8,
    paddingRight: 2,
  },
  chipSelected: {
    backgroundColor: colors.text,
    borderColor: colors.text,
  },
  chipText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "800",
  },
  chipTextSelected: {
    color: colors.white,
  },
  clearButton: {
    alignItems: "center",
    paddingTop: 6,
  },
  clearButtonText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "900",
  },
  content: {
    paddingBottom: 34,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  dateInput: {
    backgroundColor: colors.backgroundSoft,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    color: colors.text,
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
    minHeight: 44,
    paddingHorizontal: 12,
  },
  dateRow: {
    flexDirection: "row",
    gap: 10,
  },
  errorText: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: "800",
    textAlign: "center",
  },
  filterBlock: {
    gap: 8,
  },
  filterLabel: {
    color: colors.textSoft,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  heroPanel: {
    backgroundColor: colors.text,
    borderRadius: 18,
    marginBottom: 14,
    padding: 18,
  },
  heroText: {
    color: "rgba(255,255,255,0.68)",
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 21,
    marginTop: 7,
  },
  heroTitle: {
    color: colors.white,
    fontSize: 24,
    fontWeight: "900",
    lineHeight: 29,
  },
  metricRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  metricText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "900",
  },
  projectPill: {
    backgroundColor: colors.accentSurface,
    borderRadius: 999,
    color: colors.primary,
    fontSize: 11,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  resultCount: {
    color: colors.textSoft,
    fontSize: 12,
    fontWeight: "900",
    marginBottom: 10,
    textTransform: "uppercase",
  },
  retryButton: {
    backgroundColor: colors.text,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  retryButtonText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: "900",
  },
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  searchBox: {
    alignItems: "center",
    backgroundColor: colors.backgroundSoft,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 12,
  },
  searchInput: {
    color: colors.text,
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
  },
  searchPanel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    gap: 14,
    marginBottom: 18,
    padding: 14,
  },
  statePanel: {
    alignItems: "center",
    backgroundColor: colors.backgroundSoft,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    gap: 10,
    padding: 24,
  },
  stateText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
    textAlign: "center",
  },
  stateTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900",
  },
  summaryCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 12,
    padding: 15,
  },
  tagPill: {
    backgroundColor: colors.backgroundSoft,
    borderRadius: 999,
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    marginTop: 12,
  },
});
