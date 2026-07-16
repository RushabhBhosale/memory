import { getExpenseSessionToken } from "./auth";

export type MemoryKind =
  | "note"
  | "task"
  | "work_done"
  | "requirement"
  | "credential"
  | "daily_summary";

export type ActivityType =
  | "memory"
  | "task"
  | "note"
  | "meeting"
  | "expense"
  | "daily_summary";
export type SaveItemType =
  | "memory"
  | "log"
  | "task"
  | "note"
  | "meeting"
  | "reminder";
export type DesktopActivity = {
  _id: string;
  date: string;
  title: string;
  summary: string;
  codingMinutes: number;
  productiveMinutes: number;
  idleMinutes: number;
  productivityScore: number;
  appBreakdown: Array<{ appName: string; durationMinutes: number }>;
  source: string;
  deviceLabel?: string;
  createdAt: string;
  updatedAt: string;
};

export type Memory = {
  _id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  source: string;
  screenshotUri?: string;
  capturedAt?: string;
  kind: MemoryKind;
  reminderAt?: string;
  notificationEnabled?: boolean;
  reminderType?: "time";
  status?: "pending" | "triggered" | "completed";
  triggeredAt?: string;
  importance?: number;
  createdAt: string;
  updatedAt: string;
};

export type DailySummaryTopic = {
  project: string;
  status: string;
  summary: string;
  tags: string[];
  title: string;
};

export type DailySummaryTask = {
  project: string;
  status: string;
  task: string;
};

export type DailySummary = {
  _id: string;
  bodyMarkdown: string;
  createdAt: string;
  date: string;
  decisions: string[];
  keyQuestions: string[];
  projects: string[];
  source: string;
  summary: string;
  tags: string[];
  tasks: DailySummaryTask[];
  title: string;
  topics: DailySummaryTopic[];
  type: "daily_summary";
  updatedAt: string;
};

export type ActivityItem = Memory & {
  amount?: number;
  currency?: string;
  deviceExpenseId?: string;
  merchant?: string;
  originalSmsPreview?: string;
  timestamp?: string;
  transactionType?: "expense" | "income";
  bodyMarkdown?: string;
  date?: string;
  decisions?: string[];
  keyQuestions?: string[];
  projects?: string[];
  summary?: string;
  tasks?: DailySummaryTask[];
  topics?: DailySummaryTopic[];
  status?: string;
  type: ActivityType;
};

export type AskMemoryPlan = {
  keywords: string[];
  types: SaveItemType[];
  timeframe:
    | "today"
    | "tomorrow"
    | "this_week"
    | "this_month"
    | "past_months"
    | "upcoming"
    | "all_time";
  monthsBack?: number;
};

export type AskMemoryResponse = {
  answer: string;
  count: number;
  plan: AskMemoryPlan;
  sources: ActivityItem[];
  summary: string[];
};

export type CreateMemoryInput = {
  title?: string;
  content?: string;
  category?: string;
  type?: SaveItemType;
  tags?: string[];
  kind?: MemoryKind;
  reminderAt?: string;
  notificationEnabled?: boolean;
  reminderType?: "time";
  status?: "pending" | "triggered" | "completed";
  triggeredAt?: string;
  importance?: number;
  capturedAt?: string;
  screenshotUri?: string;
  source?: string;
};

type ListResponse = {
  count: number;
  data: Memory[];
};

type ActivityListResponse = {
  count: number;
  data: ActivityItem[];
};

type SingleActivityResponse = {
  data: ActivityItem;
};

type SingleResponse = {
  data: Memory;
};

type DesktopActivityListResponse = {
  count: number;
  data: DesktopActivity[];
};

type DailySummaryListResponse = {
  count: number;
  data: DailySummary[];
};

type DailySummarySingleResponse = {
  data: DailySummary;
};

export type DailyBriefSyncResponse = {
  data: DailySummary;
  date: string;
  message: string;
  source: string;
};

export type ScreenshotInboxItem = {
  _id: string;
  imageUri: string;
  capturedAt: string;
  processed: boolean;
  dismissed: boolean;
  extractedText: string;
  generatedTitle: string;
  generatedTags: string[];
  generatedCategory: string;
  memoryId?: string;
  source: string;
  createdAt: string;
  updatedAt: string;
};

export type ScreenshotInboxInput = {
  imageUri: string;
  capturedAt: string;
  processed?: boolean;
  dismissed?: boolean;
  extractedText?: string;
  generatedTitle?: string;
  generatedTags?: string[];
  generatedCategory?: string;
  source?: string;
};

export type ScreenshotInboxUpdate = Partial<
  Pick<
    ScreenshotInboxItem,
    | "dismissed"
    | "extractedText"
    | "generatedCategory"
    | "generatedTags"
    | "generatedTitle"
    | "memoryId"
    | "processed"
  >
>;

type ScreenshotInboxListResponse = {
  count: number;
  data: ScreenshotInboxItem[];
};

type ScreenshotInboxSingleResponse = {
  data: ScreenshotInboxItem;
};

export type RemoteExpenseInput = {
  amount: number;
  category: string;
  currency: string;
  deviceExpenseId: string;
  merchant: string;
  note?: string;
  originalSmsPreview?: string;
  source: "sms" | "manual";
  timestamp: string;
  type: "expense" | "income";
};

export type RemoteExpense = RemoteExpenseInput & {
  _id: string;
  createdAt: string;
  updatedAt: string;
  userId: string;
};

export type BillAiExtraction = {
  amount: number | null;
  category: string;
  confidence: number;
  evidence: string;
  merchant: string;
};

type ExpenseListResponse = {
  count: number;
  data: RemoteExpense[];
  hasMore: boolean;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type RemoteExpensePage = ExpenseListResponse;

const getApiRoot = (value: string) => {
  const baseUrl = value.replace(/\/$/, "");

  if (baseUrl.endsWith("/api/memories")) {
    return baseUrl.slice(0, -"/api/memories".length);
  }

  if (baseUrl.endsWith("/api")) {
    return baseUrl.slice(0, -"/api".length);
  }

  return baseUrl;
};

export const getApiConfig = () => {
  const apiUrl = "https://memory-green-kappa.vercel.app";

  if (!apiUrl) {
    throw new Error("EXPO_PUBLIC_API_URL is not set");
  }

  const apiRoot = getApiRoot(apiUrl);

  return {
    apiRoot,
    askMemoryUrl: `${apiRoot}/api/ask-memory`,
    activityUrl: `${apiRoot}/api/activity`,
    assistantCommandUrl: `${apiRoot}/api/assistant/command`,
    chatGptDailyBriefSyncUrl: `${apiRoot}/api/integrations/chatgpt-daily-brief/sync`,
    dailySummaryUrl: `${apiRoot}/api/memories/daily-summary`,
    desktopActivityUrl: `${apiRoot}/api/desktop-activity`,
    expensesUrl: `${apiRoot}/api/expenses`,
    loginUrl: `${apiRoot}/api/auth/login`,
    memoriesUrl: `${apiRoot}/api/memories`,
    screenshotsUrl: `${apiRoot}/api/screenshots`,
  };
};

export const request = async <T>(
  baseUrl: string,
  path: string,
  options: RequestInit = {},
): Promise<T> => {
  const sessionToken = await getExpenseSessionToken();
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(sessionToken ? { "x-expense-session": sessionToken } : {}),
      ...options.headers,
    },
  });

  const text = await response.text();
  let body: unknown = null;

  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { message: text };
    }
  }

  if (!response.ok) {
    const errorBody = body as { error?: unknown; message?: unknown } | null;
    const message =
      (typeof errorBody?.error === "string" && errorBody.error) ||
      (typeof errorBody?.message === "string" && errorBody.message) ||
      `Request failed with status ${response.status}`;

    throw new Error(message);
  }

  return body as T;
};

export const listMemories = async () => {
  const { memoriesUrl } = getApiConfig();
  const response = await request<ListResponse>(memoriesUrl, "");
  return response;
};

export const listActivity = async (params?: {
  from?: string;
  limit?: number;
  to?: string;
}) => {
  const { activityUrl } = getApiConfig();
  const searchParams = new URLSearchParams();

  if (params?.from) {
    searchParams.set("from", params.from);
  }

  if (params?.to) {
    searchParams.set("to", params.to);
  }

  if (params?.limit) {
    searchParams.set("limit", String(params.limit));
  }

  const query = searchParams.toString();
  const response = await request<ActivityListResponse>(
    activityUrl,
    query ? `?${query}` : "",
  );

  return response.data;
};

export const listDesktopActivity = async (params?: { limit?: number }) => {
  const { desktopActivityUrl } = getApiConfig();
  const searchParams = new URLSearchParams();

  if (params?.limit) {
    searchParams.set("limit", String(params.limit));
  }

  const query = searchParams.toString();
  const response = await request<DesktopActivityListResponse>(
    desktopActivityUrl,
    query ? `?${query}` : "",
  );

  return response.data;
};

export const listDailySummaries = async (params?: {
  from?: string;
  limit?: number;
  project?: string;
  q?: string;
  source?: string;
  tag?: string;
  to?: string;
}) => {
  const { dailySummaryUrl } = getApiConfig();
  const searchParams = new URLSearchParams();

  if (params?.from) {
    searchParams.set("from", params.from);
  }

  if (params?.limit) {
    searchParams.set("limit", String(params.limit));
  }

  if (params?.project) {
    searchParams.set("project", params.project);
  }

  if (params?.q) {
    searchParams.set("q", params.q);
  }

  if (params?.source) {
    searchParams.set("source", params.source);
  }

  if (params?.tag) {
    searchParams.set("tag", params.tag);
  }

  if (params?.to) {
    searchParams.set("to", params.to);
  }

  const query = searchParams.toString();
  const response = await request<DailySummaryListResponse>(
    dailySummaryUrl,
    query ? `?${query}` : "",
  );

  return response.data;
};

export const getDailySummary = async (date: string) => {
  const { dailySummaryUrl } = getApiConfig();
  const response = await request<DailySummarySingleResponse>(
    dailySummaryUrl,
    `/${encodeURIComponent(date)}`,
  );

  return response.data;
};

export const syncChatGptDailyBrief = async (date?: string) => {
  const { chatGptDailyBriefSyncUrl } = getApiConfig();
  const apiKey = process.env.EXPO_PUBLIC_MEMORY_API_KEY;
  const response = await request<DailyBriefSyncResponse>(
    chatGptDailyBriefSyncUrl,
    "",
    {
      body: JSON.stringify(date ? { date } : {}),
      headers: apiKey ? { "x-api-key": apiKey } : undefined,
      method: "POST",
    },
  );

  return response;
};

export const upsertExpense = async (input: RemoteExpenseInput) => {
  const { expensesUrl } = getApiConfig();
  const response = await request<{ data: RemoteExpense }>(expensesUrl, "", {
    method: "POST",
    body: JSON.stringify(input),
  });

  return response.data;
};

export const loginExpenseUser = async (username: string, password: string) => {
  const { loginUrl } = getApiConfig();
  const response = await request<{
    data: {
      token: string;
      user: { id: string; username: string };
    };
  }>(loginUrl, "", {
    body: JSON.stringify({ password, username }),
    method: "POST",
  });

  return response.data;
};

export const parseBillImageWithAi = async (imageDataUri: string) => {
  const { expensesUrl } = getApiConfig();
  const response = await request<{ data: BillAiExtraction }>(expensesUrl, "/parse-bill", {
    method: "POST",
    body: JSON.stringify({ imageDataUri }),
  });

  return response.data;
};

export const listRemoteExpenses = async (params?: { limit?: number; page?: number }) => {
  const { expensesUrl } = getApiConfig();
  const searchParams = new URLSearchParams();
  searchParams.set("limit", String(Math.min(Math.max(params?.limit || 50, 1), 100)));
  searchParams.set("page", String(Math.max(params?.page || 1, 1)));
  const response = await request<ExpenseListResponse>(expensesUrl, `?${searchParams.toString()}`);

  return response;
};

export const deleteRemoteExpense = async (deviceExpenseId: string) => {
  const { expensesUrl } = getApiConfig();
  await request<{ message: string }>(
    expensesUrl,
    `/${encodeURIComponent(deviceExpenseId)}`,
    {
      method: "DELETE",
    },
  );
};

export const getActivityItem = async (type: ActivityType, id: string) => {
  const { activityUrl } = getApiConfig();
  const response = await request<SingleActivityResponse>(
    activityUrl,
    `/${encodeURIComponent(type)}/${encodeURIComponent(id)}`,
  );

  return response.data;
};

export const updateActivityItem = async (
  type: Exclude<ActivityType, "expense">,
  id: string,
  input: Partial<CreateMemoryInput>,
) => {
  const { activityUrl } = getApiConfig();
  const response = await request<SingleActivityResponse>(
    activityUrl,
    `/${encodeURIComponent(type)}/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  );

  return response.data;
};

export const deleteActivityItem = async (type: ActivityType, id: string) => {
  const { activityUrl } = getApiConfig();

  await request<{ message: string; data: ActivityItem }>(
    activityUrl,
    `/${encodeURIComponent(type)}/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
    },
  );
};

export const searchMemories = async (query: string) => {
  const { memoriesUrl } = getApiConfig();
  const response = await request<ListResponse>(
    memoriesUrl,
    `/search?q=${encodeURIComponent(query)}`,
  );
  return response.data;
};

export const searchActivity = async (query: string) => {
  const { activityUrl } = getApiConfig();
  const response = await request<ActivityListResponse>(
    activityUrl,
    `/search?q=${encodeURIComponent(query)}`,
  );
  return response.data;
};

export const askMemory = async (query: string) => {
  const { askMemoryUrl } = getApiConfig();
  return request<AskMemoryResponse>(askMemoryUrl, "", {
    method: "POST",
    body: JSON.stringify({ query }),
  });
};

export const getMemory = async (id: string) => {
  const { memoriesUrl } = getApiConfig();
  const response = await request<SingleResponse>(memoriesUrl, `/${id}`);
  return response.data;
};

export const createMemory = async (input: CreateMemoryInput) => {
  const { memoriesUrl } = getApiConfig();
  const response = await request<SingleResponse>(memoriesUrl, "", {
    method: "POST",
    body: JSON.stringify(input),
  });

  return response.data;
};

export const deleteMemory = async (id: string) => {
  const { memoriesUrl } = getApiConfig();
  await request<{ message: string; data: Memory }>(memoriesUrl, `/${id}`, {
    method: "DELETE",
  });
};

export const updateMemory = async (
  id: string,
  input: Partial<CreateMemoryInput>,
) => {
  const { memoriesUrl } = getApiConfig();
  const response = await request<SingleResponse>(memoriesUrl, `/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });

  return response.data;
};

export const listScreenshotInbox = async (params?: {
  includeDismissed?: boolean;
}) => {
  const { screenshotsUrl } = getApiConfig();
  const query = params?.includeDismissed ? "?includeDismissed=true" : "";
  const response = await request<ScreenshotInboxListResponse>(
    screenshotsUrl,
    query,
  );
  return response.data;
};

export const createScreenshotInboxItem = async (
  input: ScreenshotInboxInput,
) => {
  const { screenshotsUrl } = getApiConfig();
  const response = await request<ScreenshotInboxSingleResponse>(
    screenshotsUrl,
    "",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );

  return response.data;
};

export const updateScreenshotInboxItem = async (
  id: string,
  input: ScreenshotInboxUpdate,
) => {
  const { screenshotsUrl } = getApiConfig();
  const response = await request<ScreenshotInboxSingleResponse>(
    screenshotsUrl,
    `/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  );

  return response.data;
};

export const deleteScreenshotInboxItem = async (id: string) => {
  const { screenshotsUrl } = getApiConfig();
  await request<{ message: string; data: ScreenshotInboxItem }>(
    screenshotsUrl,
    `/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
    },
  );
};
