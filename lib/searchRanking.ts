export type SearchResultType = 'project' | 'task' | 'note' | 'meeting' | 'memory';

export type SearchCandidate = {
  id: string;
  type: SearchResultType;
  title: string;
  content: string;
  tags?: string[];
  projectId?: string;
  projectName?: string;
  importance?: number;
  createdAt?: Date | string;
};

export type RankedSearchResult = SearchCandidate & {
  score: number;
};

export type CompactSearchResult = {
  type: SearchResultType;
  title: string;
  content: string;
  projectName: string | null;
  importance: number | null;
  createdAt: string | null;
};

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
  'related',
  'the',
  'this',
  'to',
  'what'
]);

const normalizeSearchText = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const tokenizeSearchQuery = (query: string) => {
  const tokens = normalizeSearchText(query)
    .split(' ')
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !STOP_WORDS.has(token));

  return tokens.length ? tokens.slice(0, 12) : normalizeSearchText(query).split(' ').filter(Boolean);
};

const getDate = (value: Date | string | undefined) => {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
};

const clampImportance = (importance: number | undefined) => {
  if (typeof importance !== 'number' || Number.isNaN(importance)) {
    return null;
  }

  return Math.min(5, Math.max(1, Math.round(importance)));
};

const matchesText = (value: string | undefined, normalizedQuery: string, queryTokens: string[]) => {
  const normalizedValue = normalizeSearchText(value || '');

  if (!normalizedValue) {
    return false;
  }

  return normalizedValue.includes(normalizedQuery) ||
    queryTokens.some((token) => normalizedValue.includes(token));
};

const hasExactTagMatch = (tags: string[] | undefined, normalizedQuery: string, queryTokens: string[]) => {
  const normalizedTags = (tags || []).map((tag) => normalizeSearchText(tag));

  return normalizedTags.some(
    (tag) => tag === normalizedQuery || queryTokens.some((token) => tag === token)
  );
};

const getRecencyBoost = (createdAt: Date | string | undefined) => {
  const createdDate = getDate(createdAt);

  if (!createdDate) {
    return 0;
  }

  const ageMs = Date.now() - createdDate.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);

  if (ageDays <= 7) {
    return 20;
  }

  if (ageDays <= 30) {
    return 10;
  }

  return 0;
};

export const getSearchResultLimit = (totalResults: number) => {
  if (totalResults <= 20) {
    return totalResults;
  }

  if (totalResults <= 100) {
    return 10;
  }

  return 20;
};

export const rankSearchCandidates = (
  candidates: SearchCandidate[],
  query: string,
  activeProjectId?: string | null
) => {
  const normalizedQuery = normalizeSearchText(query);
  const queryTokens = tokenizeSearchQuery(query);

  return candidates
    .map((candidate) => {
      const importance = clampImportance(candidate.importance);
      const titleMatch = matchesText(candidate.title, normalizedQuery, queryTokens) ? 100 : 0;
      const tagMatch = hasExactTagMatch(candidate.tags, normalizedQuery, queryTokens) ? 80 : 0;
      const projectMatch = matchesText(candidate.projectName, normalizedQuery, queryTokens) ? 60 : 0;
      const contentMatch = matchesText(candidate.content, normalizedQuery, queryTokens) ? 30 : 0;
      const activeProjectBoost =
        activeProjectId && candidate.projectId === activeProjectId ? 50 : 0;
      const importanceBoost = importance ? importance * 20 : 0;
      const recencyBoost = getRecencyBoost(candidate.createdAt);

      return {
        ...candidate,
        importance: importance ?? candidate.importance,
        score:
          titleMatch +
          tagMatch +
          projectMatch +
          contentMatch +
          activeProjectBoost +
          importanceBoost +
          recencyBoost
      };
    })
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      const rightDate = getDate(right.createdAt)?.getTime() || 0;
      const leftDate = getDate(left.createdAt)?.getTime() || 0;

      return rightDate - leftDate;
    });
};

export const selectTopRankedResults = (
  rankedResults: RankedSearchResult[],
  totalResults: number
) => rankedResults.slice(0, getSearchResultLimit(totalResults));

const formatDate = (value: Date | string | undefined) => {
  const date = getDate(value);

  return date ? date.toISOString().slice(0, 10) : null;
};

const truncateContent = (value: string) => {
  const normalized = value.replace(/\s+/g, ' ').trim();

  return normalized.length > 700 ? `${normalized.slice(0, 697)}...` : normalized;
};

export const toCompactSearchResults = (results: RankedSearchResult[]): CompactSearchResult[] =>
  results.map((result) => ({
    type: result.type,
    title: result.title,
    content: truncateContent(result.content),
    projectName: result.projectName || null,
    importance: clampImportance(result.importance),
    createdAt: formatDate(result.createdAt)
  }));

export const buildCompactSearchContext = (query: string, results: RankedSearchResult[]) => {
  const compactResults = toCompactSearchResults(results);

  if (!compactResults.length) {
    return `Search Query: ${query}\n\nRetrieved Context:\nNo matching records found.`;
  }

  const entries = compactResults.map((result, index) => {
    const lines = [
      `${index + 1}. ${result.title}`,
      `Type: ${result.type}`,
      result.projectName ? `Project: ${result.projectName}` : null,
      result.importance ? `Importance: ${result.importance}` : null,
      result.createdAt ? `Created: ${result.createdAt}` : null,
      'Content:',
      result.content || result.title
    ].filter(Boolean);

    return lines.join('\n');
  });

  return `Search Query: ${query}\n\nRetrieved Context:\n\n${entries.join('\n\n')}`;
};
