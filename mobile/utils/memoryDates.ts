import type { Memory } from '../services/api';

export const formatDate = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(new Date(value));

export const formatDayLabel = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  }).format(new Date(value));

export const formatDayHeading = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  }).format(new Date(value));

export const getDayKey = (value: string) => new Date(value).toISOString().slice(0, 10);

export const groupMemoriesByDay = (memories: Memory[]) =>
  memories.reduce<Record<string, Memory[]>>((groups, memory) => {
    const dayKey = getDayKey(memory.createdAt);

    if (!groups[dayKey]) {
      groups[dayKey] = [];
    }

    groups[dayKey].push(memory);
    return groups;
  }, {});
