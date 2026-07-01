import { NextResponse } from 'next/server';

import {
  sortActivityItems,
  toMeetingActivity,
  toMemoryActivity,
  toNoteActivity,
  toTaskActivity,
  type ActivityItem
} from '@/lib/activityFeed';
import { validateApiKey } from '@/lib/apiKey';
import { runHybridSearch, type HybridSearchType } from '@/lib/hybridSearch';
import { connectDB } from '@/lib/mongodb';
import { extractJsonBlock, requestOpenRouter } from '@/lib/openRouter';
import Memory from '@/models/Memory';
import Project from '@/models/Project';
import '@/models/Project';
import ProjectMeeting from '@/models/ProjectMeeting';
import ProjectNote from '@/models/ProjectNote';
import ProjectTask from '@/models/ProjectTask';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SEARCH_MODELS = [
  'qwen/qwen3-next-80b-a3b-instruct:free',
  'openai/gpt-oss-120b:free'
] as const;

const PRIVATE_MEMORY_FILTER = {
  category: { $ne: 'vault' },
  kind: { $ne: 'credential' },
  tags: { $nin: ['vault'] }
} as const;

const SEARCH_RESULT_LIMIT = 20;
const CANDIDATE_LIMIT = 120;
const NO_RESULTS_ANSWER = "I couldn't find anything saved about that.";

type SearchPlanType =
  | 'memory'
  | 'log'
  | 'task'
  | 'note'
  | 'meeting'
  | 'reminder'
  | 'daily_summary'
  | 'project';
type SearchTimeframe = 'today' | 'tomorrow' | 'this_week' | 'this_month' | 'upcoming' | 'all_time';

type SearchPlan = {
  keywords: string[];
  types: SearchPlanType[];
  project: string | null;
  timeframe: SearchTimeframe;
};

type AnswerPayload = {
  answer: string;
  summary: string[];
  relevantTitles: string[];
};

type SearchableActivity = ActivityItem & {
  score?: number;
};

const SEARCH_PLAN_FALLBACK: SearchPlan = {
  keywords: [],
  types: [],
  project: null,
  timeframe: 'all_time'
};

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Internal server error';

const normalizeText = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const tokenize = (value: string) => normalizeText(value).split(/\s+/).filter(Boolean);

const uniq = <T,>(value: T[]) => Array.from(new Set(value));

const getNow = () => new Date();

const getDayBounds = (baseDate: Date, dayOffset = 0) => {
  const start = new Date(baseDate);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() + dayOffset);

  const end = new Date(start);
  end.setHours(23, 59, 59, 999);

  return { start, end };
};

const getWeekBounds = (baseDate: Date) => {
  const start = new Date(baseDate);
  start.setHours(0, 0, 0, 0);
  const day = start.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + diff);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  return { start, end };
};

const getMonthBounds = (baseDate: Date) => {
  const start = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
  start.setHours(0, 0, 0, 0);

  const end = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0);
  end.setHours(23, 59, 59, 999);

  return { start, end };
};

const getTimeframeRange = (timeframe: SearchTimeframe) => {
  const now = getNow();

  switch (timeframe) {
    case 'today':
      return getDayBounds(now);
    case 'tomorrow':
      return getDayBounds(now, 1);
    case 'this_week':
      return getWeekBounds(now);
    case 'this_month':
      return getMonthBounds(now);
    case 'upcoming': {
      const start = new Date(now);
      const end = new Date(now);
      end.setDate(end.getDate() + 14);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }
    default:
      return null;
  }
};

const buildCreatedAtQuery = (timeframe: SearchTimeframe) => {
  const range = getTimeframeRange(timeframe);

  if (!range || timeframe === 'upcoming') {
    return {};
  }

  return {
    createdAt: {
      $gte: range.start,
      $lte: range.end
    }
  };
};

const buildReminderQuery = (timeframe: SearchTimeframe) => {
  const range = getTimeframeRange(timeframe);

  if (!range) {
    return {};
  }

  return {
    reminderAt: {
      $gte: range.start,
      $lte: range.end
    },
    notificationEnabled: true
  };
};

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildTokenRegexes = (keywords: string[]) =>
  keywords
    .map((keyword) => keyword.trim())
    .filter(Boolean)
    .map((keyword) => new RegExp(escapeRegex(keyword), 'i'));

const validateSearchPlan = (value: unknown): SearchPlan | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const types = Array.isArray(record.types)
    ? record.types.filter(
        (type): type is SearchPlanType =>
          typeof type === 'string' &&
          ['memory', 'log', 'task', 'note', 'meeting', 'reminder', 'daily_summary', 'project'].includes(type)
      )
    : [];
  const timeframe =
    typeof record.timeframe === 'string' &&
    ['today', 'tomorrow', 'this_week', 'this_month', 'upcoming', 'all_time'].includes(
      record.timeframe
    )
      ? (record.timeframe as SearchTimeframe)
      : 'all_time';

  return {
    keywords: Array.isArray(record.keywords)
      ? record.keywords
          .filter((keyword): keyword is string => typeof keyword === 'string')
          .map((keyword) => normalizeText(keyword))
          .filter(Boolean)
          .slice(0, 8)
      : [],
    types,
    project:
      typeof record.project === 'string' && record.project.trim() ? record.project.trim() : null,
    timeframe
  };
};

const generateFallbackPlan = (query: string): SearchPlan => {
  const normalizedQuery = normalizeText(query);
  const queryTokens = tokenize(query).slice(0, 6);

  return {
    keywords: queryTokens.filter(
      (token) => !['what', 'did', 'work', 'today', 'anything', 'show', 'about', 'know'].includes(token)
    ),
    project: /activex/i.test(normalizedQuery) ? 'ActiveX' : null,
    timeframe: /tomorrow/i.test(normalizedQuery)
      ? 'tomorrow'
      : /this week/i.test(normalizedQuery)
        ? 'this_week'
        : /today/i.test(normalizedQuery)
          ? 'today'
          : /upcoming/i.test(normalizedQuery)
            ? 'upcoming'
            : 'all_time',
    types: /daily|summary|summar|yesterday|last week|decisions|discuss/i.test(normalizedQuery)
      ? ['daily_summary']
      : /reminder/i.test(normalizedQuery)
      ? ['reminder']
      : /meeting/i.test(normalizedQuery)
        ? ['meeting']
        : /task/i.test(normalizedQuery)
          ? ['task']
          : []
  };
};

const generateSearchPlan = async (query: string): Promise<SearchPlan> => {
  const today = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'full',
    timeZone: 'Asia/Kolkata'
  }).format(getNow());

  const systemPrompt = `You are a search planning engine for a personal memory app.

Turn the user question into JSON for Mongo-backed retrieval.

Return JSON only.

Schema:
{
  "keywords": [],
  "types": [],
  "project": null,
  "timeframe": "all_time"
}

Rules:
- keywords should be 1 to 8 useful search terms
- types can include only: memory, log, task, note, meeting, reminder, daily_summary, project
- project should be a project name if clearly implied, otherwise null
- timeframe must be one of: today, tomorrow, this_week, this_month, upcoming, all_time
- use "upcoming" for questions about future reminders
- never add explanations
- today's date is ${today}`;

  for (const model of SEARCH_MODELS) {
    try {
      const raw = await requestOpenRouter({
        model,
        temperature: 0.1,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: query }
        ]
      });
      const parsed = JSON.parse(extractJsonBlock(raw));
      const plan = validateSearchPlan(parsed);

      if (plan) {
        return plan;
      }
    } catch {
      continue;
    }
  }

  return generateFallbackPlan(query);
};

const resolveProjectIds = async (projectName: string | null) => {
  if (!projectName) {
    return [];
  }

  const projects = await Project.find({
    name: { $regex: escapeRegex(projectName), $options: 'i' }
  })
    .select('_id name')
    .limit(10)
    .lean();

  return projects.map((project) => project._id);
};

const matchesRequestedTypes = (item: ActivityItem, types: SearchPlanType[]) => {
  if (!types.length) {
    return true;
  }

  return types.some((type) => {
    switch (type) {
      case 'meeting':
        return item.type === 'meeting';
      case 'task':
        return item.type === 'task' || item.kind === 'task';
      case 'note':
        return item.type === 'note' || (item.type === 'memory' && item.kind === 'note');
      case 'memory':
      case 'log':
        return item.type === 'memory';
      case 'daily_summary':
        return item.type === 'daily_summary';
      case 'reminder':
        return item.type === 'memory' && Boolean(item.reminderAt);
      case 'project':
        return Boolean(item.projectName || (typeof item.projectId === 'object' && item.projectId?.name));
      default:
        return true;
    }
  });
};

const getProjectName = (item: ActivityItem) =>
  item.projectName || (item.projectId && typeof item.projectId === 'object' ? item.projectId.name : '');

const getReminderAt = (item: ActivityItem) =>
  'reminderAt' in item && typeof item.reminderAt === 'string' ? item.reminderAt : null;

const getActivityText = (item: ActivityItem) =>
  [item.title, item.content, item.category, item.kind, getProjectName(item), ...item.tags]
    .filter(Boolean)
    .join(' ');

const scoreActivity = (item: ActivityItem, query: string, keywords: string[], projectName: string | null) => {
  const normalizedQuery = normalizeText(query);
  const normalizedTitle = normalizeText(item.title);
  const normalizedContent = normalizeText(item.content || '');
  const normalizedCategory = normalizeText(item.category || '');
  const normalizedTags = item.tags.map(normalizeText);
  const normalizedProject = normalizeText(getProjectName(item));
  const haystack = normalizeText(getActivityText(item));
  let score = 0;

  if (normalizedQuery && haystack.includes(normalizedQuery)) {
    score += 24;
  }

  for (const keyword of keywords) {
    const normalizedKeyword = normalizeText(keyword);

    if (!normalizedKeyword) {
      continue;
    }

    if (normalizedTitle === normalizedKeyword) {
      score += 16;
    } else if (normalizedTitle.includes(normalizedKeyword)) {
      score += 12;
    }

    if (normalizedTags.some((tag) => tag === normalizedKeyword)) {
      score += 10;
    } else if (normalizedTags.some((tag) => tag.includes(normalizedKeyword))) {
      score += 7;
    }

    if (normalizedCategory === normalizedKeyword || normalizedCategory.includes(normalizedKeyword)) {
      score += 6;
    }

    if (normalizedContent.includes(normalizedKeyword)) {
      score += 5;
    }

    if (normalizedProject && normalizedProject.includes(normalizedKeyword)) {
      score += 8;
    }
  }

  if (projectName && normalizedProject && normalizedProject.includes(normalizeText(projectName))) {
    score += 14;
  }

  const createdAt = new Date(item.createdAt).getTime();
  const ageDays = Math.max(0, (Date.now() - createdAt) / (1000 * 60 * 60 * 24));
  score += Math.max(0, 5 - Math.floor(ageDays / 3));

  return score;
};

const getRelevantHighlights = (items: ActivityItem[]) =>
  uniq(
    items
      .slice(0, 8)
      .map((item) => item.title.trim())
      .filter(Boolean)
  );

const buildGroundedFallbackAnswer = (items: ActivityItem[]): AnswerPayload => {
  const availableTitles = items.map((item) => item.title).filter(Boolean);

  return {
    answer: `I found ${items.length} saved item${items.length === 1 ? '' : 's'} related to that.`,
    summary: getRelevantHighlights(items).slice(0, 5),
    relevantTitles: availableTitles.slice(0, 6)
  };
};

const validateAnswerPayload = (
  value: unknown,
  availableTitles: string[]
): AnswerPayload | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const answer = typeof record.answer === 'string' ? record.answer.trim() : '';
  const summary = Array.isArray(record.summary)
    ? record.summary
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 5)
    : [];
  const relevantTitles = Array.isArray(record.relevantTitles)
    ? record.relevantTitles
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter((title) => availableTitles.includes(title))
        .slice(0, 8)
    : [];

  if (!answer) {
    return null;
  }

  return {
    answer,
    summary,
    relevantTitles
  };
};

const generateGroundedAnswer = async (query: string, items: ActivityItem[]): Promise<AnswerPayload> => {
  if (!items.length) {
    return {
      answer: NO_RESULTS_ANSWER,
      summary: [],
      relevantTitles: []
    };
  }

  const sourcePayload = items.slice(0, 12).map((item) => ({
    id: item._id,
    type: item.type,
    title: item.title,
    content: item.content,
    category: item.category,
    tags: item.tags,
    project: getProjectName(item),
    createdAt: item.createdAt,
    reminderAt: getReminderAt(item)
  }));

  const systemPrompt = `You answer questions only from retrieved memory records.

Return JSON only.

Schema:
{
  "answer": "",
  "summary": [],
  "relevantTitles": []
}

Rules:
- use only the provided records
- never invent facts
- if the records are not enough, say "I couldn't find anything saved about that."
- answer should be concise and direct
- summary should be 1 to 5 short bullet-style lines
- relevantTitles must be exact titles from the provided records only`;

  const userPrompt = `Question:
${query}

Records:
${JSON.stringify(sourcePayload, null, 2)}`;

  const availableTitles = sourcePayload.map((item) => item.title);

  for (const model of SEARCH_MODELS) {
    try {
      const raw = await requestOpenRouter({
        model,
        temperature: 0.1,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      });
      const parsed = JSON.parse(extractJsonBlock(raw));
      const answer = validateAnswerPayload(parsed, availableTitles);

      if (answer) {
        if (
          answer.answer === NO_RESULTS_ANSWER &&
          (answer.summary.length > 0 || answer.relevantTitles.length > 0 || items.length > 0)
        ) {
          return buildGroundedFallbackAnswer(items);
        }

        return answer;
      }
    } catch {
      continue;
    }
  }

  return buildGroundedFallbackAnswer(items);
};

const findActivities = async (query: string, plan: SearchPlan) => {
  await connectDB();
  const hybrid = await runHybridSearch(query, {
    limit: 10,
    types: plan.types as HybridSearchType[]
  });

  return {
    results: hybrid.results as SearchableActivity[],
    debug: hybrid.debug
  };
};

export async function POST(request: Request) {
  const authError = validateApiKey(request);

  if (authError) {
    return authError;
  }

  try {
    const { searchParams } = new URL(request.url);
    const debug = searchParams.get('debug') === 'true';
    const body = (await request.json()) as { debug?: boolean; query?: string };
    const query = typeof body.query === 'string' ? body.query.trim() : '';
    const shouldDebug = debug || body.debug === true;

    if (!query) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    const plan = generateFallbackPlan(query);
    const search = await findActivities(query, plan);
    const results = search.results;

    if (!results.length) {
      return NextResponse.json({
        answer: NO_RESULTS_ANSWER,
        count: 0,
        ...(shouldDebug ? { debug: search.debug } : {}),
        plan,
        projects: [],
        sources: [],
        summary: []
      });
    }

    const answer = await generateGroundedAnswer(
      query,
      results.map(({ score: _score, ...item }) => item)
    );
    const relevantTitles = new Set(answer.relevantTitles);
    const orderedSources = [
      ...results.filter((item) => relevantTitles.has(item.title)),
      ...results.filter((item) => !relevantTitles.has(item.title))
    ].slice(0, SEARCH_RESULT_LIMIT);

    return NextResponse.json({
      answer: answer.answer || NO_RESULTS_ANSWER,
      count: results.length,
      plan,
      projects: uniq(orderedSources.map(getProjectName).filter(Boolean)),
      sources: orderedSources.map(({ score: _score, ...item }) => item),
      summary: answer.summary.length ? answer.summary : getRelevantHighlights(orderedSources),
      ...(shouldDebug ? { debug: search.debug } : {})
    });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
