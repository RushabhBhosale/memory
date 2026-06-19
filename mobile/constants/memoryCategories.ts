export const ALLOWED_CATEGORIES = [
  'personal',
  'projects',
  'coding',
  'errors',
  'commands',
  'finance',
  'travel',
  'jobs',
  'learning',
  'anime',
  'meeting',
  'interview',
  'reminder',
  'task',
  'general'
] as const;

export type AllowedCategory = (typeof ALLOWED_CATEGORIES)[number];
