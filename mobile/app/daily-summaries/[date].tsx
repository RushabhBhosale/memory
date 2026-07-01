import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ScreenHeader } from "../../components/ScreenHeader";
import { getDailySummary, type DailySummary } from "../../services/api";
import { colors } from "../../styles/theme";

const getParam = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value || "";

const formatDate = (date: string) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: "full",
  }).format(new Date(`${date}T00:00:00`));

export default function DailySummaryDetailScreen() {
  const params = useLocalSearchParams<{ date?: string }>();
  const date = getParam(params.date);
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadSummary = useCallback(async () => {
    if (!date) {
      setError("Daily summary date is missing");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError("");
      setSummary(await getDailySummary(date));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load daily summary");
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  if (loading) {
    return (
      <SafeAreaView edges={["top"]} style={styles.screen}>
        <View style={styles.centerState}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.mutedText}>Loading daily summary...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error && !summary) {
    return (
      <SafeAreaView edges={["top"]} style={styles.screen}>
        <ScreenHeader mode="back" title="Daily Summary" />
        <View style={styles.centerState}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.retryButton} onPress={() => void loadSummary()}>
            <Text style={styles.retryButtonText}>Try again</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (!summary) {
    return (
      <SafeAreaView edges={["top"]} style={styles.screen}>
        <ScreenHeader mode="back" title="Daily Summary" />
        <View style={styles.centerState}>
          <Text style={styles.mutedText}>Daily summary not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top"]} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenHeader mode="back" title="Daily Summary" />

        <View style={styles.headerPanel}>
          <Text style={styles.dateText}>{formatDate(summary.date)}</Text>
          <Text style={styles.title}>{summary.title}</Text>
          <Text style={styles.sourceText}>{summary.source}</Text>
        </View>

        <Section title="Overview">
          <Text style={styles.bodyText}>{summary.summary || "No overview saved."}</Text>
        </Section>

        {summary.bodyMarkdown ? (
          <Section title="Full Summary">
            <Text style={styles.markdownText}>{summary.bodyMarkdown}</Text>
          </Section>
        ) : null}

        <Section title={`Topics (${summary.topics.length})`}>
          {summary.topics.length ? (
            summary.topics.map((topic, index) => (
              <View key={`${topic.title}-${index}`} style={styles.itemBox}>
                <View style={styles.itemHeader}>
                  <Text style={styles.itemTitle}>{topic.title || "Untitled topic"}</Text>
                  {topic.status ? <Text style={styles.statusPill}>{topic.status}</Text> : null}
                </View>
                {topic.project ? <Text style={styles.itemMeta}>{topic.project}</Text> : null}
                {topic.summary ? <Text style={styles.itemText}>{topic.summary}</Text> : null}
                <TagRow tags={topic.tags} />
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>No topics saved.</Text>
          )}
        </Section>

        <BulletSection title="Key Questions" items={summary.keyQuestions} icon="help-circle-outline" />

        <Section title={`Tasks (${summary.tasks.length})`}>
          {summary.tasks.length ? (
            summary.tasks.map((task, index) => (
              <View key={`${task.task}-${index}`} style={styles.itemBox}>
                <View style={styles.itemHeader}>
                  <Text style={styles.itemTitle}>{task.task}</Text>
                  {task.status ? <Text style={styles.statusPill}>{task.status}</Text> : null}
                </View>
                {task.project ? <Text style={styles.itemMeta}>{task.project}</Text> : null}
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>No tasks saved.</Text>
          )}
        </Section>

        <BulletSection title="Decisions" items={summary.decisions} icon="checkmark-done-outline" />

        <Section title="Projects">
          <TagRow tags={summary.projects} tone="project" />
        </Section>

        <Section title="Tags">
          <TagRow tags={summary.tags} />
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ children, title }: { children: ReactNode; title: string }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function BulletSection({
  icon,
  items,
  title,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  items: string[];
  title: string;
}) {
  return (
    <Section title={title}>
      {items.length ? (
        items.map((item, index) => (
          <View key={`${item}-${index}`} style={styles.bulletRow}>
            <Ionicons color={colors.primary} name={icon} size={17} />
            <Text style={styles.bulletText}>{item}</Text>
          </View>
        ))
      ) : (
        <Text style={styles.emptyText}>Nothing saved here.</Text>
      )}
    </Section>
  );
}

function TagRow({ tags, tone }: { tags: string[]; tone?: "project" }) {
  if (!tags.length) {
    return <Text style={styles.emptyText}>None</Text>;
  }

  return (
    <View style={styles.tagRow}>
      {tags.map((tag) => (
        <Text key={tag} style={tone === "project" ? styles.projectPill : styles.tagPill}>
          {tone === "project" ? tag : `#${tag}`}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bodyText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 23,
  },
  bulletRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 9,
    marginBottom: 10,
  },
  bulletText: {
    color: colors.text,
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 21,
  },
  centerState: {
    alignItems: "center",
    flex: 1,
    gap: 12,
    justifyContent: "center",
    padding: 20,
  },
  content: {
    paddingBottom: 36,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  dateText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  emptyText: {
    color: colors.textSoft,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 19,
  },
  errorText: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: "800",
    textAlign: "center",
  },
  headerPanel: {
    alignItems: "center",
    marginBottom: 18,
    paddingHorizontal: 4,
  },
  itemBox: {
    backgroundColor: colors.backgroundSoft,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
    padding: 13,
  },
  itemHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
  },
  itemMeta: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "900",
    marginTop: 5,
  },
  itemText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 21,
    marginTop: 8,
  },
  itemTitle: {
    color: colors.text,
    flex: 1,
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 20,
  },
  markdownText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 22,
  },
  mutedText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: "800",
  },
  projectPill: {
    backgroundColor: colors.accentSurface,
    borderRadius: 999,
    color: colors.primary,
    fontSize: 12,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 7,
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
  section: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 14,
    padding: 15,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900",
    marginBottom: 12,
  },
  sourceText: {
    color: colors.textSoft,
    fontSize: 12,
    fontWeight: "900",
    marginTop: 10,
  },
  statusPill: {
    backgroundColor: colors.successSurface,
    borderRadius: 999,
    color: colors.success,
    fontSize: 11,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  tagPill: {
    backgroundColor: colors.backgroundSoft,
    borderRadius: 999,
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    marginTop: 10,
  },
  title: {
    color: colors.text,
    fontSize: 30,
    fontWeight: "900",
    lineHeight: 36,
    marginTop: 10,
    textAlign: "center",
  },
});
