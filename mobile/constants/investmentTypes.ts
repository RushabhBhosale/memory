import type { ComponentProps } from "react";
import { Ionicons } from "@expo/vector-icons";

import type { InvestmentAssetType } from "../services/investments";

export type InvestmentTypeOption = {
  color: string;
  icon: ComponentProps<typeof Ionicons>["name"];
  key: InvestmentAssetType;
  label: string;
  surface: string;
};

export const investmentTypes: InvestmentTypeOption[] = [
  { key: "equity", label: "Stocks", icon: "stats-chart-outline", color: "#315497", surface: "#E7EDF8" },
  { key: "mutual-fund", label: "Funds", icon: "pie-chart-outline", color: "#6A9FCD", surface: "#E8F2FA" },
  { key: "fixed-income", label: "Fixed income", icon: "shield-checkmark-outline", color: "#5C8D95", surface: "#E6F1F2" },
  { key: "crypto", label: "Crypto", icon: "logo-bitcoin", color: "#C47B14", surface: "#FFF2DD" },
  { key: "real-estate", label: "Real estate", icon: "business-outline", color: "#7F549E", surface: "#EFE7F4" },
  { key: "cash", label: "Cash", icon: "cash-outline", color: "#278C52", surface: "#E5F5EB" },
  { key: "other", label: "Other", icon: "layers-outline", color: "#667085", surface: "#EEF0F3" },
];

export const getInvestmentType = (key: InvestmentAssetType) =>
  investmentTypes.find((type) => type.key === key) ?? investmentTypes[investmentTypes.length - 1];

