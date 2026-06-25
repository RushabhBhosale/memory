import mongoose from 'mongoose';
import { NextResponse } from 'next/server';

import { validateApiKey } from '@/lib/apiKey';
import { normalizeMemoryCategory } from '@/lib/memoryCategories';
import { connectDB } from '@/lib/mongodb';
import { getFallbackTitle } from '@/lib/titleFallback';
import Memory from '@/models/Memory';
import '@/models/Project';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const parseJsonBody = async (request: Request) => {
  try {
    return await request.json();
  } catch {
    return null;
  }
};

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Internal server error';

const getString = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const normalizeType = (value: unknown) => {
  const type = getString(value).toLowerCase().replace(/_/g, '-');

  if (['memory', 'log', 'task', 'note', 'meeting', 'reminder'].includes(type)) {
    return type as 'memory' | 'log' | 'task' | 'note' | 'meeting' | 'reminder';
  }

  return undefined;
};

const buildCreatePayload = (body: Record<string, unknown>) => {
  const content = getString(body.content);
  const incomingTitle = getString(body.title);
  const sourceTitle = getString(body.sourceTitle);
  const sourceUrl = getString(body.sourceUrl);
  const screenshotUri = getString(body.screenshotUri);
  const type = normalizeType(body.type);
  const titleSource = content || sourceTitle || sourceUrl || screenshotUri;

  if (!incomingTitle && !titleSource) {
    return null;
  }

  return {
    ...body,
    title: incomingTitle || getFallbackTitle(titleSource, type || 'memory'),
    content,
    screenshotUri,
    category: normalizeMemoryCategory(
      getString(body.category) ||
        (type === 'reminder'
          ? 'reminder'
          : type === 'task'
            ? 'task'
            : type === 'meeting'
              ? 'meeting'
              : type === 'log'
                ? 'general'
                : undefined),
      {
        allowVault: getString(body.kind) === 'credential',
        fallback: type === 'task' ? 'task' : type === 'meeting' ? 'meeting' : 'general'
      }
    ),
    kind:
      type === 'log'
        ? 'work_done'
        : type === 'task'
          ? 'task'
          : getString(body.kind) || 'note'
  };
};

const validateProjectId = (projectId: unknown) => {
  if (
    projectId !== undefined &&
    projectId !== '' &&
    (typeof projectId !== 'string' || !mongoose.Types.ObjectId.isValid(projectId))
  ) {
    return NextResponse.json({ error: 'Invalid project id' }, { status: 400 });
  }

  return null;
};

export async function GET(request: Request) {
  const authError = validateApiKey(request);

  if (authError) {
    return authError;
  }

  try {
    const { searchParams } = new URL(request.url);
    const projectId = String(searchParams.get('projectId') || '').trim();
    const projectIdError = validateProjectId(projectId);

    if (projectIdError) {
      return projectIdError;
    }

    const query = projectId ? { projectId } : {};

    await connectDB();

    const memories = await Memory.find(query)
      .sort({ createdAt: -1 })
      .populate('projectId', 'name description status')
      .lean();

    return NextResponse.json({
      count: memories.length,
      data: memories
    });
  } catch (error) {
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 }
    );
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

    const bodyRecord = body as Record<string, unknown>;
    const projectIdError = validateProjectId(bodyRecord.projectId);

    if (projectIdError) {
      return projectIdError;
    }

    const createPayload = buildCreatePayload(bodyRecord);

    if (!createPayload) {
      return NextResponse.json({ error: 'Memory title or content is required' }, { status: 400 });
    }

    await connectDB();

    const memory = await Memory.create(createPayload);
    const createdMemory = await Memory.findById(memory._id)
      .populate('projectId', 'name description status')
      .lean();

    return NextResponse.json({ data: createdMemory }, { status: 201 });
  } catch (error) {
    const status = error instanceof Error && error.name === 'ValidationError' ? 400 : 500;

    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status }
    );
  }
}
