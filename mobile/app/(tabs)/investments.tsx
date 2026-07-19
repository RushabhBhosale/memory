import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { FinanceHero } from "../../components/FinanceHero";
import { getInvestmentType } from "../../constants/investmentTypes";
import {
  deleteInvestment,
  getInvestmentSummary,
  listInvestments,
  type InvestmentHolding,
} from "../../services/investments";
import { colors, subtleShadow } from "../../styles/theme";
import { formatCurrency } from "../../utils/localization";

export default function InvestmentsScreen() {
  const [holdings, setHoldings] = useState<InvestmentHolding[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadHoldings = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    try {
      setError("");
      setHoldings(await listInvestments());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load your portfolio");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadHoldings();
    }, [loadHoldings]),
  );

  const summary = useMemo(() => getInvestmentSummary(holdings), [holdings]);
  const allocations = useMemo(() => {
    const totals = new Map<string, number>();
    holdings.forEach((holding) => {
      totals.set(
        holding.type,
        (totals.get(holding.type) || 0) + holding.currentPrice * holding.quantity,
      );
    });
    return [...totals.entries()]
      .map(([type, value]) => ({
        config: getInvestmentType(type as InvestmentHolding["type"]),
        percent: summary.current > 0 ? (value / summary.current) * 100 : 0,
        value,
      }))
      .sort((a, b) => b.value - a.value);
  }, [holdings, summary.current]);

  const removeHolding = (holding: InvestmentHolding) => {
    Alert.alert("Remove investment?", `${holding.name} will be removed from this device.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteInvestment(holding.id);
            await loadHoldings();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Unable to remove investment");
          }
        },
      },
    ]);
  };

  if (loading && !holdings.length) {
    return (
      <SafeAreaView edges={["top"]} style={styles.loadingScreen}>
        <ActivityIndicator color={colors.white} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            colors={[colors.primary]}
            onRefresh={() => void loadHoldings(true)}
            refreshing={refreshing}
            tintColor={colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
        style={styles.scroll}
      >
        <FinanceHero
          actionIcon="add-outline"
          actionLabel="Add investment"
          label="Total investment"
          onAction={() => router.push("/investment-add")}
          title="Portfolio"
          value={formatCurrency(summary.current)}
        />

        <View style={styles.body}>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <View style={styles.summaryCard}>
            <PortfolioMetric label="Invested" value={formatCurrency(summary.invested)} />
            <View style={styles.divider} />
            <PortfolioMetric
              label="Profit / loss"
              tone={summary.profit >= 0 ? "positive" : "negative"}
              value={`${summary.profit >= 0 ? "+" : "−"}${formatCurrency(Math.abs(summary.profit))}`}
            />
            <View style={styles.performanceRow}>
              <View style={styles.performanceTrack}>
                <View
                  style={[
                    styles.performanceFill,
                    summary.profit < 0 && styles.performanceFillNegative,
                    { width: `${Math.min(Math.abs(summary.profitPercent), 100)}%` as `${number}%` },
                  ]}
                />
              </View>
              <Text style={[styles.performanceText, summary.profit < 0 && styles.lossText]}>
                {summary.profit >= 0 ? "+" : ""}{summary.profitPercent.toFixed(1)}%
              </Text>
            </View>
          </View>

          {allocations.length ? (
            <View>
              <Text style={styles.sectionTitle}>Allocation</Text>
              <View style={styles.allocationCard}>
                <View style={styles.allocationBar}>
                  {allocations.map((allocation) => (
                    <View
                      key={allocation.config.key}
                      style={{
                        backgroundColor: allocation.config.color,
                        flex: Math.max(allocation.percent, 2),
                      }}
                    />
                  ))}
                </View>
                <View style={styles.allocationLegend}>
                  {allocations.map((allocation) => (
                    <View key={allocation.config.key} style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: allocation.config.color }]} />
                      <Text style={styles.legendLabel}>{allocation.config.label}</Text>
                      <Text style={styles.legendPercent}>{allocation.percent.toFixed(0)}%</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          ) : null}

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Your investments</Text>
            <Text style={styles.sectionCaption}>{holdings.length} assets</Text>
          </View>

          {holdings.length ? (
            <View style={styles.holdingsList}>
              {holdings.map((holding) => (
                <HoldingRow holding={holding} key={holding.id} onRemove={() => removeHolding(holding)} />
              ))}
            </View>
          ) : (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIcon}>
                <Ionicons color={colors.primary} name="trending-up-outline" size={25} />
              </View>
              <Text style={styles.emptyTitle}>Build your portfolio</Text>
              <Text style={styles.emptyText}>
                Add stocks, funds, property, crypto, or cash to see value, allocation, and returns together.
              </Text>
              <Pressable style={styles.addButton} onPress={() => router.push("/investment-add")}>
                <Ionicons color={colors.white} name="add" size={18} />
                <Text style={styles.addButtonText}>Add investment</Text>
              </Pressable>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function PortfolioMetric({
  label,
  tone,
  value,
}: {
  label: string;
  tone?: "negative" | "positive";
  value: string;
}) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text
        style={[
          styles.metricValue,
          tone === "positive" && styles.gainText,
          tone === "negative" && styles.lossText,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function HoldingRow({
  holding,
  onRemove,
}: {
  holding: InvestmentHolding;
  onRemove: () => void;
}) {
  const config = getInvestmentType(holding.type);
  const value = holding.currentPrice * holding.quantity;
  const profit = (holding.currentPrice - holding.averagePrice) * holding.quantity;
  const profitPercent = holding.averagePrice > 0
    ? ((holding.currentPrice - holding.averagePrice) / holding.averagePrice) * 100
    : 0;

  return (
    <View style={styles.holdingRow}>
      <View style={[styles.holdingIcon, { backgroundColor: config.surface }]}>
        <Ionicons color={config.color} name={config.icon} size={20} />
      </View>
      <View style={styles.holdingCopy}>
        <Text numberOfLines={1} style={styles.holdingName}>{holding.name}</Text>
        <Text numberOfLines={1} style={styles.holdingMeta}>
          {holding.symbol || config.label} · {holding.quantity} units
        </Text>
      </View>
      <View style={styles.holdingValueCopy}>
        <Text style={styles.holdingValue}>{formatCurrency(value, holding.currency)}</Text>
        <Text style={profit >= 0 ? styles.gainText : styles.lossText}>
          {profit >= 0 ? "+" : ""}{profitPercent.toFixed(1)}%
        </Text>
      </View>
      <Pressable accessibilityLabel={`Remove ${holding.name}`} accessibilityRole="button" hitSlop={8} onPress={onRemove} style={styles.moreButton}>
        <Ionicons color={colors.textSoft} name="trash-outline" size={17} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  addButton: { alignItems: "center", backgroundColor: colors.primary, borderRadius: 10, flexDirection: "row", gap: 7, marginTop: 8, paddingHorizontal: 15, paddingVertical: 11 },
  addButtonText: { color: colors.white, fontSize: 13, fontWeight: "800" },
  allocationBar: { borderRadius: 3, flexDirection: "row", height: 5, overflow: "hidden" },
  allocationCard: { backgroundColor: colors.surface, borderRadius: 10, marginTop: 10, padding: 13 },
  allocationLegend: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 12 },
  body: { gap: 18, marginTop: -24, paddingBottom: 120, paddingHorizontal: 16 },
  divider: { backgroundColor: colors.borderStrong, height: 46, width: 1 },
  emptyCard: { alignItems: "center", backgroundColor: colors.surface, borderRadius: 10, gap: 8, padding: 24 },
  emptyIcon: { alignItems: "center", backgroundColor: colors.primarySurface, borderRadius: 999, height: 48, justifyContent: "center", width: 48 },
  emptyText: { color: colors.textMuted, fontSize: 13, lineHeight: 19, maxWidth: 290, textAlign: "center" },
  emptyTitle: { color: colors.text, fontSize: 17, fontWeight: "800" },
  errorText: { color: colors.danger, fontSize: 13, fontWeight: "700" },
  gainText: { color: colors.success },
  holdingCopy: { flex: 1 },
  holdingIcon: { alignItems: "center", borderRadius: 4, height: 40, justifyContent: "center", width: 40 },
  holdingMeta: { color: colors.textMuted, fontSize: 11, marginTop: 3 },
  holdingName: { color: colors.text, fontSize: 15, fontWeight: "700" },
  holdingRow: { alignItems: "center", borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: "row", gap: 10, minHeight: 70, paddingHorizontal: 12, paddingVertical: 10 },
  holdingValue: { color: colors.text, fontSize: 14, fontWeight: "700" },
  holdingValueCopy: { alignItems: "flex-end", gap: 3 },
  holdingsList: { backgroundColor: colors.surface, borderRadius: 10, overflow: "hidden" },
  legendDot: { borderRadius: 3, height: 7, width: 7 },
  legendItem: { alignItems: "center", flexDirection: "row", gap: 5 },
  legendLabel: { color: colors.textMuted, fontSize: 11 },
  legendPercent: { color: colors.text, fontSize: 11, fontWeight: "700" },
  loadingScreen: { alignItems: "center", backgroundColor: colors.primaryDark, flex: 1, justifyContent: "center" },
  lossText: { color: colors.danger },
  metric: { flex: 1 },
  metricLabel: { color: colors.textMuted, fontSize: 12, marginBottom: 5 },
  metricValue: { color: colors.primary, fontSize: 17, fontWeight: "800" },
  moreButton: { padding: 4 },
  performanceFill: { backgroundColor: colors.success, borderRadius: 3, height: 4 },
  performanceFillNegative: { backgroundColor: colors.danger },
  performanceRow: { alignItems: "center", bottom: 12, flexDirection: "row", gap: 10, left: 13, position: "absolute", right: 13 },
  performanceText: { color: colors.success, fontSize: 11, fontWeight: "800" },
  performanceTrack: { backgroundColor: colors.background, borderRadius: 3, flex: 1, height: 4 },
  safeArea: { backgroundColor: colors.primaryDark, flex: 1 },
  scroll: { backgroundColor: colors.background },
  scrollContent: { backgroundColor: colors.background },
  sectionCaption: { color: colors.textMuted, fontSize: 12 },
  sectionHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  sectionTitle: { color: colors.text, fontSize: 20, fontWeight: "700" },
  summaryCard: { ...subtleShadow, backgroundColor: colors.surface, borderRadius: 10, flexDirection: "row", gap: 18, minHeight: 116, paddingBottom: 30, paddingHorizontal: 18, paddingTop: 18 },
});
