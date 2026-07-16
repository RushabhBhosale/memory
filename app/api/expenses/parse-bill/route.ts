import { NextResponse } from 'next/server';

import { getExpenseUser } from '@/lib/expenseAuth';
import { extractJsonBlock, requestOpenRouter } from '@/lib/openRouter';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BILL_MODELS = [
  'qwen/qwen2.5-vl-72b-instruct:free',
  'qwen/qwen2.5-vl-32b-instruct:free'
] as const;

const categories = new Set(['food', 'shopping', 'travel', 'bills', 'salary', 'general']);

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Unable to analyze bill image';

const toAmount = (value: unknown) => {
  const amount = typeof value === 'number' ? value : Number(String(value || '').replace(/,/g, ''));
  return Number.isFinite(amount) && amount > 0 && amount < 1_000_000 ? amount : null;
};

const toConfidence = (value: unknown) => {
  const confidence = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0;
};

const parseResponse = (raw: string) => {
  const parsed = JSON.parse(extractJsonBlock(raw)) as Record<string, unknown>;
  const category = typeof parsed.category === 'string' ? parsed.category.toLowerCase() : 'general';

  return {
    amount: toAmount(parsed.amount),
    category: categories.has(category) ? category : 'general',
    confidence: toConfidence(parsed.confidence),
    evidence: typeof parsed.evidence === 'string' ? parsed.evidence.slice(0, 240) : '',
    merchant: typeof parsed.merchant === 'string' ? parsed.merchant.trim().slice(0, 120) : '',
  };
};

const buildPrompt = () => `
You extract one purchase amount directly from the attached bill, receipt, or product-package image.

Return JSON only:
{
  "amount": 140.00,
  "merchant": "Navneet",
  "category": "shopping",
  "confidence": 0.96,
  "evidence": "MRP: 140.00"
}

Rules:
- Choose the actual amount paid or the clear total/payable amount first.
- If this is a packaged product with no receipt total, use the clearly labeled MRP/price.
- Never choose a barcode, ISBN, SKU/product code, phone number, postal code, date, page count, quantity, or any bare integer just because it is large.
- Read the digits from the image carefully, including decimal points. Do not infer an amount from a product code or barcode.
- A number is valid only when it is next to a financial label such as total, payable, amount, paid, due, MRP, price, rate, cost, ₹, Rs, or INR.
- If no amount has clear financial evidence, return amount as null and confidence 0.
- category must be one of: food, shopping, travel, bills, salary, general.
`.trim();

export async function POST(request: Request) {
  const user = getExpenseUser(request);

  if (!user) {
    return NextResponse.json({ error: 'Login required' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => null);
    const imageDataUri =
      body && typeof body === 'object' && typeof body.imageDataUri === 'string'
        ? body.imageDataUri.trim()
        : '';

    if (!imageDataUri || !/^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(imageDataUri)) {
      return NextResponse.json({ error: 'A base64 bill image is required' }, { status: 400 });
    }

    let lastError: unknown = null;

    for (const model of BILL_MODELS) {
      try {
        const raw = await requestOpenRouter({
          messages: [
            {
              role: 'system',
              content: 'You are a careful financial bill-image parser. Follow the JSON schema and evidence rules exactly.'
            },
            {
              role: 'user',
              content: [
                { type: 'text', text: buildPrompt() },
                { type: 'image_url', image_url: { url: imageDataUri } }
              ]
            }
          ],
          model,
          temperature: 0
        });

        return NextResponse.json({ data: parseResponse(raw), model });
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError || new Error('All bill parsing models failed');
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 502 });
  }
}
