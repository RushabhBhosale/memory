const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

type OpenRouterMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type RequestOptions = {
  messages: OpenRouterMessage[];
  model: string;
  temperature?: number;
};

export const getOpenRouterApiKey = () =>
  process.env.OPENROUTER_API_KEY || process.env.EXPO_PUBLIC_OPENROUTER_API_KEY || '';

export const requestOpenRouter = async ({ messages, model, temperature = 0.2 }: RequestOptions) => {
  const apiKey = getOpenRouterApiKey();

  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not set');
  }

  const response = await fetch(OPENROUTER_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages,
      temperature
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

export const extractJsonBlock = (value: string) => {
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
