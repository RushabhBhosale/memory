import { ALLOWED_CATEGORIES } from '../../lib/memoryCategories';

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
