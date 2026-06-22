import mongoose from 'mongoose';
import { NextResponse } from 'next/server';

import { validateApiKey } from '@/lib/apiKey';
import { connectDB } from '@/lib/mongodb';
import {
  buildCompactSearchContext,
  rankSearchCandidates,
  selectTopRankedResults,
  toCompactSearchResults,
  type SearchCandidate
} from '@/lib/searchRanking';
import { getFallbackTitle } from '@/lib/titleFallback';
import AssistantSession from '@/models/AssistantSession';
import Memory from '@/models/Memory';
import Project from '@/models/Project';
import ProjectMeeting from '@/models/ProjectMeeting';
import ProjectNote from '@/models/ProjectNote';
import ProjectTask from '@/models/ProjectTask';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type CommandBody = {
  category?: unknown;
  content?: unknown;
  input?: unknown;
  importance?: unknown;
  item?: unknown;
  metadata?: unknown;
  projectId?: unknown;
  reminderAt?: unknown;
  save?: unknown;
  sessionId?: unknown;
  tags?: unknown;
  title?: unknown;
  type?: unknown;
};

type ProjectLike = {
  _id: mongoose.Types.ObjectId | string;
  name: string;
  description?: string;
  status?: string;
};

type LastItemType = 'memory' | 'task' | 'note' | 'meeting';
type RawDocument = Record<string, unknown>;
type SaveItemType = 'memory' | 'log' | 'task' | 'note' | 'meeting' | 'reminder';
type LastSearchItemType = 'project' | LastItemType;

type SaveMetadata = {
  category?: string;
  content?: string;
  importance?: number;
  projectId?: string;
  reminderAt?: string;
  tags?: string[];
  title?: string;
  type?: SaveItemType;
};

const DEFAULT_SESSION_KEY = 'default';
const RECENT_LIMIT = 20;
const SEARCH_CANDIDATE_LIMIT = 500;
const SUMMARY_LIMIT = 8;
const DELETE_CHOICE_LIMIT = 10;
const SAVE_ITEM_TYPES = new Set<SaveItemType>([
  'memory',
  'log',
  'task',
  'note',
  'meeting',
  'reminder'
]);

const STOP_WORDS = new Set([
  'a',
  'about',
  'all',
  'and',
  'any',
  'are',
  'db',
  'do',
  'find',
  'for',
  'i',
  'in',
  'is',
  'know',
  'me',
  'my',
  'of',
  'on',
  'the',
  'this',
  'to',
  'what'
]);

const parseJsonBody = async (request: Request) => {
  try {
    return (await request.json()) as CommandBody;
  } catch {
    return null;
  }
};

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Internal server error';

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeWhitespace = (value: string) => value.replace(/\s+/g, ' ').trim();

const normalizeName = (value: string) =>
  normalizeWhitespace(value.replace(/[.!?]+$/g, ''));

const toTrimmedString = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const toStringValue = (value: unknown) => (typeof value === 'string' ? value : '');

const toStringArray = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];

const toCleanStringArray = (value: unknown) =>
  Array.isArray(value)
    ? value
        .map((item) => toTrimmedString(item))
        .filter(Boolean)
    : undefined;

const normalizeSaveType = (value: unknown): SaveItemType | undefined => {
  const type = toTrimmedString(value).toLowerCase().replace(/_/g, '-');

  if (type === 'work' || type === 'work-done') {
    return 'log';
  }

  return SAVE_ITEM_TYPES.has(type as SaveItemType) ? (type as SaveItemType) : undefined;
};

const normalizeImportance = (value: unknown, fallback: number) => {
  const importance =
    typeof value === 'number' ? value : Number.parseInt(toTrimmedString(value), 10);

  return Number.isInteger(importance) && importance >= 1 && importance <= 5
    ? importance
    : fallback;
};

const getObjectValue = (value: unknown) =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const getStructuredSaveSource = (body: CommandBody) =>
  getObjectValue(body.item) ||
  getObjectValue(body.metadata) ||
  getObjectValue(body.save) ||
  (body as Record<string, unknown>);

const getSaveTypeFromInput = (input: string): SaveItemType | undefined => {
  const commandMatch = input.match(/^@([a-z-]+)(?:\s+[\s\S]*)?$/i);

  if (!commandMatch) {
    return undefined;
  }

  switch (commandMatch[1].toLowerCase()) {
    case 'memory':
      return 'memory';
    case 'log':
    case 'work':
    case 'work-done':
      return 'log';
    case 'task':
      return 'task';
    case 'note':
    case 'requirement':
    case 'credential':
      return 'note';
    case 'meeting':
      return 'meeting';
    case 'reminder':
      return 'reminder';
    default:
      return undefined;
  }
};

const extractSaveMetadata = (body: CommandBody, input: string): SaveMetadata | null => {
  const source = getStructuredSaveSource(body);
  const providedType = normalizeSaveType(source.type);
  const type = providedType || getSaveTypeFromInput(input);
  const title = toTrimmedString(source.title);
  const content = toTrimmedString(source.content);
  const category = toTrimmedString(source.category);
  const projectId = toTrimmedString(source.projectId);
  const reminderAt = toTrimmedString(source.reminderAt);
  const tags = toCleanStringArray(source.tags);
  const importance =
    source.importance === undefined
      ? undefined
      : normalizeImportance(source.importance, Number.NaN);
  const hasMetadata =
    Boolean(providedType) ||
    Boolean(title) ||
    Boolean(content) ||
    Boolean(category) ||
    Boolean(projectId) ||
    Boolean(reminderAt) ||
    Boolean(tags?.length) ||
    importance !== undefined;

  if (!hasMetadata) {
    return null;
  }

  return {
    ...(type ? { type } : {}),
    ...(title ? { title } : {}),
    ...(content ? { content } : {}),
    ...(category ? { category } : {}),
    ...(projectId ? { projectId } : {}),
    ...(reminderAt ? { reminderAt } : {}),
    ...(tags ? { tags } : {}),
    ...(Number.isInteger(importance) ? { importance } : {})
  };
};

const getSaveTitle = (metadata: SaveMetadata | undefined, content: string, type: SaveItemType) =>
  metadata?.title || getFallbackTitle(content, type);

const toObjectIdString = (value: unknown) => {
  if (!value) {
    return undefined;
  }

  if (value instanceof mongoose.Types.ObjectId) {
    return value.toString();
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'object' && '_id' in value) {
    const nestedId = (value as { _id?: unknown })._id;

    return nestedId ? String(nestedId) : undefined;
  }

  return String(value);
};

const toDateValue = (value: unknown) => {
  if (value instanceof Date || typeof value === 'string') {
    return value;
  }

  return undefined;
};

const getPopulatedProject = (value: unknown) => {
  if (
    value &&
    typeof value === 'object' &&
    '_id' in value &&
    'name' in value &&
    typeof (value as { name?: unknown }).name === 'string'
  ) {
    return value as ProjectLike;
  }

  return null;
};

const inferImportance = (content: string, fallback: number) => {
  const normalized = content.toLowerCase();
  const criticalPattern =
    /\b(passport|credential|credentials|password|secret|production|prod|api key|apikey|appkey|token|config|private key)\b/;

  if (criticalPattern.test(normalized)) {
    return 5;
  }

  if (/\b(random note|random thought|rough note|scratch)\b/.test(normalized)) {
    return 1;
  }

  return fallback;
};

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short'
});

const getStartOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

const getTomorrow = () => {
  const tomorrow = getStartOfDay(new Date());
  tomorrow.setDate(tomorrow.getDate() + 1);

  return tomorrow;
};

const getReminderDateHint = (input: string) => {
  if (/\btomorrow\b/i.test(input)) {
    return getTomorrow();
  }

  if (/\btoday\b/i.test(input)) {
    return getStartOfDay(new Date());
  }

  return null;
};

const parseReminderTime = (input: string) => {
  const meridiemMatch = input.match(/\b(?:at\s*)?(\d{1,2})(?::([0-5]\d))?\s*(am|pm)\b/i);

  if (meridiemMatch) {
    const meridiem = meridiemMatch[3].toLowerCase();
    let hour = Number.parseInt(meridiemMatch[1], 10);
    const minute = meridiemMatch[2] ? Number.parseInt(meridiemMatch[2], 10) : 0;

    if (hour < 1 || hour > 12) {
      return null;
    }

    if (meridiem === 'pm' && hour !== 12) {
      hour += 12;
    }

    if (meridiem === 'am' && hour === 12) {
      hour = 0;
    }

    return { hour, minute };
  }

  const twentyFourHourMatch = input.match(/\bat\s+([01]?\d|2[0-3]):([0-5]\d)\b/i);

  if (!twentyFourHourMatch) {
    return null;
  }

  return {
    hour: Number.parseInt(twentyFourHourMatch[1], 10),
    minute: Number.parseInt(twentyFourHourMatch[2], 10)
  };
};

const buildReminderDate = (
  input: string,
  pendingDate?: Date | string | null
) => {
  const time = parseReminderTime(input);

  if (!time) {
    return null;
  }

  const explicitDate = getReminderDateHint(input);
  const baseDate = explicitDate || (pendingDate ? new Date(pendingDate) : getStartOfDay(new Date()));
  const reminderAt = getStartOfDay(baseDate);

  reminderAt.setHours(time.hour, time.minute, 0, 0);

  if (!explicitDate && !pendingDate && reminderAt.getTime() <= Date.now()) {
    reminderAt.setDate(reminderAt.getDate() + 1);
  }

  return reminderAt;
};

const cleanReminderContent = (input: string) => {
  const content = input
    .replace(/^remind\s+me\s*(?:to|that|of|about)?\s*/i, '')
    .replace(/\b(?:today|tomorrow)\b/gi, '')
    .replace(/\b(?:at\s*)?\d{1,2}(?::[0-5]\d)?\s*(?:am|pm)\b/gi, '')
    .replace(/\bat\s+(?:[01]?\d|2[0-3]):[0-5]\d\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  return content || input.trim();
};

const formatReminderDate = (date: Date) => timeFormatter.format(date);

const getSessionKey = (request: Request, body: CommandBody) => {
  const bodySessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
  const headerSessionId = request.headers.get('x-session-id')?.trim() || '';

  return bodySessionId || headerSessionId || DEFAULT_SESSION_KEY;
};

const getQueryTokens = (query: string) => {
  const tokens = query
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !STOP_WORDS.has(token));

  return tokens.length ? tokens.slice(0, 8) : [query.trim()].filter(Boolean);
};

const buildTextQuery = (query: string, fields: string[]) => {
  const tokens = getQueryTokens(query);
  const conditions = tokens.flatMap((token) => {
    const regex = new RegExp(escapeRegex(token), 'i');

    return fields.map((field) => ({ [field]: regex }));
  });

  return conditions.length ? { $or: conditions } : {};
};

const getProjectDisplay = (project: ProjectLike | null | undefined) =>
  project ? { _id: String(project._id), name: project.name } : null;

const findProjectByName = async (name: string) =>
  Project.findOne({
    name: new RegExp(`^${escapeRegex(normalizeName(name))}$`, 'i')
  });

const findOrCreateProject = async (name: string) => {
  const normalizedName = normalizeName(name);
  const existingProject = await findProjectByName(normalizedName);

  if (existingProject) {
    return { project: existingProject, created: false };
  }

  const project = await Project.create({
    name: normalizedName,
    source: 'assistant'
  });

  return { project, created: true };
};

const getSession = async (sessionKey: string) =>
  AssistantSession.findOneAndUpdate(
    { sessionKey },
    { $setOnInsert: { sessionKey } },
    { new: true, upsert: true }
  ).populate('activeProjectId', 'name description status');

const setActiveProject = async (sessionKey: string, projectId: mongoose.Types.ObjectId) =>
  AssistantSession.findOneAndUpdate(
    { sessionKey },
    { sessionKey, activeProjectId: projectId },
    { new: true, upsert: true }
  ).populate('activeProjectId', 'name description status');

const setLastItem = async (sessionKey: string, type: LastItemType, id: unknown) => {
  const itemId = toObjectIdString(id);

  if (!itemId || !mongoose.Types.ObjectId.isValid(itemId)) {
    return null;
  }

  return AssistantSession.findOneAndUpdate(
    { sessionKey },
    {
      sessionKey,
      lastItemId: new mongoose.Types.ObjectId(itemId),
      lastItemType: type
    },
    { new: true, upsert: true }
  );
};

const setLastSearchResults = async (sessionKey: string, results: SearchCandidate[]) => {
  const lastSearchResults = results
    .map((result) => {
      if (!mongoose.Types.ObjectId.isValid(result.id)) {
        return null;
      }

      return {
        itemId: new mongoose.Types.ObjectId(result.id),
        itemType: result.type as LastSearchItemType,
        title: result.title
      };
    })
    .filter(Boolean)
    .slice(0, SUMMARY_LIMIT);

  return AssistantSession.findOneAndUpdate(
    { sessionKey },
    {
      sessionKey,
      lastSearchResults
    },
    { new: true, upsert: true }
  );
};

const setPendingTaskCompletion = async (
  sessionKey: string,
  taskId: unknown,
  title: string
) => {
  const itemId = toObjectIdString(taskId);

  if (!itemId || !mongoose.Types.ObjectId.isValid(itemId)) {
    return null;
  }

  return AssistantSession.findOneAndUpdate(
    { sessionKey },
    {
      sessionKey,
      pendingTaskCompletionId: new mongoose.Types.ObjectId(itemId),
      pendingTaskCompletionTitle: title
    },
    { new: true, upsert: true }
  );
};

const clearPendingTaskCompletion = async (sessionKey: string) =>
  AssistantSession.findOneAndUpdate(
    { sessionKey },
    {
      $unset: {
        pendingTaskCompletionId: '',
        pendingTaskCompletionTitle: ''
      }
    },
    { new: true }
  );

const setPendingReminder = async (
  sessionKey: string,
  content: string,
  reminderDate: Date | null
) => {
  const update =
    reminderDate === null
      ? {
          $set: {
            sessionKey,
            pendingReminderContent: content
          },
          $unset: {
            pendingReminderDate: ''
          }
        }
      : {
          $set: {
            sessionKey,
            pendingReminderContent: content,
            pendingReminderDate: reminderDate
          }
        };

  return AssistantSession.findOneAndUpdate({ sessionKey }, update, {
    new: true,
    upsert: true
  });
};

const clearPendingReminder = async (sessionKey: string) =>
  AssistantSession.findOneAndUpdate(
    { sessionKey },
    {
      $unset: {
        pendingReminderContent: '',
        pendingReminderDate: ''
      }
    },
    { new: true }
  );

const getActiveProject = async (sessionKey: string) => {
  const session = await getSession(sessionKey);
  const activeProject = session.activeProjectId;

  if (!activeProject || typeof activeProject !== 'object' || !('name' in activeProject)) {
    return null;
  }

  return activeProject as unknown as ProjectLike;
};

const askForProject = async () => {
  const projects = await Project.find().sort({ updatedAt: -1 }).limit(RECENT_LIMIT).lean();

  return NextResponse.json({
    message: 'Which project should I use?',
    needsProject: true,
    data: {
      projects
    }
  });
};

const createStandaloneMemory = async (
  content: string,
  metadata?: SaveMetadata,
  type: SaveItemType = metadata?.type || 'memory'
) => {
  const memory = await Memory.create({
    title: getSaveTitle(metadata, content, type),
    content,
    category: metadata?.category || (type === 'log' ? 'log' : 'general'),
    tags: metadata?.tags || [],
    source: 'assistant',
    kind: type === 'log' ? 'work_done' : type === 'task' ? 'task' : 'note',
    projectId: metadata?.projectId,
    importance: normalizeImportance(metadata?.importance, inferImportance(content, 3))
  });

  return memory.toObject();
};

const createReminderMemory = async (
  content: string,
  reminderAt: Date,
  metadata?: SaveMetadata
) => {
  const memory = await Memory.create({
    title: getSaveTitle(metadata, content, 'reminder'),
    content,
    category: metadata?.category || 'reminder',
    tags: metadata?.tags || ['reminder'],
    source: 'assistant',
    kind: 'note',
    reminderAt,
    notificationEnabled: true,
    projectId: metadata?.projectId,
    importance: normalizeImportance(metadata?.importance, 4)
  });

  return memory.toObject();
};

const createProjectTask = async (
  project: ProjectLike,
  description: string,
  metadata?: SaveMetadata
) => {
  const task = await ProjectTask.create({
    projectId: project._id,
    title: getSaveTitle(metadata, description, 'task'),
    description,
    category: metadata?.category || 'project',
    tags: metadata?.tags || [],
    source: 'assistant',
    importance: normalizeImportance(metadata?.importance, 3)
  });

  return task.toObject();
};

const createProjectNote = async (
  project: ProjectLike,
  content: string,
  metadata?: SaveMetadata
) => {
  const note = await ProjectNote.create({
    projectId: project._id,
    title: getSaveTitle(metadata, content, 'note'),
    content,
    category: metadata?.category || 'project',
    kind: 'note',
    tags: metadata?.tags || [],
    source: 'assistant',
    importance: normalizeImportance(metadata?.importance, inferImportance(content, 3))
  });

  return note.toObject();
};

const createTypedProjectNote = async (
  project: ProjectLike,
  content: string,
  kind: 'requirement' | 'credential' | 'work_done',
  metadata?: SaveMetadata
) => {
  const note = await ProjectNote.create({
    projectId: project._id,
    title: getSaveTitle(metadata, content, kind === 'work_done' ? 'log' : 'note'),
    content,
    category: metadata?.category || kind,
    kind,
    tags: metadata?.tags || [],
    source: 'assistant',
    importance: normalizeImportance(
      metadata?.importance,
      inferImportance(content, kind === 'credential' ? 5 : 3)
    )
  });

  return note.toObject();
};

const createProjectMeeting = async (
  project: ProjectLike,
  details: string,
  metadata?: SaveMetadata
) => {
  const meeting = await ProjectMeeting.create({
    projectId: project._id,
    title: getSaveTitle(metadata, details, 'meeting'),
    details,
    category: metadata?.category || 'meeting',
    tags: metadata?.tags || [],
    source: 'assistant',
    importance: normalizeImportance(metadata?.importance, 4)
  });

  return meeting.toObject();
};

const listProjectTasks = async (projectId: unknown) =>
  ProjectTask.find({ projectId }).sort({ createdAt: -1 }).limit(RECENT_LIMIT).lean();

const listProjectNotes = async (projectId: unknown) =>
  ProjectNote.find({ projectId }).sort({ createdAt: -1 }).limit(RECENT_LIMIT).lean();

const listProjectMeetings = async (projectId: unknown) =>
  ProjectMeeting.find({ projectId }).sort({ createdAt: -1 }).limit(RECENT_LIMIT).lean();

const getProjectSummary = async (project: ProjectLike) => {
  const [pendingTasks, completedTasks, recentMeetings, recentNotes] = await Promise.all([
    ProjectTask.find({ projectId: project._id, status: 'pending' })
      .sort({ createdAt: -1 })
      .limit(SUMMARY_LIMIT)
      .lean(),
    ProjectTask.find({ projectId: project._id, status: 'completed' })
      .sort({ updatedAt: -1 })
      .limit(SUMMARY_LIMIT)
      .lean(),
    ProjectMeeting.find({ projectId: project._id })
      .sort({ createdAt: -1 })
      .limit(SUMMARY_LIMIT)
      .lean(),
    ProjectNote.find({ projectId: project._id })
      .sort({ createdAt: -1 })
      .limit(SUMMARY_LIMIT)
      .lean()
  ]);

  return {
    project,
    pendingTasks,
    completedTasks,
    recentMeetings,
    recentNotes
  };
};

const toProjectCandidate = (project: RawDocument): SearchCandidate => ({
  id: String(project._id),
  type: 'project',
  title: toStringValue(project.name),
  content: toStringValue(project.description),
  tags: toStringArray(project.tags),
  projectName: toStringValue(project.name),
  createdAt: toDateValue(project.createdAt)
});

const toProjectItemCandidate = (
  doc: RawDocument,
  type: 'task' | 'note' | 'meeting',
  contentField: 'description' | 'content' | 'details'
): SearchCandidate => {
  const project = getPopulatedProject(doc.projectId);

  return {
    id: String(doc._id),
    type,
    title: toStringValue(doc.title),
    content: toStringValue(doc[contentField]),
    tags: toStringArray(doc.tags),
    projectId: toObjectIdString(doc.projectId),
    projectName: project?.name,
    importance: typeof doc.importance === 'number' ? doc.importance : undefined,
    createdAt: toDateValue(doc.createdAt)
  };
};

const toMemoryCandidate = (memory: RawDocument): SearchCandidate => {
  const project = getPopulatedProject(memory.projectId);

  return {
    id: String(memory._id),
    type: 'memory',
    title: toStringValue(memory.title),
    content: toStringValue(memory.content),
    tags: toStringArray(memory.tags),
    projectId: toObjectIdString(memory.projectId),
    projectName: project?.name,
    importance: typeof memory.importance === 'number' ? memory.importance : undefined,
    createdAt: toDateValue(memory.createdAt)
  };
};

const searchRanked = async (query: string, activeProject: ProjectLike | null) => {
  const privateMemoryFilter = {
    category: { $ne: 'vault' },
    kind: { $ne: 'credential' },
    tags: { $nin: ['vault'] }
  };
  const projectQuery = buildTextQuery(query, ['name', 'description', 'tags']);
  const taskQuery = buildTextQuery(query, ['title', 'description', 'category', 'status', 'tags']);
  const noteQuery = buildTextQuery(query, ['title', 'content', 'category', 'kind', 'tags']);
  const meetingQuery = buildTextQuery(query, ['title', 'details', 'category', 'tags']);
  const memoryQuery = buildTextQuery(query, [
    'title',
    'content',
    'category',
    'tags',
    'source',
    'sourceTitle',
    'sourceUrl'
  ]);

  const [
    projects,
    tasks,
    notes,
    meetings,
    memories,
    projectCount,
    taskCount,
    noteCount,
    meetingCount,
    memoryCount
  ] = (await Promise.all([
    Project.find(projectQuery).sort({ updatedAt: -1 }).limit(SEARCH_CANDIDATE_LIMIT).lean(),
    ProjectTask.find(taskQuery)
      .sort({ updatedAt: -1 })
      .limit(SEARCH_CANDIDATE_LIMIT)
      .populate('projectId', 'name description status')
      .lean(),
    ProjectNote.find(noteQuery)
      .sort({ updatedAt: -1 })
      .limit(SEARCH_CANDIDATE_LIMIT)
      .populate('projectId', 'name description status')
      .lean(),
    ProjectMeeting.find(meetingQuery)
      .sort({ updatedAt: -1 })
      .limit(SEARCH_CANDIDATE_LIMIT)
      .populate('projectId', 'name description status')
      .lean(),
    Memory.find({ $and: [privateMemoryFilter, memoryQuery] })
      .sort({ updatedAt: -1 })
      .limit(SEARCH_CANDIDATE_LIMIT)
      .populate('projectId', 'name description status')
      .lean(),
    Project.countDocuments(projectQuery),
    ProjectTask.countDocuments(taskQuery),
    ProjectNote.countDocuments(noteQuery),
    ProjectMeeting.countDocuments(meetingQuery),
    Memory.countDocuments({ $and: [privateMemoryFilter, memoryQuery] })
  ])) as [
    RawDocument[],
    RawDocument[],
    RawDocument[],
    RawDocument[],
    RawDocument[],
    number,
    number,
    number,
    number,
    number
  ];

  const candidates: SearchCandidate[] = [
    ...projects.map(toProjectCandidate),
    ...tasks.map((task) => toProjectItemCandidate(task, 'task', 'description')),
    ...notes.map((note) => toProjectItemCandidate(note, 'note', 'content')),
    ...meetings.map((meeting) => toProjectItemCandidate(meeting, 'meeting', 'details')),
    ...memories.map(toMemoryCandidate)
  ];
  const totalMatches = projectCount + taskCount + noteCount + meetingCount + memoryCount;
  const activeProjectId = toObjectIdString(activeProject?._id) || null;
  const rankedResults = rankSearchCandidates(candidates, query, activeProjectId);
  const topResults = selectTopRankedResults(rankedResults, totalMatches);

  return {
    query,
    totalMatches,
    returnedCount: topResults.length,
    context: buildCompactSearchContext(query, topResults),
    results: toCompactSearchResults(topResults),
    sessionResults: topResults
  };
};

const handleRankedSearch = async (sessionKey: string, query: string) => {
  const activeProject = await getActiveProject(sessionKey);
  const search = await searchRanked(query, activeProject);
  await setLastSearchResults(sessionKey, search.sessionResults);
  const { sessionResults: _sessionResults, ...publicSearch } = search;

  return NextResponse.json({
    message: `Found ${search.totalMatches} result(s) for "${query}". Retrieved ${search.returnedCount} top result(s).`,
    activeProject: getProjectDisplay(activeProject),
    data: publicSearch
  });
};

const searchTasksForDelete = async (query: string, projectId?: unknown) => {
  const baseQuery = buildTextQuery(query, ['title', 'description', 'category', 'status', 'tags']);
  const scopedQuery = projectId ? { $and: [{ projectId }, baseQuery] } : baseQuery;

  return ProjectTask.find(scopedQuery)
    .sort({ updatedAt: -1 })
    .limit(DELETE_CHOICE_LIMIT)
    .populate('projectId', 'name description status')
    .lean();
};

const searchMemoriesForDelete = async (query: string) =>
  Memory.find({
    $and: [
      {
        category: { $ne: 'vault' },
        kind: { $ne: 'credential' },
        tags: { $nin: ['vault'] }
      },
      buildTextQuery(query, ['title', 'content', 'category', 'tags', 'source'])
    ]
  })
    .sort({ updatedAt: -1 })
    .limit(DELETE_CHOICE_LIMIT)
    .lean();

const handleDeleteTask = async (sessionKey: string, query: string) => {
  if (!query) {
    return NextResponse.json({ error: 'Task delete query is required' }, { status: 400 });
  }

  if (mongoose.Types.ObjectId.isValid(query)) {
    const deletedTask = await ProjectTask.findByIdAndDelete(query).lean();

    if (!deletedTask) {
      return NextResponse.json({ message: 'No matching task found.', data: null });
    }

    return NextResponse.json({
      message: `Deleted task: ${deletedTask.title}`,
      data: deletedTask
    });
  }

  const activeProject = await getActiveProject(sessionKey);
  const tasks = await searchTasksForDelete(query, activeProject?._id);

  if (!tasks.length) {
    return NextResponse.json({ message: 'No matching task found.', data: [] });
  }

  if (tasks.length > 1) {
    return NextResponse.json({
      message: 'Multiple tasks matched. Reply with @delete-task followed by the exact task id.',
      needsSelection: true,
      data: {
        tasks
      }
    });
  }

  await ProjectTask.findByIdAndDelete(tasks[0]._id);

  return NextResponse.json({
    message: `Deleted task: ${tasks[0].title}`,
    data: tasks[0]
  });
};

const handleDeleteMemory = async (query: string) => {
  if (!query) {
    return NextResponse.json({ error: 'Memory delete query is required' }, { status: 400 });
  }

  if (mongoose.Types.ObjectId.isValid(query)) {
    const deletedMemory = await Memory.findByIdAndDelete(query).lean();

    if (!deletedMemory) {
      return NextResponse.json({ message: 'No matching memory found.', data: null });
    }

    return NextResponse.json({
      message: `Deleted memory: ${deletedMemory.title}`,
      data: deletedMemory
    });
  }

  const memories = await searchMemoriesForDelete(query);

  if (!memories.length) {
    return NextResponse.json({ message: 'No matching memory found.', data: [] });
  }

  if (memories.length > 1) {
    return NextResponse.json({
      message: 'Multiple memories matched. Reply with @delete-memory followed by the exact memory id.',
      needsSelection: true,
      data: {
        memories
      }
    });
  }

  await Memory.findByIdAndDelete(memories[0]._id);

  return NextResponse.json({
    message: `Deleted memory: ${memories[0].title}`,
    data: memories[0]
  });
};

const ordinalToIndex = (input: string) => {
  const normalized = input.toLowerCase();
  const digitMatch = normalized.match(/\b(?:#)?([1-9]|10)(?:st|nd|rd|th)?\b/);

  if (digitMatch) {
    return Number.parseInt(digitMatch[1], 10) - 1;
  }

  const ordinals: Record<string, number> = {
    first: 0,
    second: 1,
    third: 2,
    fourth: 3,
    fifth: 4,
    sixth: 5,
    seventh: 6,
    eighth: 7,
    ninth: 8,
    tenth: 9
  };

  for (const [word, index] of Object.entries(ordinals)) {
    if (new RegExp(`\\b${word}\\b`).test(normalized)) {
      return index;
    }
  }

  return null;
};

const isTaskCompletionIntent = (input: string) =>
  /\b(?:mark|set|move)\b[\s\S]*\b(?:done|complete|completed|finished)\b/i.test(input) ||
  (
    /\b(?:done|complete|completed|finished)\b/i.test(input) &&
    (
      ordinalToIndex(input) !== null ||
      /\b(?:it|this|that|task|item|one)\b/i.test(input)
    )
  );

const updateTaskStatusToCompleted = async (
  sessionKey: string,
  taskId: unknown,
  fallbackTitle?: string
) => {
  const itemId = toObjectIdString(taskId);

  if (!itemId || !mongoose.Types.ObjectId.isValid(itemId)) {
    return NextResponse.json({ message: 'No valid task id found to complete.', data: null });
  }

  const task = await ProjectTask.findByIdAndUpdate(
    itemId,
    { status: 'completed' },
    { new: true, runValidators: true }
  )
    .populate('projectId', 'name description status')
    .lean();

  await clearPendingTaskCompletion(sessionKey);

  if (!task) {
    return NextResponse.json({ message: 'Task not found.', data: null });
  }

  await setLastItem(sessionKey, 'task', task._id);

  return NextResponse.json({
    message: `Marked task completed: ${toStringValue(task.title) || fallbackTitle || itemId}`,
    data: task
  });
};

const handlePendingTaskCompletionConfirmation = async (sessionKey: string, input: string) => {
  if (!/^(?:yes|y|confirm|ok|okay|do it)$/i.test(input.trim())) {
    return null;
  }

  const session = await getSession(sessionKey);
  const pendingTaskId = toObjectIdString(session.pendingTaskCompletionId);

  if (!pendingTaskId) {
    return null;
  }

  return updateTaskStatusToCompleted(
    sessionKey,
    pendingTaskId,
    toStringValue(session.pendingTaskCompletionTitle)
  );
};

const handleTaskCompletionRequest = async (sessionKey: string, input: string) => {
  if (!isTaskCompletionIntent(input)) {
    return null;
  }

  const session = await getSession(sessionKey);
  const ordinalIndex = ordinalToIndex(input);
  const lastSearchResults = Array.isArray(session.lastSearchResults)
    ? session.lastSearchResults
    : [];

  if (ordinalIndex !== null) {
    const selected = lastSearchResults[ordinalIndex];

    if (!selected) {
      return NextResponse.json({
        message: `I could not find item ${ordinalIndex + 1} from the last search results.`,
        needsSelection: true
      });
    }

    if (selected.itemType !== 'task') {
      return NextResponse.json({
        message: `Item ${ordinalIndex + 1} is a ${selected.itemType}, not a task, so I did not change task status.`,
        needsSelection: true,
        data: selected
      });
    }

    return updateTaskStatusToCompleted(sessionKey, selected.itemId, selected.title);
  }

  const lastTask = [...lastSearchResults].reverse().find((item) => item.itemType === 'task');

  if (lastTask) {
    await setPendingTaskCompletion(sessionKey, lastTask.itemId, lastTask.title);

    return NextResponse.json({
      message: `Please confirm: mark this task as completed? ${lastTask.title}`,
      needsConfirmation: true,
      data: lastTask
    });
  }

  const lastItemType = session.lastItemType as LastItemType | undefined;
  const lastItemId = toObjectIdString(session.lastItemId);

  if (lastItemType === 'task' && lastItemId) {
    return updateTaskStatusToCompleted(sessionKey, lastItemId);
  }

  return null;
};

const updateImportanceForLastItem = async (sessionKey: string, importance: number) => {
  const session = await getSession(sessionKey);
  const lastItemType = session.lastItemType as LastItemType | undefined;
  const lastItemId = toObjectIdString(session.lastItemId);

  if (!lastItemType || !lastItemId) {
    return NextResponse.json({
      message: 'Save or create an item first, then use @importance 1-5.',
      needsSelection: true
    });
  }

  let updatedItem: RawDocument | null = null;

  if (lastItemType === 'memory') {
    updatedItem = (await Memory.findByIdAndUpdate(
      lastItemId,
      { importance },
      { new: true, runValidators: true }
    ).lean()) as RawDocument | null;
  }

  if (lastItemType === 'task') {
    updatedItem = (await ProjectTask.findByIdAndUpdate(
      lastItemId,
      { importance },
      { new: true, runValidators: true }
    ).lean()) as RawDocument | null;
  }

  if (lastItemType === 'note') {
    updatedItem = (await ProjectNote.findByIdAndUpdate(
      lastItemId,
      { importance },
      { new: true, runValidators: true }
    ).lean()) as RawDocument | null;
  }

  if (lastItemType === 'meeting') {
    updatedItem = (await ProjectMeeting.findByIdAndUpdate(
      lastItemId,
      { importance },
      { new: true, runValidators: true }
    ).lean()) as RawDocument | null;
  }

  if (!updatedItem) {
    return NextResponse.json({
      message: 'The last saved item could not be found.',
      data: null
    });
  }

  const label = `${lastItemType[0].toUpperCase()}${lastItemType.slice(1)}`;
  const title = toStringValue(updatedItem.title) || String(updatedItem._id);

  return NextResponse.json({
    message: `Importance set to ${importance} for ${label}: ${title}`,
    data: updatedItem
  });
};

const saveReminder = async (
  sessionKey: string,
  content: string,
  reminderAt: Date,
  metadata?: SaveMetadata
) => {
  const memory = await createReminderMemory(content, reminderAt, metadata);
  await setLastItem(sessionKey, 'memory', memory._id);
  await clearPendingReminder(sessionKey);

  return NextResponse.json({
    message: `Reminder saved for ${formatReminderDate(reminderAt)}`,
    data: memory
  });
};

const askForReminderTime = async (
  sessionKey: string,
  content: string,
  reminderDate: Date | null
) => {
  await setPendingReminder(sessionKey, content, reminderDate);

  const dateText = reminderDate ? ` on ${reminderDate.toDateString()}` : '';

  return NextResponse.json({
    message: `What time${dateText} should I remind you?`,
    needsReminderTime: true,
    data: {
      content,
      reminderDate: reminderDate?.toISOString() || null
    }
  });
};

const handleReminderRequest = async (sessionKey: string, input: string) => {
  const content = cleanReminderContent(input);
  const reminderAt = buildReminderDate(input);

  if (reminderAt) {
    return saveReminder(sessionKey, content, reminderAt);
  }

  return askForReminderTime(sessionKey, content, getReminderDateHint(input));
};

const handlePendingReminderTime = async (sessionKey: string, input: string) => {
  const session = await getSession(sessionKey);
  const pendingContent =
    typeof session.pendingReminderContent === 'string'
      ? session.pendingReminderContent.trim()
      : '';

  if (!pendingContent || !parseReminderTime(input)) {
    return null;
  }

  const reminderAt = buildReminderDate(input, session.pendingReminderDate);

  if (!reminderAt) {
    return null;
  }

  return saveReminder(sessionKey, pendingContent, reminderAt);
};

const getProjectFromNaturalTaskQuestion = async (input: string) => {
  const match = input.match(/\btasks?\s+(?:in|for)\s+(.+)$/i);

  if (!match) {
    return null;
  }

  return findProjectByName(match[1]);
};

const getProjectFromNaturalNoteQuestion = async (input: string) => {
  const match = input.match(/\bnotes?\s+(?:in|for)\s+(.+)$/i);

  if (!match) {
    return null;
  }

  return findProjectByName(match[1]);
};

const getProjectFromNaturalMeetingQuestion = async (input: string) => {
  const match = input.match(/\bmeetings?\s+(?:in|for)\s+(.+)$/i);

  if (!match) {
    return null;
  }

  return findProjectByName(match[1]);
};

const isSimpleListRequest = (input: string, singularName: 'task' | 'note' | 'meeting') =>
  new RegExp(`^(?:show\\s+|list\\s+|get\\s+|any\\s+)?${singularName}s?\\??$`, 'i').test(
    input.trim()
  );

const isQuestionLikeInput = (input: string) => {
  const normalized = input.trim().toLowerCase();

  return (
    normalized.endsWith('?') ||
    /^(?:any|are|can|check|did|do|does|find|get|give|how|is|list|search|show|tell|what|when|where|which|who|why)\b/.test(
      normalized
    )
  );
};

const isWorkLogStatement = (input: string) => {
  if (isQuestionLikeInput(input)) {
    return false;
  }

  return (
    /^(?:i\s+)?(?:worked on|working on|fixed|resolved|completed|finished|implemented|added|updated|changed|debugged|investigated|handled|started|did)\b/i.test(
      input
    ) ||
    /\b(?:this|that)\s+(?:task|issue|bug|fix)\b/i.test(input) ||
    /\b(?:task|issue|bug|fix|work|requirement|change|update)\b/i.test(input)
  );
};

const saveNaturalWorkLog = async (
  sessionKey: string,
  content: string,
  metadata?: SaveMetadata
) => {
  const activeProject = await getActiveProject(sessionKey);

  if (activeProject) {
    const note = await createTypedProjectNote(activeProject, content, 'work_done', metadata);
    await setLastItem(sessionKey, 'note', note._id);

    return NextResponse.json({
      message: `Log added to ${activeProject.name}`,
      activeProject: getProjectDisplay(activeProject),
      data: note
    });
  }

  const memory = await createStandaloneMemory(content, metadata, 'log');
  await setLastItem(sessionKey, 'memory', memory._id);

  return NextResponse.json({
    message: 'Log saved',
    data: memory
  });
};

const handleProjectSelection = async (sessionKey: string, name: string) => {
  if (!name) {
    return NextResponse.json({ error: 'Project name is required' }, { status: 400 });
  }

  const { project } = await findOrCreateProject(name);
  await setActiveProject(sessionKey, project._id);

  return NextResponse.json({
    message: `Active project set to ${project.name}`,
    activeProject: getProjectDisplay(project),
    data: project
  });
};

const getCommandContent = (input: string) => {
  const commandMatch = input.match(/^@[a-z-]+(?:\s+([\s\S]*))?$/i);

  return normalizeWhitespace(commandMatch ? commandMatch[1] || '' : input);
};

const getProjectForStructuredSave = async (
  sessionKey: string,
  metadata: SaveMetadata
): Promise<{ error?: NextResponse; project: ProjectLike | null }> => {
  if (!metadata.projectId) {
    return {
      project: await getActiveProject(sessionKey)
    };
  }

  if (!mongoose.Types.ObjectId.isValid(metadata.projectId)) {
    return {
      project: null,
      error: NextResponse.json({ error: 'Invalid project id' }, { status: 400 })
    };
  }

  const project = await Project.findById(metadata.projectId).lean();

  if (!project) {
    return {
      project: null,
      error: NextResponse.json({ error: 'Project not found' }, { status: 404 })
    };
  }

  return {
    project: project as unknown as ProjectLike
  };
};

const handleStructuredSave = async (
  sessionKey: string,
  input: string,
  metadata: SaveMetadata
) => {
  const type = metadata.type || getSaveTypeFromInput(input);
  const content = metadata.content || getCommandContent(input);

  if (!type) {
    return null;
  }

  if (!content) {
    return NextResponse.json({ error: `${type} content is required` }, { status: 400 });
  }

  if (type === 'memory') {
    if (metadata.projectId) {
      const projectResult = await getProjectForStructuredSave(sessionKey, metadata);

      if (projectResult.error) {
        return projectResult.error;
      }
    }

    const memory = await createStandaloneMemory(content, metadata, 'memory');
    await setLastItem(sessionKey, 'memory', memory._id);

    return NextResponse.json({
      message: 'Memory saved',
      data: memory
    });
  }

  if (type === 'reminder') {
    if (metadata.projectId) {
      const projectResult = await getProjectForStructuredSave(sessionKey, metadata);

      if (projectResult.error) {
        return projectResult.error;
      }
    }

    const reminderAt = metadata.reminderAt
      ? new Date(metadata.reminderAt)
      : buildReminderDate(input);

    if (reminderAt && !Number.isNaN(reminderAt.getTime())) {
      return saveReminder(sessionKey, content, reminderAt, metadata);
    }

    return askForReminderTime(sessionKey, content, getReminderDateHint(input));
  }

  const projectResult = await getProjectForStructuredSave(sessionKey, metadata);

  if (projectResult.error) {
    return projectResult.error;
  }

  if (type === 'log') {
    if (projectResult.project) {
      const note = await createTypedProjectNote(
        projectResult.project,
        content,
        'work_done',
        metadata
      );
      await setLastItem(sessionKey, 'note', note._id);

      return NextResponse.json({
        message: `Log added to ${projectResult.project.name}`,
        activeProject: getProjectDisplay(projectResult.project),
        data: note
      });
    }

    const memory = await createStandaloneMemory(content, metadata, 'log');
    await setLastItem(sessionKey, 'memory', memory._id);

    return NextResponse.json({
      message: 'Log saved',
      data: memory
    });
  }

  if (!projectResult.project) {
    return askForProject();
  }

  if (type === 'task') {
    const task = await createProjectTask(projectResult.project, content, metadata);
    await setLastItem(sessionKey, 'task', task._id);

    return NextResponse.json({
      message: `Task added to ${projectResult.project.name}`,
      activeProject: getProjectDisplay(projectResult.project),
      data: task
    });
  }

  if (type === 'note') {
    const note = await createProjectNote(projectResult.project, content, metadata);
    await setLastItem(sessionKey, 'note', note._id);

    return NextResponse.json({
      message: `Note added to ${projectResult.project.name}`,
      activeProject: getProjectDisplay(projectResult.project),
      data: note
    });
  }

  const meeting = await createProjectMeeting(projectResult.project, content, metadata);
  await setLastItem(sessionKey, 'meeting', meeting._id);

  return NextResponse.json({
    message: `Meeting added to ${projectResult.project.name}`,
    activeProject: getProjectDisplay(projectResult.project),
    data: meeting
  });
};

const handleProjectItemCommand = async (
  sessionKey: string,
  type: 'task' | 'note' | 'meeting' | 'requirement' | 'credential' | 'work_done',
  content: string,
  metadata?: SaveMetadata
) => {
  if (!content) {
    return NextResponse.json({ error: `${type} content is required` }, { status: 400 });
  }

  const activeProject = await getActiveProject(sessionKey);

  if (!activeProject) {
    return askForProject();
  }

  if (type === 'task') {
    const task = await createProjectTask(activeProject, content, metadata);
    await setLastItem(sessionKey, 'task', task._id);

    return NextResponse.json({
      message: `Task added to ${activeProject.name}`,
      activeProject: getProjectDisplay(activeProject),
      data: task
    });
  }

  if (type === 'note') {
    const note = await createProjectNote(activeProject, content, metadata);
    await setLastItem(sessionKey, 'note', note._id);

    return NextResponse.json({
      message: `Note added to ${activeProject.name}`,
      activeProject: getProjectDisplay(activeProject),
      data: note
    });
  }

  if (type === 'requirement' || type === 'credential' || type === 'work_done') {
    const note = await createTypedProjectNote(activeProject, content, type, metadata);
    const label = type === 'work_done' ? 'Work entry' : `${type[0].toUpperCase()}${type.slice(1)}`;
    await setLastItem(sessionKey, 'note', note._id);

    return NextResponse.json({
      message: `${label} added to ${activeProject.name}`,
      activeProject: getProjectDisplay(activeProject),
      data: note
    });
  }

  const meeting = await createProjectMeeting(activeProject, content, metadata);
  await setLastItem(sessionKey, 'meeting', meeting._id);

  return NextResponse.json({
    message: `Meeting added to ${activeProject.name}`,
    activeProject: getProjectDisplay(activeProject),
    data: meeting
  });
};

const handleProjectScopedList = async (
  sessionKey: string,
  type: 'tasks' | 'notes' | 'meetings'
) => {
  const activeProject = await getActiveProject(sessionKey);

  if (!activeProject) {
    return askForProject();
  }

  const data =
    type === 'tasks'
      ? await listProjectTasks(activeProject._id)
      : type === 'notes'
        ? await listProjectNotes(activeProject._id)
        : await listProjectMeetings(activeProject._id);

  return NextResponse.json({
    message: `${type[0].toUpperCase()}${type.slice(1)} for ${activeProject.name}: ${data.length}`,
    activeProject: getProjectDisplay(activeProject),
    data
  });
};

const handleNaturalLanguage = async (sessionKey: string, input: string) => {
  const projectSwitch = input.match(/^(?:work on|switch to|open)\s+(.+)$/i);

  if (projectSwitch) {
    return handleProjectSelection(sessionKey, projectSwitch[1]);
  }

  const completedPendingTask = await handlePendingTaskCompletionConfirmation(sessionKey, input);

  if (completedPendingTask) {
    return completedPendingTask;
  }

  const completedTask = await handleTaskCompletionRequest(sessionKey, input);

  if (completedTask) {
    return completedTask;
  }

  const completedPendingReminder = await handlePendingReminderTime(sessionKey, input);

  if (completedPendingReminder) {
    return completedPendingReminder;
  }

  if (/^remind\s+me\b/i.test(input)) {
    return handleReminderRequest(sessionKey, input);
  }

  const memoryMatch = input.match(/^(?:remember this|save this|note this|store this)\s*:?\s+([\s\S]+)$/i);

  if (memoryMatch) {
    const memory = await createStandaloneMemory(memoryMatch[1].trim());
    await setLastItem(sessionKey, 'memory', memory._id);

    return NextResponse.json({
      message: 'Memory saved',
      data: memory
    });
  }

  const explicitSearch = input.match(/^find\s+(.+)$/i) || input.match(/^what do i know about\s+(.+)$/i);

  if (explicitSearch) {
    return handleRankedSearch(sessionKey, explicitSearch[1].trim());
  }

  if (isWorkLogStatement(input)) {
    return saveNaturalWorkLog(sessionKey, input);
  }

  if (/\btasks?\b/i.test(input)) {
    const project = await getProjectFromNaturalTaskQuestion(input);

    if (project || isSimpleListRequest(input, 'task')) {
      const activeProject = project || (await getActiveProject(sessionKey));

      if (!activeProject) {
        return askForProject();
      }

      const tasks = await listProjectTasks(activeProject._id);

      return NextResponse.json({
        message: `Tasks for ${activeProject.name}: ${tasks.length}`,
        activeProject: getProjectDisplay(activeProject),
        data: tasks
      });
    }
  }

  if (/\bnotes?\b/i.test(input)) {
    const project = await getProjectFromNaturalNoteQuestion(input);

    if (project || isSimpleListRequest(input, 'note')) {
      const activeProject = project || (await getActiveProject(sessionKey));

      if (!activeProject) {
        return askForProject();
      }

      const notes = await listProjectNotes(activeProject._id);

      return NextResponse.json({
        message: `Notes for ${activeProject.name}: ${notes.length}`,
        activeProject: getProjectDisplay(activeProject),
        data: notes
      });
    }
  }

  if (/\bmeetings?\b/i.test(input)) {
    const project = await getProjectFromNaturalMeetingQuestion(input);

    if (project || isSimpleListRequest(input, 'meeting')) {
      const activeProject = project || (await getActiveProject(sessionKey));

      if (!activeProject) {
        return askForProject();
      }

      const meetings = await listProjectMeetings(activeProject._id);

      return NextResponse.json({
        message: `Meetings for ${activeProject.name}: ${meetings.length}`,
        activeProject: getProjectDisplay(activeProject),
        data: meetings
      });
    }
  }

  return handleRankedSearch(sessionKey, input);
};

const handleCommand = async (
  sessionKey: string,
  input: string,
  metadata?: SaveMetadata | null
) => {
  if (metadata) {
    const structuredResponse = await handleStructuredSave(sessionKey, input, metadata);

    if (structuredResponse) {
      return structuredResponse;
    }
  }

  const commandMatch = input.match(/^@([a-z-]+)(?:\s+([\s\S]*))?$/i);

  if (!commandMatch) {
    return handleNaturalLanguage(sessionKey, input);
  }

  const command = commandMatch[1].toLowerCase();
  const content = normalizeWhitespace(commandMatch[2] || '');

  switch (command) {
    case 'project':
    case 'switch':
      return handleProjectSelection(sessionKey, content);

    case 'current': {
      const activeProject = await getActiveProject(sessionKey);

      return NextResponse.json({
        message: activeProject
          ? `Current active project: ${activeProject.name}`
          : 'No active project selected',
        activeProject: getProjectDisplay(activeProject)
      });
    }

    case 'task':
      return handleProjectItemCommand(sessionKey, 'task', content);

    case 'note':
      return handleProjectItemCommand(sessionKey, 'note', content);

    case 'requirement':
      return handleProjectItemCommand(sessionKey, 'requirement', content);

    case 'credential':
      return handleProjectItemCommand(sessionKey, 'credential', content);

    case 'work':
    case 'work-done':
      return handleProjectItemCommand(sessionKey, 'work_done', content);

    case 'log':
      return content
        ? saveNaturalWorkLog(sessionKey, content)
        : NextResponse.json({ error: 'log content is required' }, { status: 400 });

    case 'meeting':
      return handleProjectItemCommand(sessionKey, 'meeting', content);

    case 'reminder': {
      if (!content) {
        return NextResponse.json({ error: 'Reminder content is required' }, { status: 400 });
      }

      return handleReminderRequest(sessionKey, `remind me ${content}`);
    }

    case 'importance': {
      const importance = Number.parseInt(content, 10);

      if (!Number.isInteger(importance) || importance < 1 || importance > 5) {
        return NextResponse.json(
          { error: 'Importance must be a number from 1 to 5' },
          { status: 400 }
        );
      }

      return updateImportanceForLastItem(sessionKey, importance);
    }

    case 'summary': {
      const activeProject = await getActiveProject(sessionKey);

      if (!activeProject) {
        return askForProject();
      }

      const summary = await getProjectSummary(activeProject);

      return NextResponse.json({
        message: `Summary for ${activeProject.name}`,
        activeProject: getProjectDisplay(activeProject),
        data: summary
      });
    }

    case 'tasks':
      return handleProjectScopedList(sessionKey, 'tasks');

    case 'notes':
      return handleProjectScopedList(sessionKey, 'notes');

    case 'meetings':
      return handleProjectScopedList(sessionKey, 'meetings');

    case 'memory': {
      if (!content) {
        return NextResponse.json({ error: 'Memory content is required' }, { status: 400 });
      }

      const memory = await createStandaloneMemory(content);
      await setLastItem(sessionKey, 'memory', memory._id);

      return NextResponse.json({
        message: 'Memory saved',
        data: memory
      });
    }

    case 'find': {
      if (!content) {
        return NextResponse.json({ error: 'Search query is required' }, { status: 400 });
      }

      return handleRankedSearch(sessionKey, content);
    }

    case 'projects': {
      const projects = await Project.find().sort({ updatedAt: -1 }).limit(RECENT_LIMIT).lean();

      return NextResponse.json({
        message: `Projects: ${projects.length}`,
        data: projects
      });
    }

    case 'memories': {
      const memories = await Memory.find({
        category: { $ne: 'vault' },
        kind: { $ne: 'credential' },
        tags: { $nin: ['vault'] }
      })
        .sort({ createdAt: -1 })
        .limit(RECENT_LIMIT)
        .lean();

      return NextResponse.json({
        message: `Recent memories: ${memories.length}`,
        data: memories
      });
    }

    case 'delete-task':
      return handleDeleteTask(sessionKey, content);

    case 'delete-memory':
      return handleDeleteMemory(content);

    default:
      return NextResponse.json(
        { error: `Unsupported command: @${command}` },
        { status: 400 }
      );
  }
};

export async function POST(request: Request) {
  const authError = validateApiKey(request);

  if (authError) {
    return authError;
  }

  try {
    const body = await parseJsonBody(request);

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const input = typeof body.input === 'string' ? body.input.trim() : '';

    if (!input) {
      return NextResponse.json({ error: 'input is required' }, { status: 400 });
    }

    await connectDB();

    const sessionKey = getSessionKey(request, body);
    const metadata = extractSaveMetadata(body, input);

    return handleCommand(sessionKey, input, metadata);
  } catch (error) {
    const status = error instanceof Error && error.name === 'ValidationError' ? 400 : 500;

    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status }
    );
  }
}
