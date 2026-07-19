import type { ExpenseEntry } from "../services/expenses";

export type CashflowPoint = {
  expense: number;
  income: number;
  key: string;
  label: string;
};

export const getDateKey = (value: number | Date) => {
  const date = value instanceof Date ? value : new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
};

export const getMonthKey = (value: number | Date) => {
  const date = value instanceof Date ? value : new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};

export const isSameMonth = (timestamp: number, month: Date) =>
  getMonthKey(timestamp) === getMonthKey(month);

export const getCashflowTotals = (transactions: ExpenseEntry[]) => {
  const income = transactions
    .filter((item) => item.type === "income")
    .reduce((total, item) => total + item.amount, 0);
  const expense = transactions
    .filter((item) => item.type === "expense")
    .reduce((total, item) => total + item.amount, 0);

  return { expense, income, net: income - expense };
};

export const getDailyExpenseTotals = (transactions: ExpenseEntry[]) => {
  const totals = new Map<string, number>();

  transactions
    .filter((item) => item.type === "expense")
    .forEach((item) => {
      const key = getDateKey(item.timestamp);
      totals.set(key, (totals.get(key) || 0) + item.amount);
    });

  return totals;
};

export const buildMonthlyCashflowPoints = (
  transactions: ExpenseEntry[],
  month: Date,
): CashflowPoint[] => {
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const points = Array.from({ length: Math.ceil(daysInMonth / 7) }, (_, index) => {
    const start = index * 7 + 1;
    const end = Math.min(start + 6, daysInMonth);
    return {
      expense: 0,
      income: 0,
      key: `week-${index + 1}`,
      label: `${start}–${end}`,
    };
  });

  transactions.filter((item) => isSameMonth(item.timestamp, month)).forEach((item) => {
    const weekIndex = Math.floor((new Date(item.timestamp).getDate() - 1) / 7);
    points[weekIndex][item.type] += item.amount;
  });

  return points;
};

export const buildAllTimeCashflowPoints = (transactions: ExpenseEntry[]): CashflowPoint[] => {
  const byMonth = new Map<string, CashflowPoint>();

  transactions.forEach((item) => {
    const date = new Date(item.timestamp);
    const key = getMonthKey(date);
    const current = byMonth.get(key) || {
      expense: 0,
      income: 0,
      key,
      label: new Intl.DateTimeFormat(undefined, {
        month: "short",
        year: "2-digit",
      }).format(date),
    };
    current[item.type] += item.amount;
    byMonth.set(key, current);
  });

  return [...byMonth.values()].sort((left, right) => left.key.localeCompare(right.key));
};

export const formatCompactAmount = (amount: number) => {
  if (amount >= 1_000_000) {
    return `${Number((amount / 1_000_000).toFixed(1))}m`;
  }

  if (amount >= 1_000) {
    return `${Number((amount / 1_000).toFixed(1))}k`;
  }

  return Math.round(amount).toString();
};
