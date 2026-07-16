export type SmartVoiceIntentType = "expense" | "reminder" | "task" | "log";

export type SmartVoiceExpenseIntent = {
  type: "expense";
  amount: number;
  amountText: string;
  category: string;
  merchant: string;
  note: string;
  originalText: string;
};

export type SmartVoiceReminderIntent = {
  type: "reminder";
  originalText: string;
  reminderAt: Date;
  title: string;
};

export type SmartVoiceTaskIntent = {
  type: "task";
  originalText: string;
  title: string;
};

export type SmartVoiceLogIntent = {
  type: "log";
  category: string;
  note: string;
  originalText: string;
};

export type SmartVoiceIntent =
  | SmartVoiceExpenseIntent
  | SmartVoiceReminderIntent
  | SmartVoiceTaskIntent
  | SmartVoiceLogIntent;

type NumberMatch = {
  amount: number;
  raw: string;
  index: number;
};

type ParserTestCase = {
  expectedAmount?: number;
  expectedType: SmartVoiceIntentType;
  input: string;
};

const expenseVerbs = [
  "paid",
  "bought",
  "purchased",
  "ordered",
  "spent",
  "cost",
  "charged",
  "debited",
  "transferred",
  "add expense",
];

const merchantCategoryMap: Record<string, string> = {
  amazon: "shopping",
  coffee: "food",
  dinner: "food",
  electricity: "bills",
  flipkart: "shopping",
  food: "food",
  fuel: "fuel",
  lunch: "food",
  ola: "travel",
  petrol: "fuel",
  recharge: "bills",
  rent: "bills",
  swiggy: "food",
  uber: "travel",
  zomato: "food",
};

const merchantWords = ["zomato", "swiggy", "uber", "ola", "amazon", "flipkart"];
const categoryWords = Object.keys(merchantCategoryMap).filter(
  (word) => !merchantWords.includes(word),
);

const weekdayIndexes: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

const normalizeWhitespace = (value: string) =>
  value.replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim();

const normalizeForRegex = (value: string) => normalizeWhitespace(value).toLowerCase();

const toTitleCase = (value: string) =>
  normalizeWhitespace(value)
    .replace(/[^a-z0-9&._ -]/gi, "")
    .replace(/\b\w/g, (char) => char.toUpperCase());

const getDefaultTitle = (value: string, fallback: string) => {
  const trimmed = normalizeWhitespace(value);

  if (!trimmed) {
    return fallback;
  }

  return trimmed.length > 64 ? `${trimmed.slice(0, 61)}...` : trimmed;
};

const hasReminderTrigger = (input: string) =>
  /\b(?:remind me|reminder|notify me|alert me|don't forget|dont forget|remember to)\b/i.test(
    input,
  );

const getStartOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

const getNextWeekday = (weekday: number, now: Date) => {
  const date = getStartOfDay(now);
  const dayOffset = (weekday - date.getDay() + 7) % 7 || 7;
  date.setDate(date.getDate() + dayOffset);

  return date;
};

const getDateHint = (input: string, now: Date) => {
  if (/\btomorrow\b/i.test(input)) {
    const date = getStartOfDay(now);
    date.setDate(date.getDate() + 1);
    return date;
  }

  if (/\btoday\b/i.test(input)) {
    return getStartOfDay(now);
  }

  const weekdayMatch = input.match(
    /\b(?:on\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i,
  );

  if (!weekdayMatch) {
    return null;
  }

  return getNextWeekday(weekdayIndexes[weekdayMatch[1].toLowerCase()], now);
};

const getTimeHint = (input: string) => {
  const meridiemMatch = input.match(
    /\b(?:at\s*)?(\d{1,2})(?::([0-5]\d))?\s*(am|pm)\b/i,
  );

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

const getReminderAt = (input: string, now: Date) => {
  const dateHint = getDateHint(input, now);
  const timeHint = getTimeHint(input);
  const reminderAt = getStartOfDay(dateHint || now);

  if (timeHint) {
    reminderAt.setHours(timeHint.hour, timeHint.minute, 0, 0);
  } else if (dateHint) {
    reminderAt.setHours(9, 0, 0, 0);
  } else {
    reminderAt.setTime(now.getTime() + 60 * 60 * 1000);
    reminderAt.setSeconds(0, 0);
  }

  if (!dateHint && reminderAt.getTime() <= now.getTime()) {
    reminderAt.setDate(reminderAt.getDate() + 1);
  }

  return reminderAt;
};

const cleanReminderTitle = (input: string) => {
  const title = normalizeWhitespace(input)
    .replace(
      /^(?:please\s*)?(?:remind me|set a reminder|reminder|notify me|alert me)\s*(?:to|that|of|about|for)?\s*/i,
      "",
    )
    .replace(/^(?:please\s*)?(?:don't forget|dont forget|remember to)\s*(?:to)?\s*/i, "")
    .replace(/\b(?:today|tomorrow)\b/gi, "")
    .replace(
      /\b(?:on\s+)?(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/gi,
      "",
    )
    .replace(/\b(?:at\s*)?\d{1,2}(?::[0-5]\d)?\s*(?:am|pm)\b/gi, "")
    .replace(/\bat\s+(?:[01]?\d|2[0-3]):[0-5]\d\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  return getDefaultTitle(title, "Reminder");
};

const isTimeSpentContext = (input: string) =>
  /\bspent\s+(?:time|morning|afternoon|evening|night|day|weekend)\b/i.test(input) ||
  /\bspent\s+[0-9][0-9,]*(?:\.\d+)?\s*(?:hours?|hrs?|hr|minutes?|mins?|min|seconds?|secs?|days?|weeks?|months?|years?)\b/i.test(
    input,
  );

const hasExpenseVerb = (input: string) => {
  const normalized = normalizeForRegex(input);
  return expenseVerbs.some((verb) => normalized.includes(verb));
};

const getContextWord = (input: string) => {
  const normalized = normalizeForRegex(input);

  return [...merchantWords, ...categoryWords].find((word) =>
    new RegExp(`\\b${word}\\b`, "i").test(normalized),
  );
};

const getPrepositionContext = (input: string) => {
  const match = input.match(/\b(?:on|at|from|to|for)\s+([a-z][a-z0-9&._ -]{1,32})(?=\s|$)/i);

  if (!match?.[1]) {
    return "";
  }

  return normalizeWhitespace(match[1]).replace(
    /\b(?:today|tomorrow|at|for|on|from|to)\b.*$/i,
    "",
  );
};

const getNumberMatches = (input: string): NumberMatch[] =>
  [...input.matchAll(/\b([0-9][0-9,]*(?:\.\d{1,2})?)\b/g)]
    .map((match) => {
      const amount = Number.parseFloat(match[1].replace(/,/g, ""));

      return {
        amount,
        raw: match[1],
        index: match.index ?? 0,
      };
    })
    .filter((match) => Number.isFinite(match.amount) && match.amount > 0);

const hasCurrencyMarkerNear = (input: string, match: NumberMatch) => {
  const before = input.slice(Math.max(0, match.index - 12), match.index);
  const after = input.slice(match.index + match.raw.length, match.index + match.raw.length + 12);

  return /(?:₹|rs\.?|rupees?|inr)\s*$/i.test(before) || /^\s*(?:rs\.?|rupees?|inr)\b/i.test(after);
};

const hasTimeUnitAfter = (input: string, match: NumberMatch) => {
  const after = input.slice(match.index + match.raw.length, match.index + match.raw.length + 16);

  return /^\s*(?:hours?|hrs?|hr|minutes?|mins?|min|seconds?|secs?|days?|weeks?|months?|years?)\b/i.test(
    after,
  );
};

const pickExpenseAmount = (input: string) => {
  const matches = getNumberMatches(input).filter((match) => !hasTimeUnitAfter(input, match));

  if (!matches.length) {
    return null;
  }

  return matches.find((match) => hasCurrencyMarkerNear(input, match)) || matches[0];
};

const buildExpenseIntent = (input: string): SmartVoiceExpenseIntent | null => {
  if (isTimeSpentContext(input)) {
    return null;
  }

  const contextWord = getContextWord(input);
  const amountMatch = pickExpenseAmount(input);
  const hasContext = hasExpenseVerb(input) || Boolean(contextWord);

  if (!amountMatch || !hasContext) {
    return null;
  }

  const prepositionContext = getPrepositionContext(input);
  const merchant = toTitleCase(contextWord || prepositionContext || "Unknown Merchant");
  const category = contextWord ? merchantCategoryMap[contextWord] : "general";

  return {
    type: "expense",
    amount: amountMatch.amount,
    amountText: amountMatch.raw,
    category,
    merchant,
    note: normalizeWhitespace(input),
    originalText: normalizeWhitespace(input),
  };
};

const hasTaskTrigger = (input: string) =>
  /\b(?:task|todo|add task|need to|have to|should|follow up)\b/i.test(input);

const cleanTaskTitle = (input: string) => {
  const title = normalizeWhitespace(input)
    .replace(/^(?:please\s*)?(?:add\s+task|task|todo)\s*(?:to|for)?\s*/i, "")
    .replace(/^(?:i\s+)?(?:need to|have to|should)\s*/i, "")
    .replace(/^(?:please\s*)?follow up\s*(?:on|with)?\s*/i, "Follow up ")
    .replace(/\s+/g, " ")
    .trim();

  return getDefaultTitle(title, "Task");
};

const getLogCategory = (input: string) =>
  /\b(?:api|apk|activex|debug|build|release|deep links?|production|sdk|google assistant)\b/i.test(
    input,
  )
    ? "work"
    : "general";

const cleanLogNote = (input: string) => {
  const note = normalizeWhitespace(input).replace(
    /^(?:please\s*)?(?:log|note|save|capture|journal|remember that)\s*/i,
    "",
  );

  return normalizeWhitespace(note || input);
};

export const parseSmartVoiceNote = (input: string, now = new Date()): SmartVoiceIntent => {
  const originalText = normalizeWhitespace(input);

  if (!originalText) {
    return {
      type: "log",
      category: "general",
      note: "",
      originalText: "",
    };
  }

  if (hasReminderTrigger(originalText)) {
    return {
      type: "reminder",
      originalText,
      reminderAt: getReminderAt(originalText, now),
      title: cleanReminderTitle(originalText),
    };
  }

  const expense = buildExpenseIntent(originalText);

  if (expense) {
    return expense;
  }

  if (hasTaskTrigger(originalText)) {
    return {
      type: "task",
      originalText,
      title: cleanTaskTitle(originalText),
    };
  }

  return {
    type: "log",
    category: getLogCategory(originalText),
    note: cleanLogNote(originalText),
    originalText,
  };
};

export const smartVoiceParserTestCases: ParserTestCase[] = [
  { input: "I spent 30 rupees on Zomato", expectedType: "expense", expectedAmount: 30 },
  { input: "Paid 250 for lunch", expectedType: "expense", expectedAmount: 250 },
  { input: "Bought coffee for 80", expectedType: "expense", expectedAmount: 80 },
  { input: "Ordered food from Swiggy for 300", expectedType: "expense", expectedAmount: 300 },
  { input: "Add expense 500 petrol", expectedType: "expense", expectedAmount: 500 },
  { input: "I spent 2 hours on ActiveX", expectedType: "log" },
  { input: "Spent time with Amit", expectedType: "log" },
  { input: "Spent evening fixing release build", expectedType: "log" },
  { input: "Remind me to call Amit tomorrow at 10 AM", expectedType: "reminder" },
  { input: "Notify me to pay rent on Monday", expectedType: "reminder" },
  { input: "Don't forget to submit the APK tomorrow", expectedType: "reminder" },
  { input: "Add task to test the release APK", expectedType: "task" },
  { input: "Need to check App Actions logs", expectedType: "task" },
  { input: "Log that Google Assistant deep links are working", expectedType: "log" },
  { input: "Remember that the production API issue was fixed", expectedType: "log" },
];

export const runSmartVoiceParserLocalTests = () => {
  const results = smartVoiceParserTestCases.map((testCase) => {
    const parsed = parseSmartVoiceNote(testCase.input);
    const amountMatches =
      testCase.expectedAmount === undefined ||
      (parsed.type === "expense" && parsed.amount === testCase.expectedAmount);
    const passed = parsed.type === testCase.expectedType && amountMatches;

    return {
      ...testCase,
      actualAmount: parsed.type === "expense" ? parsed.amount : undefined,
      actualType: parsed.type,
      passed,
    };
  });

  return {
    failed: results.filter((result) => !result.passed),
    passed: results.every((result) => result.passed),
    results,
  };
};
