import type { ComponentProps } from "react";
import { Ionicons } from "@expo/vector-icons";

import { colors } from "../styles/theme";

export type TransactionCategory = {
  color: string;
  icon: ComponentProps<typeof Ionicons>["name"];
  key: string;
  label: string;
  surface: string;
};

export const transactionCategories: TransactionCategory[] = [
  { key: "food", label: "Food", icon: "restaurant-outline", color: "#893547", surface: "#F4E4E8" },
  { key: "groceries", label: "Groceries", icon: "basket-outline", color: "#4E8B72", surface: "#E6F3ED" },
  { key: "transport", label: "Transport", icon: "car-outline", color: "#315497", surface: "#E7EDF8" },
  { key: "shopping", label: "Shopping", icon: "bag-handle-outline", color: "#7F549E", surface: "#EFE7F4" },
  { key: "bills", label: "Bills", icon: "receipt-outline", color: "#C47B14", surface: "#FFF2DD" },
  { key: "housing", label: "Housing", icon: "home-outline", color: "#6E54D8", surface: "#EEEAFE" },
  { key: "health", label: "Health", icon: "medkit-outline", color: "#D15C74", surface: "#FBE8ED" },
  { key: "entertainment", label: "Fun", icon: "game-controller-outline", color: "#B25A8C", surface: "#F9E9F2" },
  { key: "travel", label: "Travel", icon: "airplane-outline", color: "#489FCD", surface: "#E7F4FA" },
  { key: "education", label: "Education", icon: "school-outline", color: "#5C8D95", surface: "#E6F1F2" },
  { key: "investments", label: "Investments", icon: "trending-up-outline", color: "#356DB5", surface: "#E7EFFA" },
  { key: "salary", label: "Salary", icon: "wallet-outline", color: "#278C52", surface: "#E5F5EB" },
  { key: "transfer", label: "Transfer", icon: "swap-horizontal-outline", color: "#667085", surface: "#EEF0F3" },
  { key: "general", label: "Other", icon: "grid-outline", color: colors.primary, surface: colors.primarySurface },
];

export const transactionCategoryKeys = transactionCategories.map((category) => category.key);

export const getTransactionCategory = (key?: string) =>
  transactionCategories.find((category) => category.key === key?.trim().toLowerCase()) ??
  transactionCategories[transactionCategories.length - 1];

