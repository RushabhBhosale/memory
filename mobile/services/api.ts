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
  content: string;
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

const getApiConfig = () => {
  const baseUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
  const apiKey = process.env.EXPO_PUBLIC_MEMORY_API_KEY;

  if (!baseUrl) {
    throw new Error('EXPO_PUBLIC_API_URL is not set');
  }

  if (!apiKey) {
    throw new Error('EXPO_PUBLIC_MEMORY_API_KEY is not set');
  }

  return { baseUrl, apiKey };
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
    throw new Error(body?.message || `Request failed with status ${response.status}`);
  }

  return body as T;
};

export const listMemories = async () => {
  const response = await request<ListResponse>('/api/memories');
  return response.data;
};

export const searchMemories = async (query: string) => {
  const response = await request<ListResponse>(
    `/api/memories/search?q=${encodeURIComponent(query)}`
  );
  return response.data;
};

export const getMemory = async (id: string) => {
  const response = await request<SingleResponse>(`/api/memories/${id}`);
  return response.data;
};

export const createMemory = async (input: CreateMemoryInput) => {
  const response = await request<SingleResponse>('/api/memories', {
    method: 'POST',
    body: JSON.stringify(input)
  });

  return response.data;
};

export const deleteMemory = async (id: string) => {
  await request<{ message: string; data: Memory }>(`/api/memories/${id}`, {
    method: 'DELETE'
  });
};
