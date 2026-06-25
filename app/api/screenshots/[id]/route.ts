import mongoose from 'mongoose';
import { NextResponse } from 'next/server';

import { validateApiKey } from '@/lib/apiKey';
import { connectDB } from '@/lib/mongodb';
import ScreenshotInbox from '@/models/ScreenshotInbox';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

const getString = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const getBoolean = (value: unknown) => (typeof value === 'boolean' ? value : undefined);

const getStringArray = (value: unknown) =>
  Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
    : undefined;

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Internal server error';

const getId = async (context: RouteContext) => (await context.params).id;

const validateId = (id: string) =>
  mongoose.Types.ObjectId.isValid(id)
    ? null
    : NextResponse.json({ error: 'Invalid screenshot id' }, { status: 400 });

const parseJsonBody = async (request: Request) => {
  try {
    return await request.json();
  } catch {
    return null;
  }
};

export async function PATCH(request: Request, context: RouteContext) {
  const authError = validateApiKey(request);

  if (authError) {
    return authError;
  }

  try {
    const id = await getId(context);
    const idError = validateId(id);

    if (idError) {
      return idError;
    }

    const body = await parseJsonBody(request);

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const record = body as Record<string, unknown>;
    const updates: Record<string, unknown> = {};
    const booleanFields = ['processed', 'dismissed'] as const;
    const stringFields = ['extractedText', 'generatedTitle', 'generatedCategory', 'memoryId'] as const;

    booleanFields.forEach((field) => {
      const value = getBoolean(record[field]);

      if (value !== undefined) {
        updates[field] = value;
      }
    });

    stringFields.forEach((field) => {
      if (field in record) {
        updates[field] = getString(record[field]);
      }
    });

    if ('generatedTags' in record) {
      updates.generatedTags = getStringArray(record.generatedTags) || [];
    }

    await connectDB();

    const screenshot = await ScreenshotInbox.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true
    }).lean();

    if (!screenshot) {
      return NextResponse.json({ error: 'Screenshot not found' }, { status: 404 });
    }

    return NextResponse.json({ data: screenshot });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const authError = validateApiKey(request);

  if (authError) {
    return authError;
  }

  try {
    const id = await getId(context);
    const idError = validateId(id);

    if (idError) {
      return idError;
    }

    await connectDB();

    const screenshot = await ScreenshotInbox.findByIdAndDelete(id).lean();

    if (!screenshot) {
      return NextResponse.json({ error: 'Screenshot not found' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Screenshot deleted', data: screenshot });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
