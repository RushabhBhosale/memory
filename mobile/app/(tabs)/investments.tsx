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

import {
  Banner,
  Card,
  EmptyState,
  IconBadge,
  IconButton,
  PageHeader,
  SectionHeader,
  TAB_BAR_CLEARANCE,
} from "../../components/ui";
import { getInvestmentType } from "../../constants/investmentTypes";
import {
  deleteInvestment,
  getInvestmentSummary,
  listInvestments,
  type InvestmentHolding,
} from "../../services/investments";
import { colors, radius, type } from "../../styles/theme";
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
      <SafeAreaView edges={["top"]} style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  const isGain = summary.profit >= 0;

  return (
    <SafeAreaView edges={["top"]} style={styles.screen}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            colors={[colors.primary]}
            onRefresh={() => void loadHoldings(true)}
            refreshing={refreshing}
            tintColor={colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <PageHeader
          right={
            <IconButton
              accessibilityLabel="Add investment"
              icon="add"
              onPress={() => router.push("/investment-add")}
              tone="primary"
            />
          }
          subtitle="Your investments"
          title="Portfolio"
        />

        {error ? <Banner message={error} onPress={() => void loadHoldings()} /> : null}

        <View style={styles.valueCard}>
          <Text style={styles.valueLabel}>Current value</Text>
          <Text adjustsFontSizeToFit numberOfLines={1} style={styles.value}>
            {formatCurrency(summary.current)}
          </Text>
          <View style={[styles.returnPill, { backgroundColor: isGain ? "rgba(18,161,107,0.18)" : "rgba(229,72,77,0.18)" }]}>
            <Text style={[styles.returnText, { color: isGain ? "#4ADE9B" : "#FF8A8D" }]}>
              {isGain ? "▲" : "▼"} {formatCurrency(Math.abs(summary.profit))} ({isGain ? "+" : ""}{summary.profitPercent.toFixed(1)}%)
            </Text>
          </View>
          <View style={styles.valueSplit}>
            <View style={styles.flex}>
              <Text style={styles.valueStatLabel}>Invested</Text>
              <Text numberOfLines={1} style={styles.valueStat}>{formatCurrency(summary.invested)}</Text>
            </View>
            <View style={styles.flex}>
              <Text style={styles.valueStatLabel}>Holdings</Text>
              <Text style={styles.valueStat}>{holdings.length}</Text>
            </View>
          </View>
        </View>

        {allocations.length ? (
          <>
            <SectionHeader title="Allocation" />
            <Card>
              <View style={styles.allocationBar}>
                {allocations.map((allocation) => (
                  <View
                    key={allocation.config.key}
                    style={{ backgroundColor: allocation.config.color, flex: Math.max(allocation.percent, 2) }}
                  />
                ))}
              </View>
              <View style={styles.legend}>
                {allocations.map((allocation) => (
                  <View key={allocation.config.key} style={styles.legendRow}>
                    <View style={[styles.legendDot, { backgroundColor: allocation.config.color }]} />
                    <Text style={styles.legendLabel}>{allocation.config.label}</Text>
                    <Text style={styles.legendValue}>{formatCurrency(allocation.value)}</Text>
                    <Text style={styles.legendPercent}>{allocation.percent.toFixed(0)}%</Text>
                  </View>
                ))}
              </View>
            </Card>
          </>
        ) : null}

        <SectionHeader title="Holdings" />
        <Card padded={false}>
          {holdings.length ? (
            holdings.map((holding, index) => (
              <HoldingRow
                holding={holding}
                key={holding.id}
                last={index === holdings.length - 1}
                onLongPress={() => removeHolding(holding)}
              />
            ))
          ) : (
            <EmptyState
              actionLabel="Add investment"
              icon="trending-up-outline"
              message="Add stocks, funds, property, crypto or cash to see value and returns in one place."
              onAction={() => router.push("/investment-add")}
              title="Build your portfolio"
            />
          )}
        </Card>
        {holdings.length ? <Text style={styles.hint}>Long-press a holding to remove it.</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function HoldingRow({
  holding,
  last,
  onLongPress,
}: {
  holding: InvestmentHolding;
  last: boolean;
  onLongPress: () => void;
}) {
  const config = getInvestmentType(holding.type);
  const value = holding.currentPrice * holding.quantity;
  const profitPercent = holding.averagePrice > 0
    ? ((holding.currentPrice - holding.averagePrice) / holding.averagePrice) * 100
    : 0;
  const isGain = profitPercent >= 0;

  return (
    <Pressable
      accessibilityHint="Long-press to remove"
      onLongPress={onLongPress}
      style={({ pressed }) => [styles.holdingRow, !last && styles.divider, pressed && styles.pressed]}
    >
      <IconBadge color={config.color} icon={config.icon} surface={config.surface} />
      <View style={styles.flex}>
        <Text numberOfLines={1} style={styles.holdingName}>{holding.name}</Text>
        <Text numberOfLines={1} style={styles.holdingMeta}>
          {holding.symbol || config.label} · {holding.quantity} units
        </Text>
      </View>
      <View style={styles.holdingRight}>
        <Text style={styles.holdingValue}>{formatCurrency(value, holding.currency)}</Text>
        <Text style={[styles.holdingReturn, { color: isGain ? colors.success : colors.danger }]}>
          {isGain ? "+" : ""}{profitPercent.toFixed(1)}%
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  allocationBar: { borderRadius: 4, flexDirection: "row", gap: 2, height: 8, overflow: "hidden" },
  center: { alignItems: "center", backgroundColor: colors.background, flex: 1, justifyContent: "center" },
  content: { gap: 12, paddingBottom: TAB_BAR_CLEARANCE, paddingHorizontal: 20 },
  divider: { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
  flex: { flex: 1 },
  hint: { ...type.caption, color: colors.textSoft, textAlign: "center" },
  holdingMeta: { ...type.caption, color: colors.textMuted, marginTop: 3 },
  holdingName: { color: colors.text, fontSize: 15, fontWeight: "600" },
  holdingReturn: { ...type.caption, fontVariant: ["tabular-nums"], fontWeight: "600" },
  holdingRight: { alignItems: "flex-end", gap: 3 },
  holdingRow: { alignItems: "center", flexDirection: "row", gap: 12, minHeight: 66, paddingHorizontal: 16, paddingVertical: 12 },
  holdingValue: { color: colors.text, fontSize: 15, fontVariant: ["tabular-nums"], fontWeight: "600" },
  legend: { gap: 12, marginTop: 16 },
  legendDot: { borderRadius: 4, height: 8, width: 8 },
  legendLabel: { ...type.label, color: colors.text, flex: 1 },
  legendPercent: { ...type.caption, color: colors.textSoft, fontVariant: ["tabular-nums"], textAlign: "right", width: 40 },
  legendRow: { alignItems: "center", flexDirection: "row", gap: 10 },
  legendValue: { ...type.label, color: colors.textMuted, fontVariant: ["tabular-nums"] },
  pressed: { backgroundColor: colors.backgroundSoft },
  returnPill: { alignSelf: "flex-start", borderRadius: radius.pill, marginTop: 10, paddingHorizontal: 10, paddingVertical: 5 },
  returnText: { fontSize: 13, fontVariant: ["tabular-nums"], fontWeight: "600" },
  screen: { backgroundColor: colors.background, flex: 1 },
  value: { ...type.display, color: colors.white, fontVariant: ["tabular-nums"], marginTop: 6 },
  valueCard: { backgroundColor: colors.ink, borderRadius: radius.xl, padding: 20 },
  valueLabel: { ...type.label, color: colors.inkMuted },
  valueSplit: { borderTopColor: colors.inkLine, borderTopWidth: 1, flexDirection: "row", gap: 16, marginTop: 18, paddingTop: 16 },
  valueStat: { color: colors.white, fontSize: 16, fontVariant: ["tabular-nums"], fontWeight: "600", marginTop: 3 },
  valueStatLabel: { ...type.caption, color: colors.inkMuted },
});
