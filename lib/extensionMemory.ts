import mongoose from 'mongoose';

import { getFallbackTitle } from '@/lib/titleFallback';
import Memory from '@/models/Memory';
import Project from '@/models/Project';

export type ExtensionSaveType = 'memory' | 'log' | 'note' | 'task' | 'project' | 'reminder';

export type ExtensionSource = {
  type: 'chrome_extension';
  title: string;
  url: string;
  capturedAt: string;
};

type ExtensionPayload = {
  type?: unknown;
  content?: unknown;
  note?: unknown;
  projectId?: unknown;
  source?: unknown;
  title?: unknown;
};

type MemoryKind = 'note' | 'task' | 'work_done' | 'requirement' | 'credential';

export class ExtensionRequestError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'ExtensionRequestError';
    this.status = status;
  }
}

export const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Internal server error';

const SAVE_TYPES = new Set<ExtensionSaveType>([
  'memory',
  'log',
  'note',
  'task',
  'project',
  'reminder'
]);

const getString = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const normalizeType = (value: unknown): ExtensionSaveType => {
  const type = getString(value).toLowerCase();

  return SAVE_TYPES.has(type as ExtensionSaveType) ? (type as ExtensionSaveType) : 'note';
};

const getTypeConfig = (type: ExtensionSaveType): { category: string; kind: MemoryKind } => {
  switch (type) {
    case 'memory':
      return { category: 'general', kind: 'note' };
    case 'log':
      return { category: 'log', kind: 'work_done' };
    case 'task':
      return { category: 'work', kind: 'task' };
    case 'project':
      return { category: 'project', kind: 'requirement' };
    case 'reminder':
      return { category: 'reminder', kind: 'credential' };
    default:
      return { category: 'web', kind: 'note' };
  }
};

const normalizeSource = (value: unknown): ExtensionSource => {
  const source = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const capturedAt = getString(source.capturedAt) || new Date().toISOString();

  return {
    type: 'chrome_extension',
    title: getString(source.title),
    url: getString(source.url),
    capturedAt
  };
};

const normalizeProjectId = (value: unknown) => {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }

  const projectId = getString(value);

  if (!projectId || !mongoose.Types.ObjectId.isValid(projectId)) {
    throw new ExtensionRequestError('Invalid project id');
  }

  return projectId;
};

const buildContent = (
  content: string,
  note: string,
  source: ExtensionSource
) =>
  [
    content,
    note ? `Note: ${note}` : '',
    source.title ? `Page: ${source.title}` : '',
    source.url ? `URL: ${source.url}` : '',
    `Captured: ${source.capturedAt}`
  ]
    .filter(Boolean)
    .join('\n\n');

const assertProjectExists = async (projectId: string | undefined) => {
  if (!projectId) {
    return;
  }

  const project = await Project.findById(projectId).select('_id').lean();

  if (!project) {
    throw new ExtensionRequestError('Project not found', 404);
  }
};

export const createExtensionMemory = async (payload: ExtensionPayload) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new ExtensionRequestError('Invalid request body');
  }

  const type = normalizeType(payload.type);
  const title = getString(payload.title);
  const content = getString(payload.content);
  const note = getString(payload.note);
  const projectId = normalizeProjectId(payload.projectId);
  const source = normalizeSource(payload.source);

  if (!content && !note && !source.title && !source.url) {
    throw new ExtensionRequestError('Nothing to save');
  }

  await assertProjectExists(projectId);

  const config = getTypeConfig(type);
  const capturedDate = new Date(source.capturedAt);
  const memoryContent = buildContent(content, note, source);
  const titleSource =
    [content, note, source.title].filter(Boolean).join('\n\n') ||
    source.url ||
    `${type === 'project' ? 'Project note' : type} from Chrome`;
  const fallbackType =
    type === 'task'
      ? 'task'
      : type === 'reminder'
        ? 'reminder'
        : type === 'log'
          ? 'log'
          : 'note';
  const memory = await Memory.create({
    title: title || getFallbackTitle(titleSource, fallbackType),
    content: memoryContent,
    category: config.category,
    kind: config.kind,
    tags: ['chrome-extension', type],
    source: 'chrome_extension',
    sourceTitle: source.title,
    sourceUrl: source.url,
    capturedAt: Number.isNaN(capturedDate.getTime()) ? new Date() : capturedDate,
    projectId
  });

  return Memory.findById(memory._id).populate('projectId', 'name description status').lean();
};
