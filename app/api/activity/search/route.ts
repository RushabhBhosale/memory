import { NextResponse } from 'next/server';

import {
  sortActivityItems,
  toMeetingActivity,
  toMemoryActivity,
  toNoteActivity,
  toTaskActivity
} from '@/lib/activityFeed';
import { validateApiKey } from '@/lib/apiKey';
import { connectDB } from '@/lib/mongodb';
import Memory from '@/models/Memory';
import '@/models/Project';
import ProjectMeeting from '@/models/ProjectMeeting';
import ProjectNote from '@/models/ProjectNote';
import ProjectTask from '@/models/ProjectTask';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SEARCH_RESULT_LIMIT = 40;
const SEARCH_CANDIDATE_LIMIT = 1000;
const STOP_WORDS = new Set([
  'a',
  'about',
  'all',
  'also',
  'am',
  'an',
  'and',
  'any',
  'are',
  'as',
  'at',
  'be',
  'can',
  'check',
  'database',
  'db',
  'did',
  'do',
  'does',
  'for',
  'from',
  'give',
  'have',
  'i',
  'in',
  'info',
  'is',
  'it',
  'log',
  'memory',
  'me',
  'my',
  'note',
  'of',
  'on',
  'please',
  'show',
  'task',
  'tell',
  'the',
  'there',
  'to',
  'up',
  'was',
  'what',
  'when',
  'where',
  'which',
  'with'
]);

type SearchableActivity = {
  title?: string;
  content?: string;
  category?: string;
  kind?: string;
  type?: string;
  status?: string;
  tags?: string[];
  projectId?: unknown;
  projectName?: string;
  createdAt?: Date | string;
};

type ScoredActivity<T> = {
  activity: T;
  score: number;
  createdAt: number;
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

const getQueryTokens = (value: string) => {
  const tokens = tokenize(value);
  const meaningfulTokens = tokens.filter((token) => !STOP_WORDS.has(token));

  return meaningfulTokens.length ? meaningfulTokens : tokens;
};

const getProjectField = (project: unknown, field: 'name' | 'description') => {
  if (!project || typeof project !== 'object' || !(field in project)) {
    return undefined;
  }

  const value = (project as Record<string, unknown>)[field];

  return typeof value === 'string' ? value : undefined;
};

const getSearchText = (activity: SearchableActivity) =>
  [
    activity.title,
    activity.content,
    activity.category,
    activity.kind,
    activity.type,
    activity.status,
    activity.projectName,
    getProjectField(activity.projectId, 'name'),
    getProjectField(activity.projectId, 'description'),
    ...(Array.isArray(activity.tags) ? activity.tags : [])
  ]
    .filter(Boolean)
    .join(' ');

const getAllowedDistance = (token: string) => {
  if (token.length <= 3) {
    return 0;
  }

  if (token.length <= 5) {
    return 1;
  }

  return 2;
};

const getEditDistance = (left: string, right: string, maxDistance: number) => {
  if (Math.abs(left.length - right.length) > maxDistance) {
    return maxDistance + 1;
  }

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = new Array<number>(right.length + 1);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex;
    let rowMinimum = current[0];

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;

      current[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        current[rightIndex - 1] + 1,
        previous[rightIndex - 1] + substitutionCost
      );

      rowMinimum = Math.min(rowMinimum, current[rightIndex]);
    }

    if (rowMinimum > maxDistance) {
      return maxDistance + 1;
    }

    for (let index = 0; index < previous.length; index += 1) {
      previous[index] = current[index];
    }
  }

  return previous[right.length];
};

const scoreQueryToken = (queryToken: string, activityTokens: string[]) => {
  const allowedDistance = getAllowedDistance(queryToken);
  let bestScore = 0;

  for (const activityToken of activityTokens) {
    if (activityToken === queryToken) {
      return 6;
    }

    if (
      queryToken.length >= 3 &&
      (activityToken.includes(queryToken) || queryToken.includes(activityToken))
    ) {
      bestScore = Math.max(bestScore, 4);
      continue;
    }

    if (allowedDistance > 0) {
      const distance = getEditDistance(queryToken, activityToken, allowedDistance);

      if (distance <= allowedDistance) {
        bestScore = Math.max(bestScore, 3 - distance);
      }
    }
  }

  return bestScore;
};

const scoreActivity = (activity: SearchableActivity, query: string, queryTokens: string[]) => {
  const searchText = getSearchText(activity);
  const normalizedSearchText = normalizeText(searchText);
  const uniqueActivityTokens = Array.from(new Set(tokenize(searchText)));

  if (!uniqueActivityTokens.length) {
    return 0;
  }

  let score = normalizedSearchText.includes(normalizeText(query)) ? 10 : 0;
  let matchedTokens = 0;

  for (const queryToken of queryTokens) {
    const tokenScore = scoreQueryToken(queryToken, uniqueActivityTokens);

    if (tokenScore) {
      matchedTokens += 1;
      score += tokenScore;
    }
  }

  if (!matchedTokens) {
    return 0;
  }

  const requiredMatches = queryTokens.length <= 2 ? 1 : Math.ceil(queryTokens.length * 0.55);

  if (matchedTokens < requiredMatches) {
    return 0;
  }

  return score + matchedTokens * 2;
};

export async function GET(request: Request) {
  const authError = validateApiKey(request);

  if (authError) {
    return authError;
  }

  try {
    const { searchParams } = new URL(request.url);
    const query = String(searchParams.get('q') || '').trim();

    if (!query) {
      return NextResponse.json(
        { error: 'Search query parameter q is required' },
        { status: 400 }
      );
    }

    const queryTokens = getQueryTokens(query);

    if (!queryTokens.length) {
      return NextResponse.json(
        { error: 'Search query parameter q is required' },
        { status: 400 }
      );
    }

    await connectDB();

    const [memories, tasks, notes, meetings] = await Promise.all([
      Memory.find()
        .sort({ createdAt: -1 })
        .limit(SEARCH_CANDIDATE_LIMIT)
        .populate('projectId', 'name description status')
        .lean(),
      ProjectTask.find()
        .sort({ createdAt: -1 })
        .limit(SEARCH_CANDIDATE_LIMIT)
        .populate('projectId', 'name description status')
        .lean(),
      ProjectNote.find()
        .sort({ createdAt: -1 })
        .limit(SEARCH_CANDIDATE_LIMIT)
        .populate('projectId', 'name description status')
        .lean(),
      ProjectMeeting.find()
        .sort({ createdAt: -1 })
        .limit(SEARCH_CANDIDATE_LIMIT)
        .populate('projectId', 'name description status')
        .lean()
    ]);

    const activity = sortActivityItems([
      ...memories.map(toMemoryActivity),
      ...tasks.map(toTaskActivity),
      ...notes.map(toNoteActivity),
      ...meetings.map(toMeetingActivity)
    ]);

    const data = activity
      .map((item) => ({
        activity: item,
        score: scoreActivity(item, query, queryTokens),
        createdAt: new Date(item.createdAt).getTime()
      }))
      .filter((result): result is ScoredActivity<typeof activity[number]> => result.score > 0)
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }

        return right.createdAt - left.createdAt;
      })
      .slice(0, SEARCH_RESULT_LIMIT)
      .map((result) => result.activity);

    return NextResponse.json({
      query,
      count: data.length,
      limit: SEARCH_RESULT_LIMIT,
      data
    });
  } catch (error) {
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}
