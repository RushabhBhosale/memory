import { NextResponse } from 'next/server';

import { validateApiKey } from '@/lib/apiKey';
import { connectDB } from '@/lib/mongodb';
import ScreenshotInbox from '@/models/ScreenshotInbox';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const getString = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const getBoolean = (value: unknown, fallback = false) =>
  typeof value === 'boolean' ? value : fallback;

const getDate = (value: unknown) => {
  const date = new Date(typeof value === 'string' || typeof value === 'number' ? value : Date.now());
  return Number.isNaN(date.getTime()) ? new Date() : date;
};

const getStringArray = (value: unknown) =>
  Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Internal server error';

const parseJsonBody = async (request: Request) => {
  try {
    return await request.json();
  } catch {
    return null;
  }
};

export async function GET(request: Request) {
  const authError = validateApiKey(request);

  if (authError) {
    return authError;
  }

  try {
    const { searchParams } = new URL(request.url);
    const includeDismissed = searchParams.get('includeDismissed') === 'true';
    const query = includeDismissed ? {} : { dismissed: false };

    await connectDB();

    const screenshots = await ScreenshotInbox.find(query).sort({ capturedAt: -1 }).lean();

    return NextResponse.json({
      count: screenshots.length,
      data: screenshots
    });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const authError = validateApiKey(request);

  if (authError) {
    return authError;
  }

  try {
    const body = await parseJsonBody(request);

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const record = body as Record<string, unknown>;
    const imageUri = getString(record.imageUri);

    if (!imageUri) {
      return NextResponse.json({ error: 'imageUri is required' }, { status: 400 });
    }

    await connectDB();

    const screenshot = await ScreenshotInbox.findOneAndUpdate(
      { imageUri },
      {
        $setOnInsert: {
          capturedAt: getDate(record.capturedAt),
          dismissed: getBoolean(record.dismissed),
          extractedText: getString(record.extractedText),
          generatedCategory: getString(record.generatedCategory) || 'general',
          generatedTags: getStringArray(record.generatedTags),
          generatedTitle: getString(record.generatedTitle),
          imageUri,
          processed: getBoolean(record.processed),
          source: getString(record.source) || 'android'
        }
      },
      { new: true, setDefaultsOnInsert: true, upsert: true }
    ).lean();

    return NextResponse.json({ data: screenshot }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
