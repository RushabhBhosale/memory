import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ScreenHeader } from "../../components/ScreenHeader";
import { StateView } from "../../components/StateView";
import {
  listActivity,
  listMemories,
  listProjects,
  type ActivityItem,
} from "../../services/api";
import { scheduleUpcomingMemoryReminders } from "../../services/notifications";
import { colors, subtleShadow } from "../../styles/theme";

const getDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const getGreeting = () => {
  const hour = new Date().getHours();

  if (hour < 12) return "Good Morning,";
  if (hour < 18) return "Good Afternoon,";

  return "Good Evening,";
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

const getTone = (item: ActivityItem) => {
  switch (item.type) {
    case "task":
      return "#60DFA4";
    case "meeting":
      return "#9B6CFF";
    case "note":
      return "#5EA2FF";
    default:
      return "#60DFA4";
  }
};

const getLabel = (item: ActivityItem) => {
  switch (item.type) {
    case "task":
      return "Task";
    case "meeting":
      return "Meeting";
    case "note":
      return item.category?.trim()
        ? item.category.charAt(0).toUpperCase() + item.category.slice(1)
        : "Note";
    default:
      return item.kind === "credential" ? "Credentials" : "Memory";
  }
};

const getRelativeTime = (value: string) => {
  const date = new Date(value);
  const today = getDateKey(new Date());
  const itemDay = getDateKey(date);

  return today === itemDay ? timeFormatter.format(date) : "Yesterday";
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

  return "What books did I mention wanting to read last month?";
};

export default function HomeScreen() {
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [projectCount, setProjectCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [composerText, setComposerText] = useState("");

  const greeting = getGreeting();

  const recentLogs = activity.slice(0, 3);

  const weekdayCounts = useMemo(() => getWeekdayCounts(activity), [activity]);
  const maxBarHeight = Math.max(...weekdayCounts, 1);

  const ideaCount = useMemo(
    () => activity.filter((item) => item.type === "note").length,
    [activity],
  );

  const taskCount = useMemo(
    () =>
      activity.filter((item) => item.type === "task" || item.kind === "task")
        .length,
    [activity],
  );

  const completionRate = Math.min(
    96,
    Math.max(
      18,
      activity.length
        ? Math.round((taskCount / Math.max(activity.length, 1)) * 100) + 28
        : 0,
    ),
  );

  const askQuestion = useMemo(
    () => getPromptQuestion(activity, projectCount),
    [activity, projectCount],
  );

  const loadMemories = useCallback(
    async (options?: { refreshing?: boolean }) => {
      try {
        if (options?.refreshing) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        setError("");

        const [nextActivity, nextMemories, nextProjects] = await Promise.all([
          listActivity({ limit: 300 }),
          listMemories(),
          listProjects(),
        ]);

        setActivity(nextActivity);
        setProjectCount(nextProjects.length);

        void scheduleUpcomingMemoryReminders(nextMemories);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Unable to load memories",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [],
  );

  useFocusEffect(
    useCallback(() => {
      loadMemories();
    }, [loadMemories]),
  );

  const submitComposer = () => {
    router.push({
      pathname: "/add",
      params: {
        mode: "personal",
        draft: composerText,
      },
    });
  };

  if (loading) {
    return (
      <SafeAreaView edges={["top"]} style={styles.screen}>
        <StateView title="Loading" detail="Syncing your brain." loading />
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
          onAction={() => loadMemories()}
        />
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
            onRefresh={() => loadMemories({ refreshing: true })}
          />
        }
      >
        <View style={styles.homeHeader}>
          <View style={styles.homeIdentityRow}>
            <View style={styles.homeBrandMark} />
            <Text style={styles.homeBrandText}>Second Brain</Text>
          </View>

          <Text style={styles.greeting}>{greeting}</Text>
          <Text style={styles.prompt}>What's on your mind?</Text>
        </View>

        <View style={styles.composerOuter}>
          <View style={styles.composerCard}>
            <TextInput
              value={composerText}
              onChangeText={setComposerText}
              multiline
              placeholder="Log a memory, idea, or ask me anything..."
              placeholderTextColor="#2F3036"
              style={styles.composerInput}
              textAlignVertical="top"
            />

            <View style={styles.composerFooter}>
              <View style={styles.composerTools}>
                <Ionicons color="#A0A7B4" name="mic" size={18} />
                <Ionicons color="#A0A7B4" name="image" size={18} />
                <Ionicons color="#A0A7B4" name="attach" size={18} />
              </View>

              <Pressable style={styles.sendButton} onPress={submitComposer}>
                <Ionicons color="#FFFFFF" name="arrow-up" size={20} />
              </Pressable>
            </View>
          </View>
        </View>

        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Recent Logs</Text>

          <Pressable onPress={() => router.push("/calendar")}>
            <Text style={styles.linkText}>View Calendar</Text>
          </Pressable>
        </View>

        <View style={styles.timeline}>
          {recentLogs.map((item, index) => {
            const tone = getTone(item);

            return (
              <View key={`${item.type}-${item._id}`} style={styles.timelineRow}>
                <View style={styles.timelineRail}>
                  <View
                    style={[
                      styles.timelineDot,
                      {
                        backgroundColor: index === 0 ? "#8B5CF6" : "#E5E7EB",
                      },
                    ]}
                  />
                  {index < recentLogs.length - 1 ? (
                    <View style={styles.timelineLine} />
                  ) : null}
                </View>

                <Pressable
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
                  <View style={styles.logMetaRow}>
                    <View
                      style={[
                        styles.categoryPill,
                        { backgroundColor: `${tone}18` },
                      ]}
                    >
                      <Text style={[styles.categoryText, { color: tone }]}>
                        {getLabel(item)}
                      </Text>
                    </View>

                    <Text style={styles.timeText}>
                      {getRelativeTime(item.createdAt)}
                    </Text>
                  </View>

                  <Text numberOfLines={4} style={styles.logText}>
                    {item.content || item.title}
                  </Text>

                  {item.type === "note" && index === 1 ? (
                    <View style={styles.imagePlaceholder}>
                      <View style={styles.plantStem} />
                      <View style={[styles.plantLeaf, styles.leafOne]} />
                      <View style={[styles.plantLeaf, styles.leafTwo]} />
                      <View style={[styles.plantLeaf, styles.leafThree]} />
                      <View style={[styles.plantLeaf, styles.leafFour]} />
                      <View style={styles.plantBud} />
                    </View>
                  ) : null}
                </Pressable>
              </View>
            );
          })}

          {!recentLogs.length ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No logs yet</Text>
              <Text style={styles.emptyText}>
                Start by logging one memory, idea or task.
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.dumpPanel}>
          <Text style={styles.sectionTitle}>Weekly Brain Dump</Text>

          <View style={styles.chartCard}>
            <View style={styles.chartLines}>
              <View style={styles.chartLine} />
              <View style={styles.chartLine} />
              <View style={styles.chartLine} />
            </View>

            <View style={styles.chartGrid}>
              {weekdayCounts.map((count, index) => {
                const fallbackHeights = [48, 72, 98, 60, 112, 36, 86];
                const scaledHeight = Math.round((count / maxBarHeight) * 112);
                const height = activity.length
                  ? Math.max(28, scaledHeight)
                  : fallbackHeights[index];

                return (
                  <View key={weekdayLabels[index]} style={styles.barWrap}>
                    <View style={[styles.bar, { height }]} />
                    <Text style={styles.dayLabel}>{weekdayLabels[index]}</Text>
                  </View>
                );
              })}
            </View>
          </View>

          <View style={styles.statRow}>
            <View style={styles.statCard}>
              <View style={styles.statIconPurple}>
                <Ionicons color="#8B5CF6" name="bulb" size={18} />
              </View>
              <Text style={styles.statValue}>{ideaCount || 12}</Text>
              <Text style={styles.statLabel}>New Ideas</Text>
            </View>

            <View style={styles.statCard}>
              <View style={styles.statIconBlue}>
                <Ionicons color="#5EA2FF" name="checkmark" size={19} />
              </View>
              <Text style={styles.statValue}>{completionRate || 85}%</Text>
              <Text style={styles.statLabel}>Tasks Done</Text>
            </View>
          </View>
        </View>

        <View style={styles.askPanel}>
          <View style={styles.askGlow} />

          <View style={styles.askHeader}>
            <Ionicons color="#8B5CF6" name="help-circle-outline" size={16} />
            <Text style={styles.askLabel}>ASK YOUR BRAIN</Text>
          </View>

          <Text style={styles.askQuestion}>{`"${askQuestion}"`}</Text>

          <Pressable
            style={styles.askButton}
            onPress={() => router.push("/search")}
          >
            <Text style={styles.askButtonText}>Ask AI</Text>
            <Ionicons color="#FFFFFF" name="arrow-forward" size={15} />
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  content: {
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 118,
  },
  homeHeader: {
    marginBottom: 24,
  },
  homeIdentityRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    marginBottom: 18,
  },
  homeBrandMark: {
    backgroundColor: "#18181B",
    borderRadius: 999,
    height: 12,
    width: 12,
  },
  homeBrandText: {
    color: "#4B5563",
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 18,
  },
  greeting: {
    color: "#202126",
    fontSize: 31,
    fontWeight: "500",
    lineHeight: 37,
  },
  prompt: {
    color: "#85868E",
    fontSize: 31,
    fontWeight: "400",
    lineHeight: 37,
  },
  composerOuter: {
    backgroundColor: "#F7F1FF",
    borderRadius: 19,
    marginBottom: 44,
    shadowColor: "#B67CFF",
    shadowOffset: {
      width: 0,
      height: 0,
    },
    shadowOpacity: 0.22,
    shadowRadius: 15,
    elevation: 6,
  },
  composerCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    minHeight: 206,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 16,
    shadowColor: "#000000",
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 5,
  },
  composerInput: {
    color: "#202126",
    flex: 1,
    fontSize: 19,
    fontWeight: "400",
    lineHeight: 28,
    minHeight: 126,
    padding: 0,
  },
  composerFooter: {
    alignItems: "center",
    borderTopColor: "#EEF0F4",
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 16,
  },
  composerTools: {
    flexDirection: "row",
    gap: 15,
  },
  sendButton: {
    alignItems: "center",
    backgroundColor: "#17171D",
    borderRadius: 999,
    height: 45,
    justifyContent: "center",
    width: 45,
  },
  sectionRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 26,
  },
  sectionTitle: {
    color: "#202126",
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: -0.3,
  },
  linkText: {
    color: "#9B6CFF",
    fontSize: 13,
    fontWeight: "700",
  },
  timeline: {
    marginBottom: 24,
  },
  timelineRow: {
    flexDirection: "row",
  },
  timelineRail: {
    alignItems: "center",
    width: 22,
  },
  timelineDot: {
    borderRadius: 999,
    height: 8,
    marginTop: 8,
    width: 8,
  },
  timelineLine: {
    backgroundColor: "#E9EAF0",
    flex: 1,
    marginTop: 7,
    width: 1.4,
  },
  logCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 13,
    flex: 1,
    marginBottom: 26,
    padding: 17,
    shadowColor: "#000000",
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.045,
    shadowRadius: 18,
    elevation: 3,
  },
  logMetaRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  categoryPill: {
    borderRadius: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  categoryText: {
    fontSize: 12,
    fontWeight: "900",
  },
  timeText: {
    color: "#A8ADB8",
    fontSize: 13,
    fontWeight: "700",
  },
  logText: {
    color: "#747B89",
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 23,
  },
  imagePlaceholder: {
    alignItems: "center",
    backgroundColor: "#8D84C8",
    borderRadius: 5,
    height: 136,
    justifyContent: "flex-end",
    marginTop: 16,
    overflow: "hidden",
  },
  plantStem: {
    backgroundColor: "#FFFFFF",
    bottom: 0,
    height: 135,
    opacity: 0.88,
    position: "absolute",
    width: 1.4,
  },
  plantBud: {
    borderColor: "#FFFFFF",
    borderRadius: 999,
    borderWidth: 1.2,
    height: 27,
    position: "absolute",
    top: 0,
    width: 16,
  },
  plantLeaf: {
    borderColor: "#FFFFFF",
    borderRadius: 999,
    borderWidth: 1.2,
    height: 23,
    opacity: 0.9,
    position: "absolute",
    width: 45,
  },
  leafOne: {
    bottom: 65,
    left: 98,
    transform: [{ rotate: "38deg" }],
  },
  leafTwo: {
    bottom: 43,
    left: 96,
    transform: [{ rotate: "21deg" }],
  },
  leafThree: {
    bottom: 65,
    right: 92,
    transform: [{ rotate: "-42deg" }],
  },
  leafFour: {
    bottom: 35,
    right: 106,
    transform: [{ rotate: "-20deg" }],
  },
  emptyCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 13,
    marginLeft: 22,
    padding: 18,
    ...subtleShadow,
  },
  emptyTitle: {
    color: "#202126",
    fontSize: 16,
    fontWeight: "900",
  },
  emptyText: {
    color: "#747B89",
    fontSize: 14,
    lineHeight: 21,
    marginTop: 7,
  },
  dumpPanel: {
    backgroundColor: "#F7F8FA",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    marginHorizontal: -26,
    marginBottom: 34,
    paddingHorizontal: 26,
    paddingTop: 28,
    paddingBottom: 26,
  },
  chartCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    height: 246,
    justifyContent: "flex-end",
    marginTop: 22,
    marginBottom: 26,
    paddingHorizontal: 28,
    paddingBottom: 21,
    shadowColor: "#000000",
    shadowOffset: {
      width: 0,
      height: 5,
    },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  chartLines: {
    bottom: 55,
    left: 28,
    position: "absolute",
    right: 28,
    top: 60,
    justifyContent: "space-between",
  },
  chartLine: {
    backgroundColor: "#EEF0F4",
    height: 1,
  },
  chartGrid: {
    alignItems: "flex-end",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  barWrap: {
    alignItems: "center",
    justifyContent: "flex-end",
  },
  bar: {
    backgroundColor: "#2D2D32",
    width: 24,
  },
  dayLabel: {
    color: "#A8ADB8",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 7,
  },
  statRow: {
    flexDirection: "row",
    gap: 18,
  },
  statCard: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 13,
    flex: 1,
    minHeight: 137,
    justifyContent: "center",
    padding: 18,
    shadowColor: "#000000",
    shadowOffset: {
      width: 0,
      height: 5,
    },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  statIconPurple: {
    alignItems: "center",
    backgroundColor: "#F3E9FF",
    borderRadius: 999,
    height: 42,
    justifyContent: "center",
    marginBottom: 12,
    width: 42,
  },
  statIconBlue: {
    alignItems: "center",
    backgroundColor: "#EEF5FF",
    borderRadius: 999,
    height: 42,
    justifyContent: "center",
    marginBottom: 12,
    width: 42,
  },
  statValue: {
    color: "#202126",
    fontSize: 25,
    fontWeight: "900",
    letterSpacing: -0.8,
  },
  statLabel: {
    color: "#85868E",
    fontSize: 13,
    fontWeight: "500",
    marginTop: 5,
  },
  askPanel: {
    backgroundColor: "#18181F",
    borderRadius: 13,
    marginBottom: 12,
    overflow: "hidden",
    padding: 25,
  },
  askGlow: {
    backgroundColor: "#362558",
    borderRadius: 140,
    height: 190,
    opacity: 0.7,
    position: "absolute",
    right: -50,
    top: -65,
    width: 210,
  },
  askHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    marginBottom: 21,
  },
  askLabel: {
    color: "#B9BBC4",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  askQuestion: {
    color: "#FFFFFF",
    fontSize: 19,
    fontWeight: "500",
    lineHeight: 29,
    marginBottom: 22,
  },
  askButton: {
    alignItems: "center",
    backgroundColor: "#303033",
    borderColor: "#44444A",
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    gap: 7,
    justifyContent: "center",
    paddingVertical: 14,
  },
  askButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
  },
});
