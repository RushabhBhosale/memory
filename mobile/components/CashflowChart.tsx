import { ScrollView, StyleSheet, Text, View } from "react-native";

import { colors } from "../styles/theme";
import { formatCompactAmount, type CashflowPoint } from "../utils/financeAnalytics";

type CashflowChartProps = {
  points: CashflowPoint[];
};

const CHART_HEIGHT = 126;

export function CashflowChart({ points }: CashflowChartProps) {
  const maximum = Math.max(
    ...points.flatMap((point) => [point.expense, point.income]),
    0,
  );

  if (!maximum) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyTitle}>No cash flow yet</Text>
        <Text style={styles.emptyText}>Income and expense trends will appear here.</Text>
      </View>
    );
  }

  return (
    <View>
      <View style={styles.legend}>
        <LegendItem color={colors.secondary} label="Expenses" />
        <LegendItem color={colors.success} label="Income" />
        <Text style={styles.scale}>Peak ₹{formatCompactAmount(maximum)}</Text>
      </View>
      <View style={styles.plot}>
        <View pointerEvents="none" style={styles.gridLines}>
          <View style={styles.gridLine} />
          <View style={styles.gridLine} />
          <View style={styles.gridLine} />
        </View>
        <ScrollView
          contentContainerStyle={styles.chartContent}
          horizontal
          showsHorizontalScrollIndicator={false}
        >
          {points.map((point) => (
            <View
              accessible
              accessibilityLabel={`${point.label}: ₹${formatCompactAmount(point.expense)} expenses and ₹${formatCompactAmount(point.income)} income`}
              key={point.key}
              style={styles.group}
            >
              <View style={styles.barArea}>
                <View
                  style={[
                    styles.bar,
                    styles.expenseBar,
                    { height: point.expense ? Math.max((point.expense / maximum) * CHART_HEIGHT, 3) : 0 },
                  ]}
                />
                <View
                  style={[
                    styles.bar,
                    styles.incomeBar,
                    { height: point.income ? Math.max((point.income / maximum) * CHART_HEIGHT, 3) : 0 },
                  ]}
                />
              </View>
              <Text numberOfLines={1} style={styles.label}>{point.label}</Text>
            </View>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { borderRadius: 4, minWidth: 8, width: 9 },
  barArea: { alignItems: "flex-end", flexDirection: "row", gap: 3, height: CHART_HEIGHT, justifyContent: "center" },
  chartContent: { gap: 5, minWidth: "100%", paddingHorizontal: 4 },
  emptyState: { alignItems: "center", backgroundColor: colors.backgroundSoft, borderRadius: 10, padding: 28 },
  emptyText: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
  emptyTitle: { color: colors.text, fontSize: 14, fontWeight: "800" },
  expenseBar: { backgroundColor: colors.secondary },
  gridLine: { borderTopColor: colors.border, borderTopWidth: 1, flex: 1 },
  gridLines: { bottom: 25, justifyContent: "space-between", left: 0, position: "absolute", right: 0, top: 5 },
  group: { alignItems: "center", minWidth: 48 },
  incomeBar: { backgroundColor: colors.success },
  label: { color: colors.textSoft, fontSize: 9, fontWeight: "700", marginTop: 7, maxWidth: 50 },
  legend: { alignItems: "center", flexDirection: "row", gap: 14, marginBottom: 12 },
  legendDot: { borderRadius: 3, height: 6, width: 6 },
  legendItem: { alignItems: "center", flexDirection: "row", gap: 5 },
  legendLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "700" },
  plot: { minHeight: CHART_HEIGHT + 28 },
  scale: { color: colors.textSoft, fontSize: 10, marginLeft: "auto" },
});
