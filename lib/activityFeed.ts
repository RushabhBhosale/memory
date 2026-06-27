export type ActivityType = 'memory' | 'task' | 'note' | 'meeting' | 'expense';

type RawRecord = Record<string, unknown>;

const toStringValue = (value: unknown, fallback = '') =>
  typeof value === 'string' ? value : fallback;

const toNumberValue = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const toStringArray = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];

const toIsoString = (value: unknown) => {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'string') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toISOString();
  }

  return undefined;
};

const toIdString = (value: unknown) => {
  if (!value) {
    return undefined;
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'object' && '_id' in value) {
    const nestedId = (value as { _id?: unknown })._id;
    return nestedId ? String(nestedId) : undefined;
  }

  return String(value);
};

const toProjectRef = (value: unknown) => {
  if (!value) {
    return undefined;
  }

  if (
    typeof value === 'object' &&
    '_id' in value &&
    'name' in value &&
    typeof (value as { name?: unknown }).name === 'string'
  ) {
    const project = value as {
      _id?: unknown;
      description?: unknown;
      name: string;
      status?: unknown;
    };

    return {
      _id: String(project._id),
      description: toStringValue(project.description),
      name: project.name,
      status: toStringValue(project.status, 'active')
    };
  }

  return toIdString(value);
};

const getProjectName = (value: unknown) => {
  if (
    value &&
    typeof value === 'object' &&
    'name' in value &&
    typeof (value as { name?: unknown }).name === 'string'
  ) {
    return (value as { name: string }).name;
  }

  return '';
};

const getCommonActivityFields = (record: RawRecord) => ({
  _id: String(record._id),
  createdAt: toIsoString(record.createdAt) || new Date().toISOString(),
  importance: toNumberValue(record.importance, 3),
  projectId: toProjectRef(record.projectId),
  projectName: getProjectName(record.projectId),
  source: toStringValue(record.source, 'manual'),
  tags: toStringArray(record.tags),
  updatedAt: toIsoString(record.updatedAt) || toIsoString(record.createdAt) || new Date().toISOString()
});

export const toMemoryActivity = (memory: RawRecord) => ({
  ...getCommonActivityFields(memory),
  category: toStringValue(memory.category, 'general'),
  content: toStringValue(memory.content),
  kind: toStringValue(memory.kind, 'note'),
  notificationEnabled: Boolean(memory.notificationEnabled),
  reminderAt: toIsoString(memory.reminderAt),
  screenshotUri: toStringValue(memory.screenshotUri),
  title: toStringValue(memory.title, 'Untitled memory'),
  type: 'memory' as const
});

export const toTaskActivity = (task: RawRecord) => ({
  ...getCommonActivityFields(task),
  category: toStringValue(task.category, 'project'),
  content: toStringValue(task.description),
  kind: 'task',
  status: toStringValue(task.status, 'pending'),
  title: toStringValue(task.title, 'Untitled task'),
  type: 'task' as const
});

export const toNoteActivity = (note: RawRecord) => ({
  ...getCommonActivityFields(note),
  category: toStringValue(note.category, toStringValue(note.kind, 'project')),
  content: toStringValue(note.content),
  kind: toStringValue(note.kind, 'note'),
  title: toStringValue(note.title, 'Untitled note'),
  type: 'note' as const
});

export const toMeetingActivity = (meeting: RawRecord) => ({
  ...getCommonActivityFields(meeting),
  category: toStringValue(meeting.category, 'meeting'),
  content: toStringValue(meeting.details),
  kind: 'note',
  title: toStringValue(meeting.title, 'Untitled meeting'),
  type: 'meeting' as const
});

export const toExpenseActivity = (expense: RawRecord) => {
  const transactionType = toStringValue(expense.type, 'expense') === 'income' ? 'income' : 'expense';
  const amount = toNumberValue(expense.amount, 0);
  const currency = toStringValue(expense.currency, 'INR');
  const merchant = toStringValue(expense.merchant, 'Unknown Merchant');
  const timestamp = toIsoString(expense.timestamp) || toIsoString(expense.createdAt) || new Date().toISOString();
  const category = toStringValue(expense.category, 'general');

  return {
    ...getCommonActivityFields({
      ...expense,
      createdAt: timestamp,
      tags: ['expense', transactionType, category]
    }),
    amount,
    category,
    content: `${transactionType === 'income' ? 'Received' : 'Spent'} ${currency} ${amount} ${
      transactionType === 'income' ? 'from' : 'at'
    } ${merchant}`,
    currency,
    deviceExpenseId: toStringValue(expense.deviceExpenseId),
    kind: 'note',
    merchant,
    originalSmsPreview: toStringValue(expense.originalSmsPreview),
    timestamp,
    title: `${transactionType === 'income' ? 'Income' : 'Expense'}: ${merchant}`,
    transactionType,
    type: 'expense' as const
  };
};

export type ActivityItem =
  | ReturnType<typeof toMemoryActivity>
  | ReturnType<typeof toTaskActivity>
  | ReturnType<typeof toNoteActivity>
  | ReturnType<typeof toMeetingActivity>
  | ReturnType<typeof toExpenseActivity>;

export const sortActivityItems = (items: ActivityItem[]) =>
  [...items].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
