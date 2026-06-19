import * as SecureStore from 'expo-secure-store';

const RECENT_SEARCHES_KEY = 'recent_searches';
const MAX_RECENT_SEARCHES = 8;

const normalizeQuery = (value: string) => value.trim().replace(/\s+/g, ' ');

export const getRecentSearches = async () => {
  const stored = await SecureStore.getItemAsync(RECENT_SEARCHES_KEY);

  if (!stored) {
    return [] as string[];
  }

  try {
    const parsed = JSON.parse(stored);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((item): item is string => typeof item === 'string')
      .map(normalizeQuery)
      .filter(Boolean)
      .slice(0, MAX_RECENT_SEARCHES);
  } catch {
    return [];
  }
};

export const saveRecentSearch = async (query: string) => {
  const normalized = normalizeQuery(query);

  if (!normalized) {
    return [];
  }

  const existing = await getRecentSearches();
  const next = [
    normalized,
    ...existing.filter((item) => item.toLowerCase() !== normalized.toLowerCase())
  ].slice(0, MAX_RECENT_SEARCHES);

  await SecureStore.setItemAsync(RECENT_SEARCHES_KEY, JSON.stringify(next));

  return next;
};

export const clearRecentSearches = async () => {
  await SecureStore.deleteItemAsync(RECENT_SEARCHES_KEY);
};
