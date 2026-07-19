import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors } from "../styles/theme";
import { formatCompactAmount, getDateKey } from "../utils/financeAnalytics";

type ExpenseCalendarProps = {
  dailyExpenses: Map<string, number>;
  month: Date;
  onSelectDate: (dateKey: string) => void;
  selectedDateKey: string;
};

const weekDays = ["S", "M", "T", "W", "T", "F", "S"];

export function ExpenseCalendar({
  dailyExpenses,
  month,
  onSelectDate,
  selectedDateKey,
}: ExpenseCalendarProps) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const dayCount = new Date(year, monthIndex + 1, 0).getDate();
  const cellCount = Math.ceil((firstWeekday + dayCount) / 7) * 7;
  const maximumExpense = Math.max(...dailyExpenses.values(), 0);
  const todayKey = getDateKey(new Date());

  return (
    <View>
      <View style={styles.weekRow}>
        {weekDays.map((day, index) => (
          <Text key={`${day}-${index}`} style={styles.weekLabel}>
            {day}
          </Text>
        ))}
      </View>
      <View style={styles.grid}>
        {Array.from({ length: cellCount }, (_, index) => {
          const day = index - firstWeekday + 1;

          if (day < 1 || day > dayCount) {
            return <View key={`empty-${index}`} style={styles.emptyCell} />;
          }

          const date = new Date(year, monthIndex, day);
          const dateKey = getDateKey(date);
          const amount = dailyExpenses.get(dateKey) || 0;
          const intensity = maximumExpense > 0 ? amount / maximumExpense : 0;
          const isStrong = intensity >= 0.66;
          const isMedium = intensity >= 0.34;
          const isSelected = dateKey === selectedDateKey;
          const isToday = dateKey === todayKey;

          return (
            <Pressable
              accessibilityLabel={`${new Intl.DateTimeFormat(undefined, {
                dateStyle: "long",
              }).format(date)}, ${amount ? `spent ₹${formatCompactAmount(amount)}` : "no expenses"}`}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              key={dateKey}
              onPress={() => onSelectDate(dateKey)}
              style={[
                styles.dayCell,
                amount > 0 && styles.activeDayCell,
                isMedium && styles.mediumDayCell,
                isStrong && styles.strongDayCell,
                isSelected && styles.selectedDayCell,
              ]}
            >
              <View style={styles.dayHeader}>
                <Text style={[styles.dayNumber, isStrong && styles.lightText]}>{day}</Text>
                {isToday ? <View style={[styles.todayDot, isStrong && styles.lightDot]} /> : null}
              </View>
              {amount ? (
                <Text numberOfLines={1} style={[styles.amount, isStrong && styles.lightText]}>
                  ₹{formatCompactAmount(amount)}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  activeDayCell: { backgroundColor: colors.primarySurface },
  amount: { color: colors.primary, fontSize: 10, fontWeight: "800", letterSpacing: -0.15 },
  dayCell: {
    borderColor: "transparent",
    borderRadius: 9,
    borderWidth: 1.5,
    height: 54,
    justifyContent: "space-between",
    paddingHorizontal: 5,
    paddingVertical: 6,
    width: "14.2857%",
  },
  dayHeader: { alignItems: "center", flexDirection: "row", gap: 3 },
  dayNumber: { color: colors.text, fontSize: 12, fontWeight: "700" },
  emptyCell: { height: 54, width: "14.2857%" },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  lightDot: { backgroundColor: colors.white },
  lightText: { color: colors.white },
  mediumDayCell: { backgroundColor: "#8BC8B1" },
  selectedDayCell: { borderColor: colors.secondary },
  strongDayCell: { backgroundColor: colors.primary },
  todayDot: { backgroundColor: colors.secondary, borderRadius: 3, height: 5, width: 5 },
  weekLabel: {
    color: colors.textSoft,
    fontSize: 10,
    fontWeight: "800",
    textAlign: "center",
    width: "14.2857%",
  },
  weekRow: { flexDirection: "row", marginBottom: 7 },
});
