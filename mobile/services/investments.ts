import AsyncStorage from "@react-native-async-storage/async-storage";

import { getExpenseSession } from "./auth";

export type InvestmentAssetType =
  | "equity"
  | "mutual-fund"
  | "fixed-income"
  | "crypto"
  | "real-estate"
  | "cash"
  | "other";

export type InvestmentHolding = {
  averagePrice: number;
  createdAt: number;
  currency: string;
  currentPrice: number;
  id: string;
  name: string;
  quantity: number;
  symbol: string;
  type: InvestmentAssetType;
  updatedAt: number;
  userId: string;
};

export type InvestmentInput = Pick<
  InvestmentHolding,
  "averagePrice" | "currentPrice" | "name" | "quantity" | "symbol" | "type"
> & {
  currency?: string;
};

const INVESTMENTS_CACHE_KEY = "memonest.investments.cache.v1";

const getCurrentUserId = async () => (await getExpenseSession())?.user.id || "main";

const readHoldings = async () => {
  const raw = await AsyncStorage.getItem(INVESTMENTS_CACHE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as InvestmentHolding[]) : [];
  } catch {
    return [];
  }
};

const writeHoldings = async (holdings: InvestmentHolding[]) => {
  await AsyncStorage.setItem(INVESTMENTS_CACHE_KEY, JSON.stringify(holdings));
};

export const listInvestments = async () => {
  const userId = await getCurrentUserId();
  return (await readHoldings())
    .filter((holding) => holding.userId === userId)
    .sort((a, b) => b.currentPrice * b.quantity - a.currentPrice * a.quantity);
};

export const addInvestment = async (input: InvestmentInput) => {
  const holdings = await readHoldings();
  const userId = await getCurrentUserId();
  const now = Date.now();
  const holding: InvestmentHolding = {
    ...input,
    currency: input.currency || "INR",
    id: `investment-${now}-${Math.random().toString(36).slice(2, 9)}`,
    symbol: input.symbol.trim().toUpperCase(),
    name: input.name.trim(),
    createdAt: now,
    updatedAt: now,
    userId,
  };
  await writeHoldings([...holdings, holding]);
  return holding;
};

export const deleteInvestment = async (id: string) => {
  const holdings = await readHoldings();
  const userId = await getCurrentUserId();
  const nextHoldings = holdings.filter(
    (holding) => holding.id !== id || holding.userId !== userId,
  );
  await writeHoldings(nextHoldings);
};

export const getInvestmentSummary = (holdings: InvestmentHolding[]) => {
  const invested = holdings.reduce(
    (total, holding) => total + holding.averagePrice * holding.quantity,
    0,
  );
  const current = holdings.reduce(
    (total, holding) => total + holding.currentPrice * holding.quantity,
    0,
  );
  const profit = current - invested;

  return {
    current,
    invested,
    profit,
    profitPercent: invested > 0 ? (profit / invested) * 100 : 0,
  };
};

