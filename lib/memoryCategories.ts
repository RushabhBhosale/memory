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

const ALLOWED_CATEGORY_SET = new Set<string>(ALLOWED_CATEGORIES);

const LEGACY_CATEGORY_MAP: Record<string, AllowedCategory> = {
  command: 'commands',
  error: 'errors',
  job: 'jobs',
  log: 'general',
  note: 'general',
  project: 'projects',
  work: 'task',
  web: 'general'
};

type NormalizeCategoryOptions = {
  allowVault?: boolean;
  fallback?: AllowedCategory;
};

export const normalizeMemoryCategory = (
  value: unknown,
  options: NormalizeCategoryOptions = {}
) => {
  const fallback = options.fallback ?? 'general';
  const normalized =
    typeof value === 'string' ? value.trim().toLowerCase().replace(/\s+/g, '-') : '';

  if (options.allowVault && normalized === 'vault') {
    return 'vault';
  }

  if (ALLOWED_CATEGORY_SET.has(normalized)) {
    return normalized as AllowedCategory;
  }

  if (normalized in LEGACY_CATEGORY_MAP) {
    return LEGACY_CATEGORY_MAP[normalized];
  }

  return fallback;
};
