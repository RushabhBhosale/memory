import AsyncStorage from "@react-native-async-storage/async-storage";
import { NativeEventEmitter, NativeModules, Platform } from "react-native";

import {
  deleteRemoteExpense,
  listRemoteExpenses,
  upsertExpense,
  type RemoteExpense,
  type RemoteExpenseInput,
} from "./api";
import { getExpenseSession } from "./auth";

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
  classificationReason?: string;
  reviewRequired?: boolean;
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
  note?: string;
  type: ExpenseType;
  source: "sms" | "manual";
  originalSmsPreview: string;
  timestamp: number;
  createdAt: number;
  userId?: string;
};

export type ManualExpenseInput = {
  amount: number;
  category: string;
  currency?: string;
  id?: string;
  merchant: string;
  note?: string;
  timestamp?: number;
  type?: ExpenseType;
  userId?: string;
};

export type PendingTransactionUpdate = Partial<
  Pick<PendingTransaction, "amount" | "category" | "merchant" | "type">
>;

export type SimulateSmsResult =
  | { matched: false; reason: string }
  | { matched: true; reason: string; transaction: PendingTransaction };

export type ScanRecentSmsResult = {
  detected?: number;
  ignoredReasons: Record<string, number>;
  matched: number;
  pending: number;
  scanned: number;
};

export type SmsTrackingDebugStatus = {
  lastDetectedExpenseTime: number | null;
  lastProcessedSmsId: string | null;
  lastSmsScanTime: number | null;
  permissionGranted: boolean;
  receiverEnabled: boolean;
  totalExpensesDetectedFromSms: number;
  trackingEnabled: boolean;
  trackingStatus: "Running" | "Stopped";
};

export type SmsTrackingDebugMessage = {
  bodyPreview: string;
  id: string;
  matched: boolean;
  reason: string;
  sender: string;
  timestamp: number;
  transaction?: {
    amount: number;
    category: string;
    confidence: number;
    classificationReason?: string;
    currency: string;
    merchant: string;
    reviewRequired?: boolean;
    type: PendingTransactionType;
  };
};

export type SmsTrackingDebugTestResult = {
  matched: number;
  messages: SmsTrackingDebugMessage[];
  scanned: number;
};

type ExpenseSmsNativeModule = {
  addManualExpense(input: ManualExpenseInput): Promise<ExpenseEntry>;
  confirmTransaction(id: string, updates?: PendingTransactionUpdate): Promise<boolean>;
  deleteExpense?: (id: string) => Promise<boolean>;
  hasSmsPermissions(): Promise<boolean>;
  getTrackingDebugStatus?: () => Promise<SmsTrackingDebugStatus>;
  debugTestRecentSms?: (limit: number) => Promise<SmsTrackingDebugTestResult>;
  ignoreTransaction(id: string): Promise<boolean>;
  listExpenses(): Promise<ExpenseEntry[]>;
  setActiveExpenseUserId?: (userId: string) => Promise<void>;
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

const createExpenseId = () =>
  `manual-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

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

const LOCAL_EXPENSE_CACHE_KEY = "memonest.expense.cache";

const getCurrentUserId = async () => (await getExpenseSession())?.user.id || "main";

const getLocalOwnerId = (expense: ExpenseEntry) => expense.userId || "main";

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
  note: expense.note || "",
  originalSmsPreview: expense.originalSmsPreview || "",
  source: expense.source === "sms" ? "sms" : "manual",
  timestamp: getTimestamp(expense.timestamp),
  type: expense.type === "income" ? "income" : "expense",
  userId: expense.userId,
});

export const mergeExpenseEntries = (localExpenses: ExpenseEntry[], remoteExpenses: ExpenseEntry[]) => {
  const byId = new Map<string, ExpenseEntry>();

  remoteExpenses.forEach((expense) => {
    byId.set(expense.id, expense);
  });

  localExpenses.forEach((expense) => {
    byId.set(expense.id, expense);
  });

  return [...byId.values()].sort((a, b) => b.timestamp - a.timestamp);
};

const readExpenseCache = async () => {
  const raw = await AsyncStorage.getItem(LOCAL_EXPENSE_CACHE_KEY);

  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as ExpenseEntry[]) : [];
  } catch {
    return [];
  }
};

const writeExpenseCache = async (expenses: ExpenseEntry[]) => {
  await AsyncStorage.setItem(LOCAL_EXPENSE_CACHE_KEY, JSON.stringify(expenses));
};

export const listLocalExpenses = async () => {
  const userId = await getCurrentUserId();
  const nativeExpenses =
    Platform.OS === "android" && nativeModule ? await nativeModule.listExpenses() : [];
  const cachedExpenses = await readExpenseCache();

  return mergeExpenseEntries(
    [...nativeExpenses, ...cachedExpenses].filter((expense) => getLocalOwnerId(expense) === userId),
    [],
  );
};

export const listExpenses = async () => listLocalExpenses();

export const cacheRemoteExpenses = async (remoteExpenses: RemoteExpense[]) => {
  const cachedExpenses = await readExpenseCache();
  const nextExpenses = mergeExpenseEntries(
    cachedExpenses,
    remoteExpenses.map(toExpenseEntryFromRemote),
  );
  await writeExpenseCache(nextExpenses);
  return nextExpenses;
};

export const fetchRemoteExpensePage = async (page = 1, limit = 50) => {
  const response = await listRemoteExpenses({ limit, page });
  await cacheRemoteExpenses(response.data);
  return {
    ...response,
    data: response.data.map(toExpenseEntryFromRemote),
  };
};

const toRemoteExpenseInput = (expense: ExpenseEntry): RemoteExpenseInput => ({
  amount: expense.amount,
  category: expense.category || "general",
  currency: expense.currency || "INR",
  deviceExpenseId: expense.id,
  merchant: expense.merchant || "Unknown Merchant",
  note: expense.note || "",
  originalSmsPreview: expense.originalSmsPreview || "",
  source: expense.source,
  timestamp: new Date(expense.timestamp).toISOString(),
  type: expense.type,
});

export const syncExpensesToMongo = async (expenses?: ExpenseEntry[]) => {
  const localExpenses = expenses ?? (await listLocalExpenses());

  await Promise.all(
    localExpenses.map((expense) => upsertExpense(toRemoteExpenseInput(expense))),
  );

  return localExpenses;
};

export const addManualExpense = async (input: ManualExpenseInput) => {
  const userId = input.userId || (await getCurrentUserId());
  const normalizedInput = {
    currency: "INR",
    id: input.id || createExpenseId(),
    type: "expense" as ExpenseType,
    ...input,
    userId,
  };
  const now = Date.now();
  const created =
    Platform.OS === "android" && nativeModule
      ? await nativeModule.addManualExpense(normalizedInput)
      : {
          amount: normalizedInput.amount,
          category: normalizedInput.category || "general",
          createdAt: now,
          currency: normalizedInput.currency || "INR",
          id: normalizedInput.id,
          merchant: normalizedInput.merchant || "Unknown Merchant",
          note: normalizedInput.note || "",
          originalSmsPreview: normalizedInput.note || "",
          source: "manual" as const,
          timestamp: normalizedInput.timestamp || now,
          type: normalizedInput.type,
        };
  const normalizedCreated: ExpenseEntry = {
    ...created,
    id: normalizedInput.id,
    note: created.note || normalizedInput.note || "",
    userId,
  };

  const cachedExpenses = await readExpenseCache();
  await writeExpenseCache(mergeExpenseEntries(cachedExpenses, [normalizedCreated]));
  return normalizedCreated;
};

export const deleteExpense = async (id: string) => {
  const module = Platform.OS === "android" ? nativeModule : undefined;
  let deletedLocal = false;

  if (module?.deleteExpense) {
    deletedLocal = await module.deleteExpense(id);
  }

  const cachedExpenses = await readExpenseCache();
  await writeExpenseCache(cachedExpenses.filter((expense) => expense.id !== id));
  void deleteRemoteExpense(id).catch(() => undefined);

  if (deletedLocal || module?.deleteExpense || Platform.OS !== "android") {
    return true;
  }

  throw new Error("Delete requires a rebuilt Android app. Reinstall the latest APK and try again.");
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

export const scanRecentSms = async (limit = 100) =>
  requireAndroidModule().scanRecentSms(limit);

export const getSmsTrackingDebugStatus = async () => {
  const module = requireAndroidModule();

  if (!module.getTrackingDebugStatus) {
    throw new Error("SMS tracking diagnostics require a rebuilt Android app.");
  }

  return module.getTrackingDebugStatus();
};

export const testRecentSmsTracking = async (limit = 100) => {
  const module = requireAndroidModule();

  if (!module.debugTestRecentSms) {
    throw new Error("SMS tracking diagnostics require a rebuilt Android app.");
  }

  return module.debugTestRecentSms(limit);
};

export const subscribeToExpenseChanges = (listener: () => void) => {
  if (Platform.OS !== "android" || !nativeModule) {
    return { remove: () => undefined };
  }

  const emitter = new NativeEventEmitter(NativeModules.ExpenseSmsModule);
  return emitter.addListener("MemonestExpensesChanged", listener);
};
