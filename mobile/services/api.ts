export type MemoryKind = 'note' | 'task' | 'work_done' | 'requirement' | 'credential';

export type ProjectStatus = 'active' | 'paused' | 'completed' | 'archived';

export type Project = {
  _id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  tags: string[];
  source: string;
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
  kind: MemoryKind;
  projectId?: string | Project;
  reminderAt?: string;
  notificationEnabled?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CreateMemoryInput = {
  title: string;
  content?: string;
  category?: string;
  tags?: string[];
  kind?: MemoryKind;
  projectId?: string;
  reminderAt?: string;
  notificationEnabled?: boolean;
};

export type CreateProjectInput = {
  name: string;
  description?: string;
  tags?: string[];
};

type ListResponse = {
  count: number;
  data: Memory[];
};

type SingleResponse = {
  data: Memory;
};

type ProjectListResponse = {
  count: number;
  data: Project[];
};

type SingleProjectResponse = {
  data: Project;
};

type ProjectMemoriesResponse = {
  count: number;
  project: Project;
  data: Memory[];
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

const getApiConfig = () => {
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
    memoriesUrl: `${apiRoot}/api/memories`,
    projectsUrl: `${apiRoot}/api/projects`
  };
};

const request = async <T>(
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
  const body = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(body?.error || body?.message || `Request failed with status ${response.status}`);
  }

  return body as T;
};

export const listMemories = async () => {
  const { memoriesUrl } = getApiConfig();
  const response = await request<ListResponse>(memoriesUrl, '');
  return response.data;
};

export const searchMemories = async (query: string) => {
  const { memoriesUrl } = getApiConfig();
  const response = await request<ListResponse>(
    memoriesUrl,
    `/search?q=${encodeURIComponent(query)}`
  );
  return response.data;
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

export const listProjects = async () => {
  const { projectsUrl } = getApiConfig();
  const response = await request<ProjectListResponse>(projectsUrl, '');
  return response.data;
};

export const createProject = async (input: CreateProjectInput) => {
  const { projectsUrl } = getApiConfig();
  const response = await request<SingleProjectResponse>(projectsUrl, '', {
    method: 'POST',
    body: JSON.stringify(input)
  });

  return response.data;
};

export const getProject = async (id: string) => {
  const { projectsUrl } = getApiConfig();
  const response = await request<SingleProjectResponse>(projectsUrl, `/${id}`);
  return response.data;
};

export const listProjectMemories = async (id: string) => {
  const { projectsUrl } = getApiConfig();
  const response = await request<ProjectMemoriesResponse>(projectsUrl, `/${id}/memories`);
  return response.data;
};
