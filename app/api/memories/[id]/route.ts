import mongoose from 'mongoose';
import { NextResponse } from 'next/server';

import { validateApiKey } from '@/lib/apiKey';
import { connectDB } from '@/lib/mongodb';
import Memory from '@/models/Memory';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

const allowedUpdateFields = ['title', 'content', 'category', 'tags', 'source'] as const;

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Internal server error';

const parseJsonBody = async (request: Request) => {
  try {
    return await request.json();
  } catch {
    return null;
  }
};

const getMemoryId = async (context: RouteContext) => {
  const { id } = await context.params;
  return id;
};

const validateMemoryId = (id: string) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'Invalid memory id' }, { status: 400 });
  }

  return null;
};

const pickMemoryUpdates = (body: Record<string, unknown>) =>
  allowedUpdateFields.reduce<Record<string, unknown>>((updates, field) => {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      updates[field] = body[field];
    }

    return updates;
  }, {});

export async function GET(request: Request, context: RouteContext) {
  const authError = validateApiKey(request);

  if (authError) {
    return authError;
  }

  try {
    const id = await getMemoryId(context);
    const idError = validateMemoryId(id);

    if (idError) {
      return idError;
    }

    await connectDB();

    const memory = await Memory.findById(id).lean();

    if (!memory) {
      return NextResponse.json({ error: 'Memory not found' }, { status: 404 });
    }

    return NextResponse.json({ data: memory });
  } catch (error) {
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const authError = validateApiKey(request);

  if (authError) {
    return authError;
  }

  try {
    const id = await getMemoryId(context);
    const idError = validateMemoryId(id);

    if (idError) {
      return idError;
    }

    await connectDB();

    const memory = await Memory.findByIdAndDelete(id).lean();

    if (!memory) {
      return NextResponse.json({ error: 'Memory not found' }, { status: 404 });
    }

    return NextResponse.json({
      message: 'Memory deleted',
      data: memory
    });
  } catch (error) {
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const authError = validateApiKey(request);

  if (authError) {
    return authError;
  }

  try {
    const id = await getMemoryId(context);
    const idError = validateMemoryId(id);

    if (idError) {
      return idError;
    }

    const body = await parseJsonBody(request);

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const updates = pickMemoryUpdates(body as Record<string, unknown>);

    if (!Object.keys(updates).length) {
      return NextResponse.json(
        { error: 'No valid fields provided for update' },
        { status: 400 }
      );
    }

    await connectDB();

    const memory = await Memory.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true
    }).lean();

    if (!memory) {
      return NextResponse.json({ error: 'Memory not found' }, { status: 404 });
    }

    return NextResponse.json({ data: memory });
  } catch (error) {
    const status = error instanceof Error && error.name === 'ValidationError' ? 400 : 500;

    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status }
    );
  }
}
