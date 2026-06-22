import type { FilterQuery } from 'mongoose';

import {
  toMeetingActivity,
  toMemoryActivity,
  toNoteActivity,
  toTaskActivity,
  type ActivityItem
} from '@/lib/activityFeed';
import { extractJsonBlock, requestOpenRouter } from '@/lib/openRouter';
import Memory from '@/models/Memory';
import Project from '@/models/Project';
import ProjectMeeting from '@/models/ProjectMeeting';
import ProjectNote from '@/models/ProjectNote';
import ProjectTask from '@/models/ProjectTask';

export type HybridSearchType = 'memory' | 'log' | 'task' | 'note' | 'meeting' | 'reminder' | 'project';

export type HybridSearchOptions = {
  activeProjectId?: string | null;
  debug?: boolean;
  limit?: number;
  types?: HybridSearchType[];
};

export type HybridSearchDebug = {
  query: string;
  cleanedQuery: string;
  candidateCount: number;
  rerankedCount: number;
  selectedIds: string[];
  scores: Array<{
    id: string;
    title: string;
    type: string;
    score: number;
    reasons: string[];
  }>;
  rerankReason?: string;
  rerankFailed?: boolean;
};

type HybridCandidate = ActivityItem & {
  score: number;
  scoreReasons: string[];
};

type RerankPayload = {
  selectedIds: string[];
  reason: string;
};

const SEARCH_MODELS = [
  'qwen/qwen3-next-80b-a3b-instruct:free',
  'openai/gpt-oss-120b:free'
] as const;

const FILLER_WORDS = new Set([
  'a',
  'about',
  'all',
  'anything',
  'check',
  'did',
  'find',
  'have',
  'i',
  'me',
  'on',
  'saved',
  'show',
  'tell',
  'the',
  'what'
]);

const PRIVATE_MEMORY_FILTER = {
  category: { $ne: 'vault' },
  kind: { $ne: 'credential' },
  tags: { $nin: ['vault'] }
} as const;

const CANDIDATE_LIMIT = 50;
const DEFAULT_RESULT_LIMIT = 10;

export const normalizeHybridSearchText = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const cleanHybridSearchQuery = (query: string) => {
  const tokens = normalizeHybridSearchText(query)
    .split(' ')
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !FILLER_WORDS.has(token));

  return tokens.length ? tokens.join(' ') : normalizeHybridSearchText(query);
};

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const getDate = (value: string | Date | undefined) => {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
};

const getProjectName = (item: ActivityItem) =>
  item.projectName || (item.projectId && typeof item.projectId === 'object' ? item.projectId.name : '');

const getSearchKind = (item: ActivityItem) => {
  if (item.type === 'task') {
    return 'task';
  }

  if (item.type === 'meeting') {
    return 'meeting';
  }

  if (item.type === 'note') {
    return item.kind === 'work_done' ? 'log' : item.kind;
  }

  if (item.reminderAt) {
    return 'reminder';
  }

  return item.kind;
};

const getContentPreview = (content: string) => {
  const normalized = content.replace(/\s+/g, ' ').trim();
  return normalized.length > 260 ? `${normalized.slice(0, 257)}...` : normalized;
};

const getTokens = (query: string) => cleanHybridSearchQuery(query).split(' ').filter(Boolean);

const buildRegexOr = (tokens: string[], fields: string[]) => {
  if (!tokens.length) {
    return [];
  }

  return tokens.flatMap((token) => {
    const regex = new RegExp(escapeRegex(token), 'i');
    return fields.map((field) => ({ [field]: regex }));
  });
};

const buildTextQuery = (query: string) => {
  const cleanedQuery = cleanHybridSearchQuery(query);
  return cleanedQuery ? { $text: { $search: cleanedQuery } } : {};
};

const safeFind = async <T>(textFind: () => Promise<T[]>, regexFind: () => Promise<T[]>) => {
  try {
    const [textRows, regexRows] = await Promise.all([textFind(), regexFind()]);
    return [...textRows, ...regexRows];
  } catch {
    return regexFind();
  }
};

const dedupeActivities = (items: ActivityItem[]) => {
  const seen = new Set<string>();
  const unique: ActivityItem[] = [];

  for (const item of items) {
    const key = `${item.type}:${item._id}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(item);
  }

  return unique;
};

const matchesRequestedTypes = (item: ActivityItem, types: HybridSearchType[] = []) => {
  if (!types.length) {
    return true;
  }

  return types.some((type) => {
    if (type === 'task') {
      return item.type === 'task' || item.kind === 'task';
    }

    if (type === 'meeting') {
      return item.type === 'meeting';
    }

    if (type === 'note') {
      return item.type === 'note' || (item.type === 'memory' && item.kind === 'note');
    }

    if (type === 'log') {
      return item.kind === 'work_done';
    }

    if (type === 'reminder') {
      return item.type === 'memory' && Boolean(item.reminderAt);
    }

    if (type === 'project') {
      return Boolean(getProjectName(item));
    }

    return item.type === 'memory';
  });
};

const getManualScore = (
  item: ActivityItem,
  query: string,
  activeProjectId?: string | null
) => {
  const cleanedQuery = cleanHybridSearchQuery(query);
  const tokens = getTokens(query);
  const title = normalizeHybridSearchText(item.title);
  const content = normalizeHybridSearchText(item.content || '');
  const category = normalizeHybridSearchText(item.category || '');
  const project = normalizeHybridSearchText(getProjectName(item));
  const kind = normalizeHybridSearchText(getSearchKind(item));
  const tags = item.tags.map(normalizeHybridSearchText);
  const importance = typeof item.importance === 'number' ? item.importance : 0;
  const reasons: string[] = [];
  let score = 0;

  if (cleanedQuery && title === cleanedQuery) {
    score += 100;
    reasons.push('exact_title');
  } else if (cleanedQuery && title.includes(cleanedQuery)) {
    score += 70;
    reasons.push('partial_title');
  }

  if (tokens.some((token) => tags.includes(token))) {
    score += 80;
    reasons.push('exact_tag');
  }

  if (tokens.some((token) => project.includes(token))) {
    score += 60;
    reasons.push('project');
  }

  if (tokens.some((token) => kind === token || category === token)) {
    score += 40;
    reasons.push('kind');
  }

  if (tokens.some((token) => content.includes(token))) {
    score += 20;
    reasons.push('content');
  }

  const createdAt = getDate(item.createdAt);

  if (createdAt && Date.now() - createdAt.getTime() <= 7 * 24 * 60 * 60 * 1000) {
    score += 10;
    reasons.push('recent');
  }

  const itemProjectId =
    item.projectId && typeof item.projectId === 'object' ? item.projectId._id : item.projectId;

  if (activeProjectId && String(itemProjectId || '') === activeProjectId) {
    score += 50;
    reasons.push('active_project');
  }

  if (importance) {
    score += importance * 10;
    reasons.push('importance');
  }

  return { score, reasons };
};

const scoreCandidates = (
  items: ActivityItem[],
  query: string,
  activeProjectId?: string | null
): HybridCandidate[] =>
  items
    .map((item) => {
      const { score, reasons } = getManualScore(item, query, activeProjectId);
      return {
        ...item,
        score,
        scoreReasons: reasons
      };
    })
    .filter((item) => item.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        (getDate(right.createdAt)?.getTime() || 0) - (getDate(left.createdAt)?.getTime() || 0)
    )
    .slice(0, CANDIDATE_LIMIT);

const toRerankRecord = (item: HybridCandidate) => ({
  id: item._id,
  title: item.title,
  contentPreview: getContentPreview(item.content || ''),
  tags: item.tags,
  project: getProjectName(item),
  kind: getSearchKind(item),
  type: item.type,
  importance: item.importance || null,
  createdAt: item.createdAt
});

const validateRerankPayload = (value: unknown, allowedIds: Set<string>): RerankPayload | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const selectedIds = Array.isArray(record.selectedIds)
    ? record.selectedIds
        .filter((id): id is string => typeof id === 'string' && allowedIds.has(id))
        .slice(0, DEFAULT_RESULT_LIMIT)
    : [];

  if (!selectedIds.length) {
    return null;
  }

  return {
    selectedIds,
    reason: typeof record.reason === 'string' ? record.reason : ''
  };
};

const aiRerankCandidates = async (query: string, candidates: HybridCandidate[]) => {
  const records = candidates.map(toRerankRecord);
  const allowedIds = new Set(records.map((record) => record.id));
  const systemPrompt = `You are a search relevance engine.

Given:
- User query
- Candidate memory records

Return only the most relevant results.

Rules:
- Prefer exact project matches.
- Prefer title matches.
- Prefer tag matches.
- Prefer technical relevance.
- Prefer recent items when relevance is similar.
- Exclude weak matches.
- Select maximum 10 records.
- Never invent IDs.

Return JSON only:
{
  "selectedIds": [],
  "reason": ""
}`;

  const userPrompt = `User query:
${query}

Candidate records:
${JSON.stringify(records, null, 2)}`;

  for (const model of SEARCH_MODELS) {
    try {
      const raw = await requestOpenRouter({
        model,
        temperature: 0,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      });
      const parsed = JSON.parse(extractJsonBlock(raw));
      const payload = validateRerankPayload(parsed, allowedIds);

      if (payload) {
        return payload;
      }
    } catch {
      continue;
    }
  }

  return null;
};

const buildProjectMap = async (tokens: string[]) => {
  const regexes = tokens.map((token) => new RegExp(escapeRegex(token), 'i'));

  if (!regexes.length) {
    return new Map<string, string>();
  }

  const projects = await Project.find({
    $or: [
      { name: { $in: regexes } },
      { description: { $in: regexes } },
      { tags: { $in: regexes } }
    ]
  })
    .select('_id name')
    .limit(20)
    .lean();

  return new Map(projects.map((project) => [String(project._id), project.name]));
};

export const collectHybridCandidates = async (query: string, options: HybridSearchOptions = {}) => {
  const tokens = getTokens(query);
  const projectMap = await buildProjectMap(tokens);
  const projectIds = Array.from(projectMap.keys());
  const projectObjectIds = projectIds;
  const projectFilter = projectObjectIds.length ? [{ projectId: { $in: projectObjectIds } }] : [];
  const memoryRegexOr = [
    ...buildRegexOr(tokens, ['title', 'content', 'tags', 'category', 'kind']),
    ...projectFilter
  ];
  const taskRegexOr = [
    ...buildRegexOr(tokens, ['title', 'description', 'tags', 'category', 'status']),
    ...projectFilter
  ];
  const noteRegexOr = [
    ...buildRegexOr(tokens, ['title', 'content', 'tags', 'category', 'kind']),
    ...projectFilter
  ];
  const meetingRegexOr = [
    ...buildRegexOr(tokens, ['title', 'details', 'tags', 'category']),
    ...projectFilter
  ];
  const memoryTextQuery = buildTextQuery(query) as FilterQuery<unknown>;
  const taskTextQuery = buildTextQuery(query) as FilterQuery<unknown>;

  const [memories, tasks, notes, meetings] = await Promise.all([
    safeFind(
      () =>
        Memory.find({ ...PRIVATE_MEMORY_FILTER, ...memoryTextQuery })
          .sort({ score: { $meta: 'textScore' }, createdAt: -1 })
          .limit(CANDIDATE_LIMIT)
          .populate('projectId', 'name description status')
          .lean(),
      () =>
        Memory.find({
          ...PRIVATE_MEMORY_FILTER,
          ...(memoryRegexOr.length ? { $or: memoryRegexOr } : {})
        })
          .sort({ createdAt: -1 })
          .limit(CANDIDATE_LIMIT)
          .populate('projectId', 'name description status')
          .lean()
    ),
    safeFind(
      () =>
        ProjectTask.find(taskTextQuery)
          .sort({ score: { $meta: 'textScore' }, createdAt: -1 })
          .limit(CANDIDATE_LIMIT)
          .populate('projectId', 'name description status')
          .lean(),
      () =>
        ProjectTask.find(taskRegexOr.length ? { $or: taskRegexOr } : {})
          .sort({ createdAt: -1 })
          .limit(CANDIDATE_LIMIT)
          .populate('projectId', 'name description status')
          .lean()
    ),
    safeFind(
      () =>
        ProjectNote.find(taskTextQuery)
          .sort({ score: { $meta: 'textScore' }, createdAt: -1 })
          .limit(CANDIDATE_LIMIT)
          .populate('projectId', 'name description status')
          .lean(),
      () =>
        ProjectNote.find(noteRegexOr.length ? { $or: noteRegexOr } : {})
          .sort({ createdAt: -1 })
          .limit(CANDIDATE_LIMIT)
          .populate('projectId', 'name description status')
          .lean()
    ),
    safeFind(
      () =>
        ProjectMeeting.find(taskTextQuery)
          .sort({ score: { $meta: 'textScore' }, createdAt: -1 })
          .limit(CANDIDATE_LIMIT)
          .populate('projectId', 'name description status')
          .lean(),
      () =>
        ProjectMeeting.find(meetingRegexOr.length ? { $or: meetingRegexOr } : {})
          .sort({ createdAt: -1 })
          .limit(CANDIDATE_LIMIT)
          .populate('projectId', 'name description status')
          .lean()
    )
  ]);

  return dedupeActivities([
    ...memories.map(toMemoryActivity),
    ...tasks.map(toTaskActivity),
    ...notes.map(toNoteActivity),
    ...meetings.map(toMeetingActivity)
  ]).filter((item) => matchesRequestedTypes(item, options.types));
};

export const runHybridSearch = async (query: string, options: HybridSearchOptions = {}) => {
  const candidates = await collectHybridCandidates(query, options);
  const rankedCandidates = scoreCandidates(candidates, query, options.activeProjectId);
  const fallbackSelected = rankedCandidates.slice(0, options.limit || DEFAULT_RESULT_LIMIT);
  let selected = fallbackSelected;
  let rerankReason = '';
  let rerankFailed = false;

  if (rankedCandidates.length) {
    const reranked = await aiRerankCandidates(query, rankedCandidates);

    if (reranked) {
      const rankById = new Map(rankedCandidates.map((item) => [item._id, item]));
      selected = reranked.selectedIds
        .map((id) => rankById.get(id))
        .filter((item): item is HybridCandidate => Boolean(item))
        .slice(0, options.limit || DEFAULT_RESULT_LIMIT);
      rerankReason = reranked.reason;
    } else {
      rerankFailed = true;
    }
  }

  const debug: HybridSearchDebug = {
    query,
    cleanedQuery: cleanHybridSearchQuery(query),
    candidateCount: candidates.length,
    rerankedCount: selected.length,
    selectedIds: selected.map((item) => item._id),
    scores: rankedCandidates.map((item) => ({
      id: item._id,
      title: item.title,
      type: item.type,
      score: item.score,
      reasons: item.scoreReasons
    })),
    ...(rerankReason ? { rerankReason } : {}),
    ...(rerankFailed ? { rerankFailed } : {})
  };

  return {
    candidates: rankedCandidates,
    results: selected,
    debug
  };
};
