import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { StateView } from "../components/StateView";
import {
  filterUsageItemsToWindow,
  formatUsageDuration,
  getAppUsageStats,
  getThisMonthRange,
  getThisWeekRange,
  getTodayRange,
  hasUsageAccessPermission,
  openUsageAccessSettings,
  type AppUsageItem,
} from "../services/appUsage";
import { colors, subtleShadow } from "../styles/theme";
import { readAppUsageCache, writeAppUsageCache } from "../utils/appUsageCache";

type PeriodKey = "today" | "week" | "month";

const getTotalTimeMs = (items: AppUsageItem[]) =>
  items.reduce((sum, item) => sum + item.totalTimeMs, 0);

const PeriodButton = ({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) => (
  <Pressable
    onPress={onPress}
    style={[styles.periodButton, active && styles.periodButtonActive]}
  >
    <Text style={[styles.periodButtonText, active && styles.periodButtonTextActive]}>
      {label}
    </Text>
  </Pressable>
);

export default function AppUsageScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);
  const [error, setError] = useState("");
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodKey>("today");
  const [todayItems, setTodayItems] = useState<AppUsageItem[]>([]);
  const [weekItems, setWeekItems] = useState<AppUsageItem[]>([]);
  const [monthItems, setMonthItems] = useState<AppUsageItem[]>([]);

  const syncUsage = useCallback(
    async (options?: { refreshing?: boolean }) => {
      try {
        if (options?.refreshing) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        setError("");

        if (Platform.OS !== "android") {
          setHasPermission(false);
          setTodayItems([]);
          setWeekItems([]);
          setMonthItems([]);
          return;
        }

        const permission = await hasUsageAccessPermission();
        setHasPermission(permission);

        if (!permission) {
          const cached = await readAppUsageCache();
          if (cached) {
            setTodayItems(cached.today);
            setWeekItems(cached.week);
            setMonthItems(cached.month);
          } else {
            setTodayItems([]);
            setWeekItems([]);
            setMonthItems([]);
          }
          return;
        }

        const now = new Date();
        const todayRange = getTodayRange(now);
        const weekRange = getThisWeekRange(now);
        const monthRange = getThisMonthRange(now);

        const [todayRaw, weekRaw, monthRaw] = await Promise.all([
          getAppUsageStats(todayRange.startTime, todayRange.endTime),
          getAppUsageStats(weekRange.startTime, weekRange.endTime),
          getAppUsageStats(monthRange.startTime, monthRange.endTime),
        ]);

        const today = filterUsageItemsToWindow(
          todayRaw,
          todayRange.startTime,
          todayRange.endTime,
        );
        const week = filterUsageItemsToWindow(
          weekRaw,
          weekRange.startTime,
          weekRange.endTime,
        );
        const month = filterUsageItemsToWindow(
          monthRaw,
          monthRange.startTime,
          monthRange.endTime,
        );

        setTodayItems(today);
        setWeekItems(week);
        setMonthItems(month);

        await writeAppUsageCache({
          today,
          week,
          month,
          updatedAt: Date.now(),
        });

        if (!today.length && !week.length && !month.length) {
          setError("No app usage data was returned yet.");
        }
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Unable to load app usage");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [],
  );

  useFocusEffect(
    useCallback(() => {
      void syncUsage();
    }, [syncUsage]),
  );

  const selectedItems = useMemo(() => {
    switch (selectedPeriod) {
      case "week":
        return weekItems;
      case "month":
        return monthItems;
      default:
        return todayItems;
    }
  }, [monthItems, selectedPeriod, todayItems, weekItems]);

  if (Platform.OS !== "android") {
    return (
      <SafeAreaView edges={["top"]} style={styles.screen}>
        <StateView title="Android only" detail="App usage tracking is only available on Android." />
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView edges={["top"]} style={styles.screen}>
        <StateView title="Loading app usage" detail="Reading aggregate usage stats from Android." loading />
      </SafeAreaView>
    );
  }

  if (!hasPermission) {
    return (
      <SafeAreaView edges={["top"]} style={styles.screen}>
        <StateView
          title="Usage access required"
          detail="Enable Android usage access so the app can read aggregate app usage totals for today, this week, and this month."
          actionLabel="Enable Usage Access"
          onAction={openUsageAccessSettings}
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
            onRefresh={() => void syncUsage({ refreshing: true })}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>App Usage</Text>
            <Text style={styles.subtitle}>Android aggregate app usage stats</Text>
          </View>
          <Pressable onPress={() => void syncUsage({ refreshing: true })} style={styles.refreshButton}>
            {refreshing ? (
              <ActivityIndicator color={colors.primary} size="small" />
            ) : (
              <Ionicons color={colors.primary} name="refresh" size={18} />
            )}
          </Pressable>
        </View>

        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Today</Text>
            <Text style={styles.summaryValue}>{formatUsageDuration(getTotalTimeMs(todayItems))}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>This week</Text>
            <Text style={styles.summaryValue}>{formatUsageDuration(getTotalTimeMs(weekItems))}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>This month</Text>
            <Text style={styles.summaryValue}>{formatUsageDuration(getTotalTimeMs(monthItems))}</Text>
          </View>
        </View>

        <View style={styles.periodRow}>
          <PeriodButton active={selectedPeriod === "today"} label="Today" onPress={() => setSelectedPeriod("today")} />
          <PeriodButton active={selectedPeriod === "week"} label="This week" onPress={() => setSelectedPeriod("week")} />
          <PeriodButton active={selectedPeriod === "month"} label="This month" onPress={() => setSelectedPeriod("month")} />
        </View>

        {error ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {selectedItems.length ? (
          <View style={styles.listCard}>
            <View style={styles.listHeader}>
              <Text style={styles.listTitle}>Top apps</Text>
              <Text style={styles.listCaption}>{selectedItems.length} apps</Text>
            </View>
            {selectedItems.map((item) => (
              <View key={`${selectedPeriod}-${item.packageName}`} style={styles.appRow}>
                <View style={styles.appCopy}>
                  <Text numberOfLines={1} style={styles.appName}>
                    {item.appName}
                  </Text>
                  <Text numberOfLines={1} style={styles.packageName}>
                    {item.packageName}
                  </Text>
                </View>
                <View style={styles.appMeta}>
                  <Text style={styles.durationText}>{formatUsageDuration(item.totalTimeMs)}</Text>
                  <Text style={styles.lastUsedText}>
                    {item.lastUsedTime ? new Date(item.lastUsedTime).toLocaleTimeString() : "No recent use"}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <StateView
            title="No usage stats"
            detail="Android returned no app usage data for the selected period. Open a few apps, then refresh."
          />
        )}
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
    paddingBottom: 40,
  },
  headerRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "900",
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: "700",
    marginTop: 6,
  },
  refreshButton: {
    alignItems: "center",
    backgroundColor: colors.accentSurface,
    borderRadius: 999,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  summaryRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 18,
  },
  summaryCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 20,
    borderWidth: 1,
    flex: 1,
    minHeight: 108,
    padding: 14,
    ...subtleShadow,
  },
  summaryLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "800",
  },
  summaryValue: {
    color: colors.text,
    fontSize: 26,
    fontWeight: "900",
    lineHeight: 30,
    marginTop: 16,
  },
  periodRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 14,
  },
  periodButton: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  periodButtonActive: {
    backgroundColor: colors.text,
  },
  periodButtonText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "800",
  },
  periodButtonTextActive: {
    color: colors.white,
  },
  errorCard: {
    backgroundColor: colors.dangerSurface,
    borderRadius: 16,
    marginBottom: 14,
    padding: 14,
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19,
  },
  listCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 22,
    borderWidth: 1,
    padding: 16,
    ...subtleShadow,
  },
  listHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  listTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900",
  },
  listCaption: {
    color: colors.textSoft,
    fontSize: 12,
    fontWeight: "800",
  },
  appRow: {
    alignItems: "center",
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    paddingVertical: 14,
  },
  appCopy: {
    flex: 1,
  },
  appName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "900",
  },
  packageName: {
    color: colors.textSoft,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
  },
  appMeta: {
    alignItems: "flex-end",
    maxWidth: 110,
  },
  durationText: {
    color: colors.workTag,
    fontSize: 13,
    fontWeight: "900",
  },
  lastUsedText: {
    color: colors.textSoft,
    fontSize: 11,
    fontWeight: "700",
    marginTop: 4,
  },
});
