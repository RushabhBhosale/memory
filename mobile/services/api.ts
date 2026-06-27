export type MemoryKind = 'note' | 'task' | 'work_done' | 'requirement' | 'credential';

export type ActivityType = 'memory' | 'task' | 'note' | 'meeting' | 'expense';
export type SaveItemType = 'memory' | 'log' | 'task' | 'note' | 'meeting' | 'reminder';
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
  reminderType?: 'time' | 'location';
  triggerType?: 'enter' | 'exit';
  placeId?: string;
  placeName?: string;
  latitude?: number;
  longitude?: number;
  radiusMeters?: number;
  status?: 'pending' | 'triggered' | 'completed';
  triggeredAt?: string;
  importance?: number;
  createdAt: string;
  updatedAt: string;
};

export type ActivityItem = Memory & {
  amount?: number;
  currency?: string;
  deviceExpenseId?: string;
  merchant?: string;
  originalSmsPreview?: string;
  timestamp?: string;
  transactionType?: 'expense' | 'income';
  status?: string;
  type: ActivityType;
};

export type AskMemoryPlan = {
  keywords: string[];
  types: SaveItemType[];
  timeframe: 'today' | 'tomorrow' | 'this_week' | 'this_month' | 'upcoming' | 'all_time';
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
  reminderType?: 'time' | 'location';
  triggerType?: 'enter' | 'exit';
  placeId?: string;
  placeName?: string;
  latitude?: number;
  longitude?: number;
  radiusMeters?: number;
  status?: 'pending' | 'triggered' | 'completed';
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
    | 'dismissed'
    | 'extractedText'
    | 'generatedCategory'
    | 'generatedTags'
    | 'generatedTitle'
    | 'memoryId'
    | 'processed'
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
  source: 'sms' | 'manual';
  timestamp: string;
  type: 'expense' | 'income';
};

export type RemoteExpense = RemoteExpenseInput & {
  _id: string;
  createdAt: string;
  updatedAt: string;
};

type ExpenseListResponse = {
  count: number;
  data: RemoteExpense[];
};

const getApiRoot = (value: string) => {
  const baseUrl = value.replace(/\/$/, '');

  if (baseUrl.endsWith('/api/memories')) {
    return baseUrl.slice(0, -'/api/memories'.length);
  }

  if (baseUrl.endsWith('/api')) {
    return baseUrl.slice(0, -'/api'.length);
  }

  return baseUrl;
};

export const getApiConfig = () => {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL;
  const apiKey = process.env.EXPO_PUBLIC_MEMORY_API_KEY;

  if (!apiUrl) {
    throw new Error('EXPO_PUBLIC_API_URL is not set');
  }

  if (!apiKey) {
    throw new Error('EXPO_PUBLIC_MEMORY_API_KEY is not set');
  }

  const apiRoot = getApiRoot(apiUrl);

  return {
    apiKey,
    askMemoryUrl: `${apiRoot}/api/ask-memory`,
    activityUrl: `${apiRoot}/api/activity`,
    desktopActivityUrl: `${apiRoot}/api/desktop-activity`,
    expensesUrl: `${apiRoot}/api/expenses`,
    locationPlacesUrl: `${apiRoot}/api/location/places`,
    locationTimelineUrl: `${apiRoot}/api/location/timeline`,
    memoriesUrl: `${apiRoot}/api/memories`,
    screenshotsUrl: `${apiRoot}/api/screenshots`
  };
};

export const request = async <T>(
  baseUrl: string,
  path: string,
  options: RequestInit = {}
): Promise<T> => {
  const { apiKey } = getApiConfig();
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      ...options.headers
    }
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
      (typeof errorBody?.error === 'string' && errorBody.error) ||
      (typeof errorBody?.message === 'string' && errorBody.message) ||
      `Request failed with status ${response.status}`;

    throw new Error(message);
  }

  return body as T;
};

export const listMemories = async () => {
  const { memoriesUrl } = getApiConfig();
  const response = await request<ListResponse>(memoriesUrl, '');
  return response.data;
};

export const listActivity = async (params?: { from?: string; limit?: number; to?: string }) => {
  const { activityUrl } = getApiConfig();
  const searchParams = new URLSearchParams();

  if (params?.from) {
    searchParams.set('from', params.from);
  }

  if (params?.to) {
    searchParams.set('to', params.to);
  }

  if (params?.limit) {
    searchParams.set('limit', String(params.limit));
  }

  const query = searchParams.toString();
  const response = await request<ActivityListResponse>(activityUrl, query ? `?${query}` : '');

  return response.data;
};

export const listDesktopActivity = async (params?: { limit?: number }) => {
  const { desktopActivityUrl } = getApiConfig();
  const searchParams = new URLSearchParams();

  if (params?.limit) {
    searchParams.set('limit', String(params.limit));
  }

  const query = searchParams.toString();
  const response = await request<DesktopActivityListResponse>(
    desktopActivityUrl,
    query ? `?${query}` : ''
  );

  return response.data;
};

export const upsertExpense = async (input: RemoteExpenseInput) => {
  const { expensesUrl } = getApiConfig();
  const response = await request<{ data: unknown }>(expensesUrl, '', {
    method: 'POST',
    body: JSON.stringify(input)
  });

  return response.data;
};

export const listRemoteExpenses = async () => {
  const { expensesUrl } = getApiConfig();
  const response = await request<ExpenseListResponse>(expensesUrl, '');

  return response.data;
};

export const deleteRemoteExpense = async (deviceExpenseId: string) => {
  const { expensesUrl } = getApiConfig();
  await request<{ message: string }>(
    expensesUrl,
    `/${encodeURIComponent(deviceExpenseId)}`,
    {
      method: 'DELETE'
    }
  );
};

export const getActivityItem = async (type: ActivityType, id: string) => {
  const { activityUrl } = getApiConfig();
  const response = await request<SingleActivityResponse>(
    activityUrl,
    `/${encodeURIComponent(type)}/${encodeURIComponent(id)}`
  );

  return response.data;
};

export const deleteActivityItem = async (type: ActivityType, id: string) => {
  const { activityUrl } = getApiConfig();

  await request<{ message: string; data: ActivityItem }>(
    activityUrl,
    `/${encodeURIComponent(type)}/${encodeURIComponent(id)}`,
    {
      method: 'DELETE'
    }
  );
};

export const searchMemories = async (query: string) => {
  const { memoriesUrl } = getApiConfig();
  const response = await request<ListResponse>(
    memoriesUrl,
    `/search?q=${encodeURIComponent(query)}`
  );
  return response.data;
};

export const searchActivity = async (query: string) => {
  const { activityUrl } = getApiConfig();
  const response = await request<ActivityListResponse>(
    activityUrl,
    `/search?q=${encodeURIComponent(query)}`
  );
  return response.data;
};

export const askMemory = async (query: string) => {
  const { askMemoryUrl } = getApiConfig();
  return request<AskMemoryResponse>(askMemoryUrl, '', {
    method: 'POST',
    body: JSON.stringify({ query })
  });
};

export const getMemory = async (id: string) => {
  const { memoriesUrl } = getApiConfig();
  const response = await request<SingleResponse>(memoriesUrl, `/${id}`);
  return response.data;
};

export const createMemory = async (input: CreateMemoryInput) => {
  const { memoriesUrl } = getApiConfig();
  const response = await request<SingleResponse>(memoriesUrl, '', {
    method: 'POST',
    body: JSON.stringify(input)
  });

  return response.data;
};

export const deleteMemory = async (id: string) => {
  const { memoriesUrl } = getApiConfig();
  await request<{ message: string; data: Memory }>(memoriesUrl, `/${id}`, {
    method: 'DELETE'
  });
};

export const updateMemory = async (id: string, input: Partial<CreateMemoryInput>) => {
  const { memoriesUrl } = getApiConfig();
  const response = await request<SingleResponse>(memoriesUrl, `/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input)
  });

  return response.data;
};

export const listScreenshotInbox = async (params?: { includeDismissed?: boolean }) => {
  const { screenshotsUrl } = getApiConfig();
  const query = params?.includeDismissed ? '?includeDismissed=true' : '';
  const response = await request<ScreenshotInboxListResponse>(screenshotsUrl, query);
  return response.data;
};

export const createScreenshotInboxItem = async (input: ScreenshotInboxInput) => {
  const { screenshotsUrl } = getApiConfig();
  const response = await request<ScreenshotInboxSingleResponse>(screenshotsUrl, '', {
    method: 'POST',
    body: JSON.stringify(input)
  });

  return response.data;
};

export const updateScreenshotInboxItem = async (id: string, input: ScreenshotInboxUpdate) => {
  const { screenshotsUrl } = getApiConfig();
  const response = await request<ScreenshotInboxSingleResponse>(
    screenshotsUrl,
    `/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(input)
    }
  );

  return response.data;
};

export const deleteScreenshotInboxItem = async (id: string) => {
  const { screenshotsUrl } = getApiConfig();
  await request<{ message: string; data: ScreenshotInboxItem }>(
    screenshotsUrl,
    `/${encodeURIComponent(id)}`,
    {
      method: 'DELETE'
    }
  );
};
