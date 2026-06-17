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

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Internal server error';

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

    const memories = await Memory.find({ projectId: id })
      .sort({ createdAt: -1 })
      .populate('projectId', 'name description status')
      .lean();

    return NextResponse.json({
      count: memories.length,
      project,
      data: memories
    });
  } catch (error) {
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}
