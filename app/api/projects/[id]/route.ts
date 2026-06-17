import mongoose from 'mongoose';
import { NextResponse } from 'next/server';

import { validateApiKey } from '@/lib/apiKey';
import { connectDB } from '@/lib/mongodb';
import Memory from '@/models/Memory';
import Project from '@/models/Project';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

const allowedUpdateFields = ['name', 'description', 'status', 'tags', 'source'] as const;

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Internal server error';

const parseJsonBody = async (request: Request) => {
  try {
    return await request.json();
  } catch {
    return null;
  }
};

const getProjectId = async (context: RouteContext) => {
  const { id } = await context.params;
  return id;
};

const validateProjectId = (id: string) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'Invalid project id' }, { status: 400 });
  }

  return null;
};

const pickProjectUpdates = (body: Record<string, unknown>) =>
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
    const id = await getProjectId(context);
    const idError = validateProjectId(id);

    if (idError) {
      return idError;
    }

    await connectDB();

    const project = await Project.findById(id).lean();

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    return NextResponse.json({ data: project });
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
    const id = await getProjectId(context);
    const idError = validateProjectId(id);

    if (idError) {
      return idError;
    }

    const body = await parseJsonBody(request);

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const updates = pickProjectUpdates(body as Record<string, unknown>);

    if (!Object.keys(updates).length) {
      return NextResponse.json(
        { error: 'No valid fields provided for update' },
        { status: 400 }
      );
    }

    await connectDB();

    const project = await Project.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true
    }).lean();

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    return NextResponse.json({ data: project });
  } catch (error) {
    const status = error instanceof Error && error.name === 'ValidationError' ? 400 : 500;

    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status }
    );
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const authError = validateApiKey(request);

  if (authError) {
    return authError;
  }

  try {
    const id = await getProjectId(context);
    const idError = validateProjectId(id);

    if (idError) {
      return idError;
    }

    await connectDB();

    const project = await Project.findByIdAndDelete(id).lean();

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    await Memory.updateMany({ projectId: id }, { $unset: { projectId: '' } });

    return NextResponse.json({
      message: 'Project deleted',
      data: project
    });
  } catch (error) {
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}
