import type { UpdateQuery } from 'mongoose';

import { getDailySummaryDateError } from '@/lib/dailySummary';
import { readGoogleSheetValues } from '@/lib/googleSheets';
import type { DailySummaryDocument } from '@/models/DailySummary';

export const CHATGPT_DAILY_BRIEF_SOURCE = 'chatgpt_daily_brief';
export const DEFAULT_CHATGPT_DAILY_BRIEF_SHEET_ID = '1SpL_6RKA5F_fDjwvspsxD0VSHWSW4dQYhGvDg4LtcUw';

export type ChatGptDailyBriefRow = {
  date: string;
  mainTopics: string;
  keyQuestions: string;
  answersDecisions: string;
  projectContext: string;
  tasksFollowups: string;
  importantNotes: string;
};

const REQUIRED_HEADERS = {
  answersDecisions: 'Answers Decisions',
  date: 'Date',
  importantNotes: 'Important Notes',
  keyQuestions: 'Key Questions',
  mainTopics: 'Main Topics',
  projectContext: 'Project Context',
  tasksFollowups: 'Tasks Follow-ups'
} as const;

const normalizeHeader = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

const getString = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const normalizeSheetDate = (value: string) => {
  const trimmed = value.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const slashDate = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

  if (slashDate) {
    const [, day, month, year] = slashDate;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  const parsed = new Date(trimmed);

  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return trimmed;
};

const toDateKeyInKolkata = (date: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Kolkata',
    year: 'numeric'
  }).format(date);

const getKolkataHour = (date: Date) =>
  Number(
    new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      hour12: false,
      timeZone: 'Asia/Kolkata'
    }).format(date)
  );

export const getDefaultDailyBriefSyncDate = (now = new Date()) => {
  const localHour = getKolkataHour(now);
  const target = new Date(now);

  if (localHour < 6) {
    target.setUTCDate(target.getUTCDate() - 1);
  }

  return toDateKeyInKolkata(target);
};

export const getDailyBriefSheetId = () =>
  process.env.CHATGPT_DAILY_BRIEF_SHEET_ID || DEFAULT_CHATGPT_DAILY_BRIEF_SHEET_ID;

const buildHeaderIndex = (headers: string[]) => {
  const normalizedHeaders = headers.map(normalizeHeader);
  const entries = Object.entries(REQUIRED_HEADERS).map(([key, label]) => {
    const index = normalizedHeaders.indexOf(normalizeHeader(label));
    return [key, index] as const;
  });

  return Object.fromEntries(entries) as Record<keyof typeof REQUIRED_HEADERS, number>;
};

const getCell = (row: string[], index: number) => (index >= 0 ? getString(row[index]) : '');

export const findDailyBriefRow = (rows: string[][], date: string): ChatGptDailyBriefRow | null => {
  const [headers, ...dataRows] = rows;

  if (!headers?.length) {
    throw new Error('Daily brief sheet is missing a header row');
  }

  const index = buildHeaderIndex(headers);

  if (index.date < 0) {
    throw new Error('Daily brief sheet is missing the Date column');
  }

  const matchingRow = dataRows.find((row) => normalizeSheetDate(getCell(row, index.date)) === date);

  if (!matchingRow) {
    return null;
  }

  return {
    answersDecisions: getCell(matchingRow, index.answersDecisions),
    date,
    importantNotes: getCell(matchingRow, index.importantNotes),
    keyQuestions: getCell(matchingRow, index.keyQuestions),
    mainTopics: getCell(matchingRow, index.mainTopics),
    projectContext: getCell(matchingRow, index.projectContext),
    tasksFollowups: getCell(matchingRow, index.tasksFollowups)
  };
};

const section = (title: string, value: string) => (value ? `## ${title}\n${value}` : '');

export const dailyBriefRowToSummaryUpdate = (
  row: ChatGptDailyBriefRow
): UpdateQuery<DailySummaryDocument> => {
  const bodyMarkdown = [
    section('Main Topics', row.mainTopics),
    section('Key Questions', row.keyQuestions),
    section('Answers Decisions', row.answersDecisions),
    section('Project Context', row.projectContext),
    section('Tasks Follow-ups', row.tasksFollowups),
    section('Important Notes', row.importantNotes)
  ]
    .filter(Boolean)
    .join('\n\n');

  return {
    $set: {
      answersDecisions: row.answersDecisions,
      bodyMarkdown,
      date: row.date,
      importantNotes: row.importantNotes,
      keyQuestions: row.keyQuestions ? [row.keyQuestions] : [],
      mainTopics: row.mainTopics,
      projectContext: row.projectContext,
      source: CHATGPT_DAILY_BRIEF_SOURCE,
      summary: row.mainTopics || row.importantNotes || bodyMarkdown,
      tasks: row.tasksFollowups
        ? [
            {
              project: row.projectContext,
              status: '',
              task: row.tasksFollowups
            }
          ]
        : [],
      tasksFollowups: row.tasksFollowups,
      title: `ChatGPT Daily Brief - ${row.date}`,
      type: 'daily_summary'
    }
  };
};

export const readDailyBriefRowFromSheet = async (date: string) => {
  const dateError = getDailySummaryDateError(date);

  if (dateError) {
    return { error: dateError };
  }

  const sheetId = getDailyBriefSheetId();
  const rows = await readGoogleSheetValues(sheetId);
  const row = findDailyBriefRow(rows, date);

  return { row, sheetId };
};
