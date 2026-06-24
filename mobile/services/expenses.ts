import { NativeModules, Platform } from "react-native";

export type PendingTransactionStatus = "pending" | "confirmed" | "ignored";
export type PendingTransactionType = "debit" | "credit";
export type ExpenseType = "expense" | "income";

export type PendingTransaction = {
  id: string;
  amount: number;
  currency: string;
  merchant: string;
  type: PendingTransactionType;
  category: string;
  sender: string;
  messagePreview: string;
  timestamp: number;
  confidence: number;
  status: PendingTransactionStatus;
  createdAt: number;
  updatedAt: number;
};

export type ExpenseEntry = {
  id: string;
  amount: number;
  currency: string;
  merchant: string;
  category: string;
  type: ExpenseType;
  source: "sms" | "manual";
  originalSmsPreview: string;
  timestamp: number;
  createdAt: number;
};

export type ManualExpenseInput = {
  amount: number;
  category: string;
  currency?: string;
  merchant: string;
  note?: string;
  type?: ExpenseType;
};

export type PendingTransactionUpdate = Partial<
  Pick<PendingTransaction, "amount" | "category" | "merchant" | "type">
>;

export type SimulateSmsResult =
  | { matched: false; reason: string }
  | { matched: true; reason: string; transaction: PendingTransaction };

export type ScanRecentSmsResult = {
  ignoredReasons: Record<string, number>;
  matched: number;
  pending: number;
  scanned: number;
};

type ExpenseSmsNativeModule = {
  addManualExpense(input: ManualExpenseInput): Promise<ExpenseEntry>;
  confirmTransaction(id: string, updates?: PendingTransactionUpdate): Promise<boolean>;
  hasSmsPermissions(): Promise<boolean>;
  ignoreTransaction(id: string): Promise<boolean>;
  listExpenses(): Promise<ExpenseEntry[]>;
  listPendingTransactions(): Promise<PendingTransaction[]>;
  requestSmsPermissions(): Promise<boolean>;
  scanRecentSms(limit: number): Promise<ScanRecentSmsResult>;
  simulateIncomingSms(sender: string, messageBody: string): Promise<SimulateSmsResult>;
  updatePendingTransaction(
    id: string,
    updates: PendingTransactionUpdate,
  ): Promise<PendingTransaction | null>;
};

const nativeModule = NativeModules.ExpenseSmsModule as ExpenseSmsNativeModule | undefined;

const requireAndroidModule = () => {
  if (Platform.OS !== "android" || !nativeModule) {
    throw new Error("SMS transaction approval is only available in the Android app build.");
  }

  return nativeModule;
};

export const hasExpenseSmsPermissions = async () => {
  if (Platform.OS !== "android" || !nativeModule) {
    return false;
  }

  return nativeModule.hasSmsPermissions();
};

export const requestExpenseSmsPermissions = async () =>
  requireAndroidModule().requestSmsPermissions();

export const listPendingTransactions = async () =>
  requireAndroidModule().listPendingTransactions();

export const listExpenses = async () => requireAndroidModule().listExpenses();

export const addManualExpense = async (input: ManualExpenseInput) =>
  requireAndroidModule().addManualExpense({
    currency: "INR",
    type: "expense",
    ...input,
  });

export const confirmPendingTransaction = async (
  id: string,
  updates?: PendingTransactionUpdate,
) => requireAndroidModule().confirmTransaction(id, updates);

export const ignorePendingTransaction = async (id: string) =>
  requireAndroidModule().ignoreTransaction(id);

export const updatePendingTransaction = async (
  id: string,
  updates: PendingTransactionUpdate,
) => requireAndroidModule().updatePendingTransaction(id, updates);

export const simulateIncomingSms = async (sender: string, messageBody: string) =>
  requireAndroidModule().simulateIncomingSms(sender, messageBody);

export const scanRecentSms = async (limit = 10) =>
  requireAndroidModule().scanRecentSms(limit);
