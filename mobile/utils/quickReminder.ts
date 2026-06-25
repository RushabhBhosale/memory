type ReminderTime = {
  hour: number;
  minute: number;
};

export type QuickReminder = {
  content: string;
  reminderAt: Date;
};

const getStartOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

const getTomorrow = () => {
  const tomorrow = getStartOfDay(new Date());
  tomorrow.setDate(tomorrow.getDate() + 1);

  return tomorrow;
};

const getReminderDateHint = (input: string) => {
  if (/\btomorrow\b/i.test(input)) {
    return getTomorrow();
  }

  if (/\btoday\b/i.test(input)) {
    return getStartOfDay(new Date());
  }

  return null;
};

const parseReminderTime = (input: string): ReminderTime | null => {
  const meridiemMatch = input.match(/\b(?:at\s*)?(\d{1,2})(?::([0-5]\d))?\s*(am|pm)\b/i);

  if (meridiemMatch) {
    const meridiem = meridiemMatch[3].toLowerCase();
    let hour = Number.parseInt(meridiemMatch[1], 10);
    const minute = meridiemMatch[2] ? Number.parseInt(meridiemMatch[2], 10) : 0;

    if (hour < 1 || hour > 12) {
      return null;
    }

    if (meridiem === "pm" && hour !== 12) {
      hour += 12;
    }

    if (meridiem === "am" && hour === 12) {
      hour = 0;
    }

    return { hour, minute };
  }

  const twentyFourHourMatch = input.match(/\bat\s+([01]?\d|2[0-3]):([0-5]\d)\b/i);

  if (!twentyFourHourMatch) {
    return null;
  }

  return {
    hour: Number.parseInt(twentyFourHourMatch[1], 10),
    minute: Number.parseInt(twentyFourHourMatch[2], 10),
  };
};

const buildReminderDate = (input: string) => {
  const time = parseReminderTime(input);

  if (!time) {
    return null;
  }

  const explicitDate = getReminderDateHint(input);
  const reminderAt = getStartOfDay(explicitDate || new Date());

  reminderAt.setHours(time.hour, time.minute, 0, 0);

  if (!explicitDate && reminderAt.getTime() <= Date.now()) {
    reminderAt.setDate(reminderAt.getDate() + 1);
  }

  return reminderAt;
};

const cleanReminderContent = (input: string) => {
  const content = input
    .replace(/^remind\s+me\s*(?:to|that|of|about)?\s*/i, "")
    .replace(/\b(?:today|tomorrow)\b/gi, "")
    .replace(/\b(?:at\s*)?\d{1,2}(?::[0-5]\d)?\s*(?:am|pm)\b/gi, "")
    .replace(/\bat\s+(?:[01]?\d|2[0-3]):[0-5]\d\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  return content || input.trim();
};

export const parseQuickReminder = (input: string): QuickReminder | null => {
  if (!/\bremind\s+me\b/i.test(input)) {
    return null;
  }

  const reminderAt = buildReminderDate(input);

  if (!reminderAt) {
    return null;
  }

  return {
    content: cleanReminderContent(input),
    reminderAt,
  };
};
