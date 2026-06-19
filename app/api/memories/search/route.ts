import { NextResponse } from 'next/server';

import { validateApiKey } from '@/lib/apiKey';
import { connectDB } from '@/lib/mongodb';
import Memory from '@/models/Memory';
import '@/models/Project';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SEARCH_RESULT_LIMIT = 20;
const SEARCH_CANDIDATE_LIMIT = 1000;
const PRIVATE_MEMORY_FILTER = {
  category: { $ne: 'vault' },
  kind: { $ne: 'credential' },
  tags: { $nin: ['vault'] }
} as const;
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
  'me',
  'memory',
  'my',
  'of',
  'on',
  'please',
  'show',
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

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Internal server error';

type SearchableMemory = {
  title?: string;
  content?: string;
  category?: string;
  kind?: string;
  tags?: string[];
  projectId?: unknown;
  createdAt?: Date | string;
};

type ScoredMemory<T> = {
  memory: T;
  score: number;
  createdAt: number;
};

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

const getSearchText = (memory: SearchableMemory) =>
  [
    memory.title,
    memory.content,
    memory.category,
    memory.kind,
    getProjectField(memory.projectId, 'name'),
    getProjectField(memory.projectId, 'description'),
    ...(Array.isArray(memory.tags) ? memory.tags : [])
  ]
    .filter(Boolean)
    .join(' ');

const getProjectField = (project: unknown, field: 'name' | 'description') => {
  if (!project || typeof project !== 'object' || !(field in project)) {
    return undefined;
  }

  const value = (project as Record<string, unknown>)[field];

  return typeof value === 'string' ? value : undefined;
};

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

const scoreQueryToken = (queryToken: string, memoryTokens: string[]) => {
  const allowedDistance = getAllowedDistance(queryToken);
  let bestScore = 0;

  for (const memoryToken of memoryTokens) {
    if (memoryToken === queryToken) {
      return 6;
    }

    if (
      queryToken.length >= 3 &&
      (memoryToken.includes(queryToken) || queryToken.includes(memoryToken))
    ) {
      bestScore = Math.max(bestScore, 4);
      continue;
    }

    if (allowedDistance > 0) {
      const distance = getEditDistance(queryToken, memoryToken, allowedDistance);

      if (distance <= allowedDistance) {
        bestScore = Math.max(bestScore, 3 - distance);
      }
    }
  }

  return bestScore;
};

const scoreMemory = (memory: SearchableMemory, query: string, queryTokens: string[]) => {
  const searchText = getSearchText(memory);
  const normalizedSearchText = normalizeText(searchText);
  const uniqueMemoryTokens = Array.from(new Set(tokenize(searchText)));

  if (!uniqueMemoryTokens.length) {
    return 0;
  }

  let score = normalizedSearchText.includes(normalizeText(query)) ? 10 : 0;
  let matchedTokens = 0;

  for (const queryToken of queryTokens) {
    const tokenScore = scoreQueryToken(queryToken, uniqueMemoryTokens);

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

    const candidates = await Memory.find(PRIVATE_MEMORY_FILTER)
      .sort({ createdAt: -1 })
      .limit(SEARCH_CANDIDATE_LIMIT)
      .populate('projectId', 'name description status')
      .lean();

    const memories = candidates
      .map((memory) => ({
        memory,
        score: scoreMemory(memory, query, queryTokens),
        createdAt: new Date(memory.createdAt).getTime()
      }))
      .filter((result): result is ScoredMemory<typeof candidates[number]> => result.score > 0)
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }

        return right.createdAt - left.createdAt;
      })
      .slice(0, SEARCH_RESULT_LIMIT)
      .map((result) => result.memory);

    return NextResponse.json({
      query,
      count: memories.length,
      limit: SEARCH_RESULT_LIMIT,
      data: memories
    });
  } catch (error) {
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}
