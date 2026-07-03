import { NextResponse } from 'next/server';

import {
  sortActivityItems,
  toExpenseActivity,
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
import Expense from '@/models/Expense';
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
const ANSWER_STOP_WORDS = new Set([
  'a',
  'about',
  'am',
  'an',
  'and',
  'are',
  'did',
  'do',
  'for',
  'go',
  'i',
  'in',
  'is',
  'me',
  'my',
  'of',
  'on',
  'show',
  'that',
  'the',
  'this',
  'to',
  'today',
  'was',
  'what',
  'where',
  'with'
]);
const LOCATION_QUERY_PATTERN = /\b(where|go|went|visit|visited|location|place|places)\b/i;
const LOCATION_SIGNAL_PATTERN =
  /\b(at|to|near|visited|went|mall|restaurant|cafe|office|home|hotel|airport|station|pizza|donuts|lunch|dinner|outing)\b/i;
const MONEY_QUERY_PATTERN = /\b(spend|spent|expense|expenses|paid|payment|money|cost|costs|amount|total)\b/i;

type SearchPlanType =
  | 'memory'
  | 'log'
  | 'task'
  | 'note'
  | 'meeting'
  | 'reminder'
  | 'daily_summary'
  | 'expense'
  | 'project';
type SearchTimeframe =
  | 'today'
  | 'tomorrow'
  | 'this_week'
  | 'this_month'
  | 'past_months'
  | 'upcoming'
  | 'all_time';

type SearchPlan = {
  keywords: string[];
  types: SearchPlanType[];
  project: string | null;
  timeframe: SearchTimeframe;
  monthsBack?: number;
};

type AnswerPayload = {
  answer: string;
  relevantIds: string[];
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

const getKolkataCalendarDate = (date: Date) => {
  const kolkataDate = new Date(date.getTime() + 330 * 60 * 1000);

  return {
    day: kolkataDate.getUTCDate(),
    month: kolkataDate.getUTCMonth(),
    year: kolkataDate.getUTCFullYear()
  };
};

const getDayBounds = (baseDate: Date, dayOffset = 0) => {
  const { day, month, year } = getKolkataCalendarDate(baseDate);
  const start = new Date(Date.UTC(year, month, day + dayOffset) - 330 * 60 * 1000);

  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  end.setUTCMilliseconds(end.getUTCMilliseconds() - 1);

  return { start, end };
};

const getWeekBounds = (baseDate: Date) => {
  const { day: monthDay, month, year } = getKolkataCalendarDate(baseDate);
  const kolkataStart = new Date(Date.UTC(year, month, monthDay));
  const day = kolkataStart.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  const start = new Date(Date.UTC(year, month, monthDay + diff) - 330 * 60 * 1000);

  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);
  end.setUTCMilliseconds(end.getUTCMilliseconds() - 1);

  return { start, end };
};

const getMonthBounds = (baseDate: Date) => {
  const { month, year } = getKolkataCalendarDate(baseDate);
  const start = new Date(Date.UTC(year, month, 1) - 330 * 60 * 1000);

  const end = new Date(Date.UTC(year, month + 1, 1) - 330 * 60 * 1000);
  end.setUTCMilliseconds(end.getUTCMilliseconds() - 1);

  return { start, end };
};

const getPastMonthsBounds = (baseDate: Date, monthsBack = 1) => {
  const { day, month, year } = getKolkataCalendarDate(baseDate);
  const start = new Date(Date.UTC(year, month - monthsBack, day) - 330 * 60 * 1000);
  const end = new Date(baseDate);

  return { start, end };
};

const getTimeframeRange = (timeframe: SearchTimeframe, monthsBack?: number) => {
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
    case 'past_months':
      return getPastMonthsBounds(now, monthsBack);
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

const buildCreatedAtQuery = (timeframe: SearchTimeframe, monthsBack?: number) => {
  const range = getTimeframeRange(timeframe, monthsBack);

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

const buildReminderQuery = (timeframe: SearchTimeframe, monthsBack?: number) => {
  const range = getTimeframeRange(timeframe, monthsBack);

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
          ['memory', 'log', 'task', 'note', 'meeting', 'reminder', 'daily_summary', 'expense', 'project'].includes(
            type
          )
      )
    : [];
  const timeframe =
    typeof record.timeframe === 'string' &&
    ['today', 'tomorrow', 'this_week', 'this_month', 'past_months', 'upcoming', 'all_time'].includes(
      record.timeframe
    )
      ? (record.timeframe as SearchTimeframe)
      : 'all_time';
  const monthsBack =
    typeof record.monthsBack === 'number' && Number.isFinite(record.monthsBack)
      ? Math.min(24, Math.max(1, Math.floor(record.monthsBack)))
      : undefined;

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
    timeframe,
    monthsBack
  };
};

const generateFallbackPlan = (query: string): SearchPlan => {
  const normalizedQuery = normalizeText(query);
  const queryTokens = tokenize(query).slice(0, 6);
  const pastMonthsMatch = query.match(/\b(?:past|last)\s+(\d{1,2})\s*(?:months?|mo)\b/i);
  const monthsBack = pastMonthsMatch ? Math.min(24, Math.max(1, Number(pastMonthsMatch[1]))) : undefined;

  return {
    keywords: queryTokens.filter(
      (token) =>
        ![
          'what',
          'where',
          'when',
          'who',
          'did',
          'work',
          'today',
          'anything',
          'show',
          'about',
          'know',
          'went',
          'go',
          'how',
          'much',
          'spend',
          'spent',
          'expense',
          'expenses',
          'paid',
          'payment',
          'money',
          'total'
        ].includes(token)
    ),
    project: /activex/i.test(normalizedQuery) ? 'ActiveX' : null,
    timeframe: /tomorrow/i.test(normalizedQuery)
      ? 'tomorrow'
      : /this week/i.test(normalizedQuery)
        ? 'this_week'
        : monthsBack
          ? 'past_months'
          : /this month|current month|month/i.test(normalizedQuery)
            ? 'this_month'
            : /today/i.test(normalizedQuery)
              ? 'today'
              : /upcoming/i.test(normalizedQuery)
                ? 'upcoming'
                : 'all_time',
    monthsBack,
    types: MONEY_QUERY_PATTERN.test(query)
      ? ['expense']
      : /daily|summary|summar|yesterday|last week|decisions|discuss/i.test(normalizedQuery)
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
  "timeframe": "all_time",
  "monthsBack": null
}

Rules:
- keywords should be 1 to 8 useful search terms
- types can include only: memory, log, task, note, meeting, reminder, daily_summary, expense, project
- project should be a project name if clearly implied, otherwise null
- timeframe must be one of: today, tomorrow, this_week, this_month, past_months, upcoming, all_time
- use timeframe "past_months" and set monthsBack for phrases like "past 4 months" or "last 5 months"
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
      case 'expense':
        return item.type === 'expense';
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

const getActivityDate = (item: ActivityItem) => {
  if (item.type === 'daily_summary' && 'date' in item && item.date) {
    return new Date(`${item.date}T00:00:00.000Z`);
  }

  if (item.type === 'expense' && 'timestamp' in item && item.timestamp) {
    return new Date(item.timestamp);
  }

  return new Date(item.createdAt);
};

const isWithinTimeframe = (item: ActivityItem, timeframe: SearchTimeframe, monthsBack?: number) => {
  const range = getTimeframeRange(timeframe, monthsBack);

  if (!range || timeframe === 'upcoming') {
    return true;
  }

  const activityDate = getActivityDate(item).getTime();

  return activityDate >= range.start.getTime() && activityDate <= range.end.getTime();
};

const filterByTimeframe = <T extends ActivityItem>(items: T[], plan: SearchPlan) =>
  items.filter((item) => isWithinTimeframe(item, plan.timeframe, plan.monthsBack));

const getTimeframeLabel = (timeframe: SearchTimeframe, monthsBack?: number) => {
  switch (timeframe) {
    case 'today':
      return 'today';
    case 'tomorrow':
      return 'tomorrow';
    case 'this_week':
      return 'this week';
    case 'this_month':
      return 'this month';
    case 'past_months':
      return `the past ${monthsBack || 1} month${(monthsBack || 1) === 1 ? '' : 's'}`;
    case 'upcoming':
      return 'the upcoming period';
    default:
      return 'the saved period';
  }
};

const formatCurrencyAmount = (amount: number, currency = 'INR') =>
  new Intl.NumberFormat('en-IN', {
    currency,
    maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    minimumFractionDigits: 0,
    style: 'currency'
  }).format(amount);

const getExpenseTimestampQuery = (plan: SearchPlan) => {
  const range = getTimeframeRange(plan.timeframe, plan.monthsBack);

  if (!range || plan.timeframe === 'upcoming') {
    return {};
  }

  return {
    timestamp: {
      $gte: range.start,
      $lte: range.end
    }
  };
};

const findExpenseActivitiesForSpendQuestion = async (plan: SearchPlan) => {
  await connectDB();
  const rows = await Expense.find({
    type: 'expense',
    ...getExpenseTimestampQuery(plan)
  })
    .sort({ timestamp: -1 })
    .limit(100)
    .lean();

  const activities = rows.map(toExpenseActivity);

  if (!plan.keywords.length) {
    return activities;
  }

  return activities.filter((item) => {
    const haystack = normalizeText(
      [item.merchant, item.category, item.content, item.originalSmsPreview, item.title].filter(Boolean).join(' ')
    );

    return plan.keywords.some((keyword) => haystack.includes(normalizeText(keyword)));
  });
};

const buildSpendAnswer = (items: ActivityItem[], plan: SearchPlan): AnswerPayload => {
  const expenses = items.filter((item) => item.type === 'expense');
  const timeframeLabel = getTimeframeLabel(plan.timeframe, plan.monthsBack);

  if (!expenses.length) {
    return {
      answer: `I couldn't find any saved spending for ${timeframeLabel}.`,
      relevantIds: [],
      summary: [],
      relevantTitles: []
    };
  }

  const currency = expenses[0].currency || 'INR';
  const total = expenses.reduce((sum, item) => sum + (typeof item.amount === 'number' ? item.amount : 0), 0);
  const topExpenses = [...expenses]
    .sort((left, right) => (right.amount || 0) - (left.amount || 0))
    .slice(0, 3);
  const merchantText = topExpenses
    .map((item) => `${formatCurrencyAmount(item.amount || 0, item.currency || currency)} at ${item.merchant}`)
    .join(', ');

  return {
    answer: `You spent ${formatCurrencyAmount(total, currency)} ${timeframeLabel} across ${
      expenses.length
    } transaction${expenses.length === 1 ? '' : 's'}${merchantText ? `. Biggest spends: ${merchantText}.` : '.'}`,
    relevantIds: expenses.map((item) => item._id).slice(0, 8),
    summary: topExpenses.map((item) => `${formatCurrencyAmount(item.amount || 0, item.currency || currency)} at ${item.merchant}`),
    relevantTitles: expenses.map((item) => item.title).slice(0, 8)
  };
};

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

const getAnswerKeywords = (query: string) =>
  tokenize(query).filter((token) => token.length > 2 && !ANSWER_STOP_WORDS.has(token));

const compactSnippet = (value: string) => value.replace(/\s+/g, ' ').trim();

const getItemAnswerText = (item: ActivityItem) => {
  const extraParts: string[] = [];

  if ('summary' in item && item.summary) {
    extraParts.push(item.summary);
  }

  if ('bodyMarkdown' in item && item.bodyMarkdown) {
    extraParts.push(item.bodyMarkdown);
  }

  if ('originalSmsPreview' in item && item.originalSmsPreview) {
    extraParts.push(item.originalSmsPreview);
  }

  if ('merchant' in item && item.merchant) {
    extraParts.push(item.merchant);
  }

  return [item.content, ...extraParts, item.title].filter(Boolean).join('\n');
};

const getBestAnswerSnippet = (item: ActivityItem, keywords: string[]) => {
  const text = getItemAnswerText(item);
  const candidates = text
    .split(/\n+|[.!?]\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  const keywordMatch = candidates.find((candidate) => {
    const normalized = normalizeText(candidate);
    return keywords.some((keyword) => normalized.includes(keyword));
  });
  const snippet = keywordMatch || candidates[0] || item.title;

  return compactSnippet(snippet);
};

const buildGroundedFallbackAnswer = (query: string, items: ActivityItem[]): AnswerPayload => {
  const availableIds = items.map((item) => item._id).filter(Boolean);
  const availableTitles = items.map((item) => item.title).filter(Boolean);
  const keywords = getAnswerKeywords(query);
  const isLocationQuestion = LOCATION_QUERY_PATTERN.test(query);
  const rawSnippets = uniq(
    items
      .slice(0, 4)
      .map((item) => getBestAnswerSnippet(item, keywords))
      .filter(Boolean)
  );
  const snippets = (isLocationQuestion
    ? rawSnippets.filter((snippet) => LOCATION_SIGNAL_PATTERN.test(snippet))
    : rawSnippets
  ).slice(0, 3);
  const answer =
    snippets.length > 0
      ? `I found ${items.length} saved item${items.length === 1 ? '' : 's'} related to your question. ${snippets.join(
          ' '
        )}`
      : isLocationQuestion
        ? `I found ${items.length} saved item${
            items.length === 1 ? '' : 's'
          } for that date, but I couldn't find any saved place or visit details.`
      : `I found ${items.length} saved item${items.length === 1 ? '' : 's'} related to that.`;

  return {
    answer,
    relevantIds: availableIds.slice(0, 6),
    summary: getRelevantHighlights(items).slice(0, 5),
    relevantTitles: availableTitles.slice(0, 6)
  };
};

const validateAnswerPayload = (
  value: unknown,
  availableIds: string[],
  availableTitles: string[]
): AnswerPayload | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const answer = typeof record.answer === 'string' ? record.answer.trim() : '';
  const allowedIds = new Set(availableIds);
  const relevantIds = Array.isArray(record.relevantIds)
    ? record.relevantIds
        .filter((item): item is string => typeof item === 'string' && allowedIds.has(item))
        .slice(0, 8)
    : [];
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
    relevantIds,
    summary,
    relevantTitles
  };
};

const generateGroundedAnswer = async (query: string, items: ActivityItem[]): Promise<AnswerPayload> => {
  if (!items.length) {
    return {
      answer: NO_RESULTS_ANSWER,
      relevantIds: [],
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
    date: item.type === 'daily_summary' && 'date' in item ? item.date : undefined,
    createdAt: item.createdAt,
    reminderAt: getReminderAt(item)
  }));

  const systemPrompt = `You answer questions only from retrieved memory records.

Return JSON only.

Schema:
{
  "answer": "",
  "relevantIds": [],
  "summary": [],
  "relevantTitles": []
}

Rules:
- use only the provided records
- never invent facts
- if the records are not enough, say "I couldn't find anything saved about that."
- if the question asks where the user went and the records do not mention places or visits, say that no saved place details were found
- answer should be concise, natural, and human; do not dump raw logs
- if a record is long, summarize the relevant part in your own words instead of copying or truncating it
- for "what did I do" style questions, write it like "This is what you did..."
- choose only records that directly support the answer
- relevantIds must be exact ids from the provided records only
- summary should be 1 to 5 short supporting lines
- relevantTitles must be exact titles from the provided records only`;

  const userPrompt = `Question:
${query}

Records:
${JSON.stringify(sourcePayload, null, 2)}`;

  const availableIds = sourcePayload.map((item) => item.id);
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
      const answer = validateAnswerPayload(parsed, availableIds, availableTitles);

      if (answer) {
        if (
          answer.answer === NO_RESULTS_ANSWER &&
          (answer.summary.length > 0 || answer.relevantTitles.length > 0 || items.length > 0)
        ) {
          return buildGroundedFallbackAnswer(query, items);
        }

        return answer;
      }
    } catch {
      continue;
    }
  }

  return buildGroundedFallbackAnswer(query, items);
};

const findActivities = async (query: string, plan: SearchPlan) => {
  await connectDB();
  const hybrid = await runHybridSearch(query, {
    limit: 10,
    types: plan.types as HybridSearchType[]
  });
  const results = filterByTimeframe(hybrid.results as SearchableActivity[], plan);

  return {
    results,
    debug: {
      ...hybrid.debug,
      timeframe: plan.timeframe,
      timeframeFilteredCount: results.length
    }
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

    if (MONEY_QUERY_PATTERN.test(query)) {
      const expenseResults = await findExpenseActivitiesForSpendQuestion(plan);
      const answer = buildSpendAnswer(expenseResults, plan);

      return NextResponse.json({
        answer: answer.answer,
        count: expenseResults.length,
        plan: {
          ...plan,
          types: ['expense']
        },
        projects: [],
        sources: expenseResults.slice(0, SEARCH_RESULT_LIMIT),
        summary: answer.summary,
        ...(shouldDebug
          ? {
              debug: {
                moneyQuery: true,
                timeframe: plan.timeframe,
                matchedExpenseCount: expenseResults.length
              }
            }
          : {})
      });
    }

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
    const relevantIds = new Set(answer.relevantIds);
    const relevantTitles = new Set(answer.relevantTitles);
    const aiSelectedSources = results.filter(
      (item) => relevantIds.has(item._id) || relevantTitles.has(item.title)
    );
    const orderedSources = (
      aiSelectedSources.length
        ? [
            ...aiSelectedSources,
            ...results.filter((item) => !relevantIds.has(item._id) && !relevantTitles.has(item.title))
          ]
        : results
    ).slice(0, SEARCH_RESULT_LIMIT);

    return NextResponse.json({
      answer: answer.answer || NO_RESULTS_ANSWER,
      count: aiSelectedSources.length || results.length,
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
