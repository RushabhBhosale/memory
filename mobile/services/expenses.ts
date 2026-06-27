import { NativeEventEmitter, NativeModules, Platform } from "react-native";

import {
  deleteRemoteExpense,
  listRemoteExpenses,
  upsertExpense,
  type RemoteExpense,
  type RemoteExpenseInput,
} from "./api";

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
  deleteExpense?: (id: string) => Promise<boolean>;
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

const listLocalExpenses = async () => requireAndroidModule().listExpenses();

const getTimestamp = (value: string | number | undefined) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) ? timestamp : Date.now();
  }

  return Date.now();
};

const toExpenseEntryFromRemote = (expense: RemoteExpense): ExpenseEntry => ({
  amount: expense.amount,
  category: expense.category || "general",
  createdAt: getTimestamp(expense.createdAt),
  currency: expense.currency || "INR",
  id: expense.deviceExpenseId || expense._id,
  merchant: expense.merchant || "Unknown Merchant",
  originalSmsPreview: expense.originalSmsPreview || "",
  source: expense.source === "sms" ? "sms" : "manual",
  timestamp: getTimestamp(expense.timestamp),
  type: expense.type === "income" ? "income" : "expense",
});

const mergeExpenses = (localExpenses: ExpenseEntry[], remoteExpenses: ExpenseEntry[]) => {
  const byId = new Map<string, ExpenseEntry>();

  remoteExpenses.forEach((expense) => {
    byId.set(expense.id, expense);
  });

  localExpenses.forEach((expense) => {
    byId.set(expense.id, expense);
  });

  return [...byId.values()].sort((a, b) => b.timestamp - a.timestamp);
};

export const listExpenses = async () => {
  const localPromise =
    Platform.OS === "android" && nativeModule ? listLocalExpenses() : Promise.resolve([]);
  const [localResult, remoteResult] = await Promise.allSettled([
    localPromise,
    listRemoteExpenses(),
  ]);

  const localExpenses = localResult.status === "fulfilled" ? localResult.value : [];
  const remoteExpenses =
    remoteResult.status === "fulfilled"
      ? remoteResult.value.map(toExpenseEntryFromRemote)
      : [];

  return mergeExpenses(localExpenses, remoteExpenses);
};

const toRemoteExpenseInput = (expense: ExpenseEntry): RemoteExpenseInput => ({
  amount: expense.amount,
  category: expense.category || "general",
  currency: expense.currency || "INR",
  deviceExpenseId: expense.id,
  merchant: expense.merchant || "Unknown Merchant",
  originalSmsPreview: expense.originalSmsPreview || "",
  source: expense.source,
  timestamp: new Date(expense.timestamp).toISOString(),
  type: expense.type,
});

export const syncExpensesToMongo = async (expenses?: ExpenseEntry[]) => {
  const localExpenses = expenses ?? (await listLocalExpenses());

  await Promise.allSettled(
    localExpenses.map((expense) => upsertExpense(toRemoteExpenseInput(expense))),
  );

  return localExpenses;
};

export const addManualExpense = async (input: ManualExpenseInput) =>
  requireAndroidModule().addManualExpense({
    currency: "INR",
    type: "expense",
    ...input,
  });

export const deleteExpense = async (id: string) => {
  const module = Platform.OS === "android" ? nativeModule : undefined;
  let deletedLocal = false;

  if (module?.deleteExpense) {
    deletedLocal = await module.deleteExpense(id);
  }

  try {
    await deleteRemoteExpense(id);
    return true;
  } catch (error) {
    if (deletedLocal) {
      return true;
    }

    if (!module?.deleteExpense) {
      throw new Error("Delete requires a rebuilt Android app. Reinstall the latest APK and try again.");
    }

    return false;
  }
};

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

export const subscribeToExpenseChanges = (listener: () => void) => {
  if (Platform.OS !== "android" || !nativeModule) {
    return { remove: () => undefined };
  }

  const emitter = new NativeEventEmitter(NativeModules.ExpenseSmsModule);
  return emitter.addListener("MemoryOSExpensesChanged", listener);
};
