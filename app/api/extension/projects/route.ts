import { NextResponse } from 'next/server';

import { validateApiKey } from '@/lib/apiKey';
import { connectDB } from '@/lib/mongodb';
import { getErrorMessage } from '@/lib/extensionMemory';
import Project from '@/models/Project';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const authError = validateApiKey(request);

  if (authError) {
    return authError;
  }

  try {
    await connectDB();

    const projects = await Project.find().sort({ updatedAt: -1 }).lean();

    return NextResponse.json({
      count: projects.length,
      data: projects
    });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

