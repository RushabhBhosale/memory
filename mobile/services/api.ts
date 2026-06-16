export type Memory = {
  _id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  source: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateMemoryInput = {
  title: string;
  content?: string;
  category?: string;
  tags?: string[];
};

type ListResponse = {
  count: number;
  data: Memory[];
};

type SingleResponse = {
  data: Memory;
};

const getMemoriesEndpoint = (value: string) => {
  const baseUrl = value.replace(/\/$/, '');

  return baseUrl.endsWith('/api/memories') ? baseUrl : `${baseUrl}/api/memories`;
};

const getApiConfig = () => {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL;
  const apiKey = process.env.EXPO_PUBLIC_MEMORY_API_KEY;

  if (!apiUrl) {
    throw new Error('EXPO_PUBLIC_API_URL is not set');
  }

  if (!apiKey) {
    throw new Error('EXPO_PUBLIC_MEMORY_API_KEY is not set');
  }

  return { baseUrl: getMemoriesEndpoint(apiUrl), apiKey };
};

const request = async <T>(path: string, options: RequestInit = {}): Promise<T> => {
  const { baseUrl, apiKey } = getApiConfig();
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      ...options.headers
    }
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(body?.error || body?.message || `Request failed with status ${response.status}`);
  }

  return body as T;
};

export const listMemories = async () => {
  const response = await request<ListResponse>('');
  return response.data;
};

export const searchMemories = async (query: string) => {
  const response = await request<ListResponse>(
    `/search?q=${encodeURIComponent(query)}`
  );
  return response.data;
};

export const getMemory = async (id: string) => {
  const response = await request<SingleResponse>(`/${id}`);
  return response.data;
};

export const createMemory = async (input: CreateMemoryInput) => {
  const response = await request<SingleResponse>('', {
    method: 'POST',
    body: JSON.stringify(input)
  });

  return response.data;
};

export const deleteMemory = async (id: string) => {
  await request<{ message: string; data: Memory }>(`/${id}`, {
    method: 'DELETE'
  });
};
