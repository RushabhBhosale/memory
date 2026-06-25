export const ALLOWED_CATEGORIES = [
  'personal',
  'coding',
  'development',
  'errors',
  'commands',
  'expense',
  'finance',
  'travel',
  'jobs',
  'learning',
  'anime',
  'meeting',
  'interview',
  'reminder',
  'task',
  'work',
  'general'
] as const;

export type AllowedCategory = (typeof ALLOWED_CATEGORIES)[number];
