const pad = (value: number) => String(value).padStart(2, "0");

export const formatLocalDateKey = (date = new Date()) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export const startOfLocalDay = (date = new Date()) => {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
};

export const addLocalDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

export const getLocalDayRange = (dateKey: string) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  const start = new Date(year, month - 1, day, 0, 0, 0, 0);
  const end = new Date(year, month - 1, day, 23, 59, 59, 999);
  return { start, end };
};

export const getNextLocalDayStart = (date: Date) => startOfLocalDay(addLocalDays(date, 1));

export const splitRangeByLocalDay = (startedAt: Date, endedAt: Date) => {
  const segments: Array<{ startedAt: Date; endedAt: Date; dateKey: string }> = [];
  let cursor = new Date(startedAt);

  while (cursor < endedAt) {
    const nextBoundary = getNextLocalDayStart(cursor);
    const segmentEnd = nextBoundary < endedAt ? nextBoundary : endedAt;

    segments.push({
      startedAt: new Date(cursor),
      endedAt: new Date(segmentEnd),
      dateKey: formatLocalDateKey(cursor)
    });

    cursor = new Date(segmentEnd);
  }

  return segments;
};
