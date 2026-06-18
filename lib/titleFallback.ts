type FallbackTitleType = 'memory' | 'log' | 'task' | 'note' | 'meeting' | 'reminder';

const MAX_FALLBACK_WORDS = 8;

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'been',
  'but',
  'by',
  'can',
  'could',
  'did',
  'do',
  'does',
  'for',
  'from',
  'had',
  'has',
  'have',
  'i',
  'if',
  'in',
  'is',
  'it',
  'its',
  'me',
  'my',
  'of',
  'on',
  'or',
  'our',
  'so',
  'that',
  'the',
  'their',
  'this',
  'to',
  'was',
  'we',
  'were',
  'with',
  'you',
  'your'
]);

const TYPE_LABELS: Record<FallbackTitleType, string> = {
  memory: 'Memory',
  log: 'Log',
  task: 'Task',
  note: 'Note',
  meeting: 'Meeting',
  reminder: 'Reminder'
};

const normalizeWhitespace = (value: string) => value.replace(/\s+/g, ' ').trim();

const normalizeKey = (value: string) =>
  normalizeWhitespace(value.toLowerCase().replace(/[^a-z0-9]+/g, ' '));

const toTitleWord = (value: string) => {
  const cleaned = value.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '');

  if (!cleaned) {
    return '';
  }

  if (/^[A-Z0-9]{2,}$/.test(cleaned)) {
    return cleaned;
  }

  const lower = cleaned.toLowerCase();

  return `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`;
};

export const getFallbackTitle = (
  content: string,
  type: FallbackTitleType = 'memory'
) => {
  const normalizedContent = normalizeWhitespace(content);
  const typeLabel = TYPE_LABELS[type];

  if (!normalizedContent) {
    return `Saved ${typeLabel}`;
  }

  const scores = new Map<
    string,
    {
      firstIndex: number;
      score: number;
      word: string;
    }
  >();

  normalizeWhitespace(normalizedContent)
    .split(/[^A-Za-z0-9]+/)
    .map(toTitleWord)
    .filter(Boolean)
    .forEach((word, index) => {
      const key = word.toLowerCase();

      if (STOP_WORDS.has(key) || /^\d+$/.test(key)) {
        return;
      }

      const current = scores.get(key);
      const score = 1 + (word.length > 5 ? 1 : 0) + (/^[A-Z0-9]{2,}$/.test(word) ? 1 : 0);

      if (current) {
        current.score += score;
        return;
      }

      scores.set(key, { firstIndex: index, score, word });
    });

  const titleWords = [...scores.values()]
    .sort((a, b) => b.score - a.score || a.firstIndex - b.firstIndex)
    .slice(0, MAX_FALLBACK_WORDS)
    .sort((a, b) => a.firstIndex - b.firstIndex)
    .map(({ word }) => word);

  if (!titleWords.length) {
    return `Saved ${typeLabel}`;
  }

  if (normalizeKey(titleWords.join(' ')) === normalizeKey(normalizedContent)) {
    titleWords.splice(MAX_FALLBACK_WORDS - 1, 1, typeLabel);
  }

  return titleWords.join(' ');
};
