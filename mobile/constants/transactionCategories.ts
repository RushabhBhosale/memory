import type { ComponentProps } from "react";
import { Ionicons } from "@expo/vector-icons";

export type TransactionCategory = {
  color: string;
  icon: ComponentProps<typeof Ionicons>["name"];
  key: string;
  label: string;
  surface: string;
};

export const transactionCategories: TransactionCategory[] = [
  { key: "food", label: "Food", icon: "restaurant-outline", color: "#D9534F", surface: "#FCECEB" },
  { key: "groceries", label: "Groceries", icon: "basket-outline", color: "#2E9E6A", surface: "#E7F6EE" },
  { key: "transport", label: "Transport", icon: "car-outline", color: "#3A6FD8", surface: "#EAF0FC" },
  { key: "shopping", label: "Shopping", icon: "bag-handle-outline", color: "#8B5CF6", surface: "#F1ECFE" },
  { key: "bills", label: "Bills", icon: "receipt-outline", color: "#D9822B", surface: "#FDF3E7" },
  { key: "housing", label: "Housing", icon: "home-outline", color: "#5B61D6", surface: "#EEEFFC" },
  { key: "health", label: "Health", icon: "medkit-outline", color: "#E0567A", surface: "#FCEBF0" },
  { key: "entertainment", label: "Fun", icon: "game-controller-outline", color: "#C2549B", surface: "#FAEAF4" },
  { key: "travel", label: "Travel", icon: "airplane-outline", color: "#1E9BC0", surface: "#E6F5FA" },
  { key: "education", label: "Education", icon: "school-outline", color: "#3D8C8C", surface: "#E7F3F3" },
  { key: "investments", label: "Investments", icon: "trending-up-outline", color: "#3D4EE0", surface: "#EEF0FD" },
  { key: "salary", label: "Salary", icon: "wallet-outline", color: "#12A16B", surface: "#E6F6EF" },
  { key: "transfer", label: "Transfer", icon: "swap-horizontal-outline", color: "#5E6476", surface: "#F0F1F4" },
  { key: "general", label: "Other", icon: "ellipsis-horizontal", color: "#5E6476", surface: "#F0F1F4" },
];

const incomeKeys = ["salary", "transfer", "investments", "general"];
const expenseKeys = transactionCategories
  .map((category) => category.key)
  .filter((key) => key !== "salary");

export const getCategoriesForType = (type: "expense" | "income") => {
  const keys = type === "income" ? incomeKeys : expenseKeys;
  return transactionCategories.filter((category) => keys.includes(category.key));
};

export const transactionCategoryKeys = transactionCategories.map((category) => category.key);

export const getTransactionCategory = (key?: string) =>
  transactionCategories.find((category) => category.key === key?.trim().toLowerCase()) ??
  transactionCategories[transactionCategories.length - 1];
