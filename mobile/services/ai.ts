import { ALLOWED_CATEGORIES } from '../constants/memoryCategories';

const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const FALLBACK_METADATA = {
  title: 'Untitled Memory',
  category: 'general',
  tags: [] as string[],
  importance: 3
};

const MODELS = [
  'qwen/qwen3-next-80b-a3b-instruct:free',
  'openai/gpt-oss-120b:free',
  'google/gemma-4-26b-a4b-it:free'
] as const;

const ALLOWED_CATEGORY_SET = new Set(ALLOWED_CATEGORIES);
const isAllowedCategory = (value: string): value is (typeof ALLOWED_CATEGORIES)[number] =>
  ALLOWED_CATEGORY_SET.has(value as (typeof ALLOWED_CATEGORIES)[number]);

type MetadataResponse = {
  title: string;
  category: string;
  tags: string[];
  importance: number;
};

export type CaptureClassificationType =
  | 'Memory'
  | 'Task'
  | 'Reminder'
  | 'Expense'
  | 'Work Log';

export type CaptureClassification = {
  type: CaptureClassificationType;
  title: string;
  category: string;
  tags: string[];
  confidence: number;
};

export type ScreenshotAnalysis = {
  title: string;
  category: string;
  tags: string[];
};

const PROMPT = `You are a metadata generation engine.

Generate metadata for this content.

Return ONLY JSON.

Schema:

{
  "title": "",
  "category": "",
  "tags": [],
  "importance": 3
}

Rules:

- title must be a concise summary
- 3 to 8 words preferred
- never copy content
- never truncate content
- tags 2 to 6 lowercase keywords
- importance 1 to 5
- category must be one of:

${ALLOWED_CATEGORIES.join('\n')}

Return JSON only.`;

const extractJson = (value: string) => {
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i);

  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const start = value.indexOf('{');
  const end = value.lastIndexOf('}');

  if (start >= 0 && end > start) {
    return value.slice(start, end + 1);
  }

  return value.trim();
};

const normalizeTag = (tag: string) =>
  tag
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .trim();

const validateMetadata = (value: unknown): MetadataResponse | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const title = typeof record.title === 'string' ? record.title.trim() : '';
  const category = typeof record.category === 'string' ? record.category.trim().toLowerCase() : '';
  const rawTags = Array.isArray(record.tags) ? record.tags : [];
  const importance =
    typeof record.importance === 'number' ? Math.round(record.importance) : Number.NaN;

  if (!title || !isAllowedCategory(category) || !Number.isFinite(importance)) {
    return null;
  }

  const tags = rawTags
    .filter((tag): tag is string => typeof tag === 'string')
    .map(normalizeTag)
    .filter(Boolean)
    .slice(0, 6);

  return {
    title,
    category,
    tags,
    importance: Math.min(5, Math.max(1, importance))
  };
};

const captureTypes = new Set<CaptureClassificationType>([
  'Memory',
  'Task',
  'Reminder',
  'Expense',
  'Work Log'
]);

const validateCaptureClassification = (
  value: unknown,
  fallbackTitle: string
): CaptureClassification | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const type = typeof record.type === 'string' ? record.type.trim() : '';
  const title = typeof record.title === 'string' ? record.title.trim() : fallbackTitle;
  const category = typeof record.category === 'string' ? record.category.trim().toLowerCase() : 'general';
  const rawTags = Array.isArray(record.tags) ? record.tags : [];
  const confidence =
    typeof record.confidence === 'number' ? record.confidence : Number.NaN;

  if (!captureTypes.has(type as CaptureClassificationType)) {
    return null;
  }

  return {
    type: type as CaptureClassificationType,
    title: title || fallbackTitle,
    category: category || 'general',
    tags: rawTags
      .filter((tag): tag is string => typeof tag === 'string')
      .map(normalizeTag)
      .filter(Boolean)
      .slice(0, 6),
    confidence: Number.isFinite(confidence)
      ? Math.min(1, Math.max(0, confidence))
      : 0.7
  };
};

const requestModel = async (content: string, model: (typeof MODELS)[number]) => {
  const apiKey = process.env.EXPO_PUBLIC_OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error('EXPO_PUBLIC_OPENROUTER_API_KEY is not set');
  }

  const response = await fetch(OPENROUTER_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: PROMPT
        },
        {
          role: 'user',
          content: `Content:\n\n${content}`
        }
      ],
      temperature: 0.2
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `OpenRouter request failed with ${response.status}`);
  }

  const body = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
  };

  const rawContent = body.choices?.[0]?.message?.content;

  if (!rawContent) {
    throw new Error('OpenRouter returned an empty response');
  }

  return rawContent;
};

export const generateMetadata = async (content: string): Promise<MetadataResponse> => {
  const trimmedContent = content.trim();

  if (!trimmedContent) {
    return FALLBACK_METADATA;
  }

  for (const model of MODELS) {
    try {
      const raw = await requestModel(trimmedContent, model);
      const parsed = JSON.parse(extractJson(raw));
      const metadata = validateMetadata(parsed);

      if (metadata) {
        return metadata;
      }
    } catch {
      continue;
    }
  }

  return FALLBACK_METADATA;
};

export const getFallbackMetadata = () => FALLBACK_METADATA;

const getFallbackCaptureClassification = (content: string): CaptureClassification => {
  const normalized = content.toLowerCase();
  const title = content.trim().slice(0, 64) || 'Quick Capture';

  if (/(₹|rs\.?|inr)\s*\d+|\bspent\b|\bpaid\b/.test(normalized)) {
    return {
      type: 'Expense',
      title,
      category: normalized.includes('zomato') || normalized.includes('swiggy') ? 'food' : 'general',
      tags: ['expense'],
      confidence: 0.72
    };
  }

  if (/\b(need|remind|remember|when i|tomorrow|today|later)\b/.test(normalized)) {
    return {
      type: 'Reminder',
      title,
      category: 'reminder',
      tags: ['reminder'],
      confidence: 0.68
    };
  }

  if (/\b(todo|task|call|follow up|finish|fix)\b/.test(normalized)) {
    return {
      type: 'Task',
      title,
      category: 'task',
      tags: ['task'],
      confidence: 0.66
    };
  }

  if (/\b(finished|completed|shipped|implemented|built)\b/.test(normalized)) {
    return {
      type: 'Work Log',
      title,
      category: 'work',
      tags: ['work-log'],
      confidence: 0.66
    };
  }

  if (/\b(sdk|feature|api|bug|client)\b/.test(normalized)) {
    return {
      type: 'Work Log',
      title,
      category: 'work',
      tags: ['work-note'],
      confidence: 0.64
    };
  }

  return {
    type: 'Memory',
    title,
    category: 'personal',
    tags: ['memory'],
    confidence: 0.6
  };
};

export const classifyCapture = async (content: string): Promise<CaptureClassification> => {
  const trimmedContent = content.trim();
  const fallback = getFallbackCaptureClassification(trimmedContent);

  if (!trimmedContent) {
    return fallback;
  }

  const prompt = `You classify fast captures for a personal memory app.

Return ONLY JSON.

Schema:
{
  "type": "Memory | Task | Reminder | Expense | Work Log",
  "title": "",
  "category": "",
  "tags": [],
  "confidence": 0.0
}

Rules:
- Expense: money spent or received.
- Reminder: needs date, time, place, or future action reminder.
- Task: actionable work or todo.
- Work Log: completed work, status update, client/product context, or technical notes.
- Memory: general note or personal memory.
- title must be concise.
- tags must be lowercase.`;

  for (const model of MODELS) {
    try {
      const apiKey = process.env.EXPO_PUBLIC_OPENROUTER_API_KEY;

      if (!apiKey) {
        throw new Error('EXPO_PUBLIC_OPENROUTER_API_KEY is not set');
      }

      const response = await fetch(OPENROUTER_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: prompt },
            { role: 'user', content: `Capture:\n\n${trimmedContent}` }
          ],
          temperature: 0.1
        })
      });

      if (!response.ok) {
        continue;
      }

      const body = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const rawContent = body.choices?.[0]?.message?.content;

      if (!rawContent) {
        continue;
      }

      const parsed = JSON.parse(extractJson(rawContent));
      const classification = validateCaptureClassification(parsed, fallback.title);

      if (classification) {
        return classification;
      }
    } catch {
      continue;
    }
  }

  return fallback;
};

const screenshotCategories = new Set([
  'work',
  'expense',
  'travel',
  'reminder',
  'development',
  'meeting',
  'personal',
  'finance'
]);

const getFallbackScreenshotAnalysis = (text: string): ScreenshotAnalysis => {
  const normalized = text.toLowerCase();
  const title = text.trim().split(/\n+/)[0]?.slice(0, 72) || 'Screenshot Memory';

  if (/(₹|rs\.?|inr)\s*\d+|\breceipt\b|\bpaid\b|\btotal\b/.test(normalized)) {
    return { title, category: 'expense', tags: ['screenshot', 'expense'] };
  }

  if (/\bflight|ticket|boarding|hotel|reservation\b/.test(normalized)) {
    return { title, category: 'travel', tags: ['screenshot', 'travel'] };
  }

  if (/\berror|exception|stack|vscode|sdk|api|build failed\b/.test(normalized)) {
    return { title, category: 'development', tags: ['screenshot', 'development'] };
  }

  if (/\bmeet|calendar|invite|zoom|google meet\b/.test(normalized)) {
    return { title, category: 'meeting', tags: ['screenshot', 'meeting'] };
  }

  if (/\bremind|tomorrow|deadline|due\b/.test(normalized)) {
    return { title, category: 'reminder', tags: ['screenshot', 'reminder'] };
  }

  if (/\bbank|upi|account|statement|credit|debit\b/.test(normalized)) {
    return { title, category: 'finance', tags: ['screenshot', 'finance'] };
  }

  return { title, category: 'personal', tags: ['screenshot', 'personal'] };
};

export const analyzeScreenshot = async (text: string): Promise<ScreenshotAnalysis> => {
  const trimmedText = text.trim();
  const fallback = getFallbackScreenshotAnalysis(trimmedText);

  if (!trimmedText) {
    return fallback;
  }

  const apiKey = process.env.EXPO_PUBLIC_OPENROUTER_API_KEY;

  if (!apiKey) {
    return fallback;
  }

  const prompt = `You analyze OCR text from screenshots for a personal memory app.

Return ONLY JSON.

Schema:
{
  "title": "",
  "category": "Work | Expense | Travel | Reminder | Development | Meeting | Personal | Finance",
  "tags": []
}

Rules:
- title must be concise and useful for search.
- tags must be lowercase.
- choose the best category.`;

  for (const model of MODELS) {
    try {
      const response = await fetch(OPENROUTER_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: prompt },
            { role: 'user', content: `OCR text:\n\n${trimmedText}` }
          ],
          temperature: 0.1
        })
      });

      if (!response.ok) {
        continue;
      }

      const body = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const rawContent = body.choices?.[0]?.message?.content;

      if (!rawContent) {
        continue;
      }

      const parsed = JSON.parse(extractJson(rawContent)) as Record<string, unknown>;
      const category =
        typeof parsed.category === 'string' ? parsed.category.trim().toLowerCase() : fallback.category;
      const tags = Array.isArray(parsed.tags)
        ? parsed.tags
            .filter((tag): tag is string => typeof tag === 'string')
            .map(normalizeTag)
            .filter(Boolean)
            .slice(0, 6)
        : fallback.tags;
      const title = typeof parsed.title === 'string' ? parsed.title.trim() : fallback.title;

      if (title && screenshotCategories.has(category)) {
        return {
          title,
          category,
          tags: tags.length ? tags : fallback.tags
        };
      }
    } catch {
      continue;
    }
  }

  return fallback;
};
