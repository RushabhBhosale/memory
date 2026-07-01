import type { FilterQuery, UpdateQuery } from 'mongoose';

import type { DailySummaryDocument, DailySummaryTask, DailySummaryTopic } from '@/models/DailySummary';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type DailySummaryInput = Record<string, unknown>;

type BuildOptions = {
  partial?: boolean;
};

export type DailySummaryPayload = {
  type?: 'daily_summary';
  date?: string;
  title?: string;
  summary?: string;
  bodyMarkdown?: string;
  topics?: DailySummaryTopic[];
  keyQuestions?: string[];
  tasks?: DailySummaryTask[];
  decisions?: string[];
  projects?: string[];
  tags?: string[];
  source?: string;
};

const getString = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const cleanStringArray = (value: unknown) =>
  Array.isArray(value)
    ? Array.from(
        new Set(
          value
            .filter((item): item is string => typeof item === 'string')
            .map((item) => item.trim())
            .filter(Boolean)
        )
      )
    : [];

const cleanTopics = (value: unknown): DailySummaryTopic[] =>
  Array.isArray(value)
    ? value
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
        .map((item) => ({
          project: getString(item.project),
          status: getString(item.status),
          summary: getString(item.summary),
          tags: cleanStringArray(item.tags),
          title: getString(item.title)
        }))
        .filter((item) => item.title || item.summary)
    : [];

const cleanTasks = (value: unknown): DailySummaryTask[] =>
  Array.isArray(value)
    ? value
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
        .map((item) => ({
          project: getString(item.project),
          status: getString(item.status),
          task: getString(item.task)
        }))
        .filter((item) => item.task)
    : [];

const hasOwn = (body: DailySummaryInput, key: string) =>
  Object.prototype.hasOwnProperty.call(body, key);

export const getDailySummaryDateError = (date: string) => {
  if (!date) {
    return 'Date is required';
  }

  if (!DATE_PATTERN.test(date)) {
    return 'Date must use YYYY-MM-DD';
  }

  const parsed = new Date(`${date}T00:00:00.000Z`);

  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    return 'Date must be a valid calendar date';
  }

  return '';
};

export const buildDailySummaryPayload = (
  body: DailySummaryInput,
  options: BuildOptions = {}
): { error?: string; payload?: DailySummaryPayload } => {
  const partial = options.partial === true;
  const date = getString(body.date);
  const title = getString(body.title);
  const summary = getString(body.summary);
  const bodyMarkdown = getString(body.bodyMarkdown);
  const payload: DailySummaryPayload = {};

  if (!partial || hasOwn(body, 'date')) {
    const dateError = getDailySummaryDateError(date);

    if (dateError) {
      return { error: dateError };
    }

    payload.date = date;
  }

  if (!partial || hasOwn(body, 'title')) {
    if (!title) {
      return { error: 'Title is required' };
    }

    payload.title = title;
  }

  if (!partial || hasOwn(body, 'summary')) {
    payload.summary = summary;
  }

  if (!partial || hasOwn(body, 'bodyMarkdown')) {
    payload.bodyMarkdown = bodyMarkdown;
  }

  if (!partial && !summary && !bodyMarkdown) {
    return { error: 'Summary or bodyMarkdown is required' };
  }

  if (partial && hasOwn(body, 'summary') && hasOwn(body, 'bodyMarkdown') && !summary && !bodyMarkdown) {
    return { error: 'Summary or bodyMarkdown is required' };
  }

  if (!partial || hasOwn(body, 'topics')) {
    payload.topics = cleanTopics(body.topics);
  }

  if (!partial || hasOwn(body, 'keyQuestions')) {
    payload.keyQuestions = cleanStringArray(body.keyQuestions);
  }

  if (!partial || hasOwn(body, 'tasks')) {
    payload.tasks = cleanTasks(body.tasks);
  }

  if (!partial || hasOwn(body, 'decisions')) {
    payload.decisions = cleanStringArray(body.decisions);
  }

  if (!partial || hasOwn(body, 'projects')) {
    payload.projects = cleanStringArray(body.projects);
  }

  if (!partial || hasOwn(body, 'tags')) {
    payload.tags = cleanStringArray(body.tags);
  }

  if (!partial || hasOwn(body, 'source')) {
    payload.source = getString(body.source) || 'chatgpt_scheduled_task';
  }

  payload.type = 'daily_summary';

  return { payload };
};

export const buildDailySummarySearchQuery = (searchParams: URLSearchParams) => {
  const query: FilterQuery<DailySummaryDocument> = {};
  const q = getString(searchParams.get('q'));
  const project = getString(searchParams.get('project'));
  const tag = getString(searchParams.get('tag'));
  const source = getString(searchParams.get('source'));
  const from = getString(searchParams.get('from'));
  const to = getString(searchParams.get('to'));

  if (project) {
    query.projects = project;
  }

  if (tag) {
    query.tags = tag;
  }

  if (source) {
    query.source = source;
  }

  if (from || to) {
    query.date = {
      ...(from ? { $gte: from } : {}),
      ...(to ? { $lte: to } : {})
    };
  }

  if (q) {
    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    query.$or = [
      { title: regex },
      { summary: regex },
      { bodyMarkdown: regex },
      { 'topics.title': regex },
      { 'topics.summary': regex },
      { projects: regex },
      { tags: regex },
      { keyQuestions: regex },
      { 'tasks.task': regex },
      { decisions: regex }
    ];
  }

  return query;
};

export const toDailySummaryUpdate = (
  payload: DailySummaryPayload
): UpdateQuery<DailySummaryDocument> => ({
  $set: {
    ...payload,
    type: 'daily_summary'
  }
});
