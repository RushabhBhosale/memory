import { NextResponse } from 'next/server';

import { validateApiKey } from '@/lib/apiKey';
import { connectDB } from '@/lib/mongodb';
import Memory from '@/models/Memory';

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

export async function GET(request: Request) {
  const authError = validateApiKey(request);

  if (authError) {
    return authError;
  }

  try {
    await connectDB();

    const memories = await Memory.find().sort({ createdAt: -1 }).lean();

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

    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    await connectDB();

    const memory = await Memory.create(body);

    return NextResponse.json({ data: memory }, { status: 201 });
  } catch (error) {
    const status = error instanceof Error && error.name === 'ValidationError' ? 400 : 500;

    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status }
    );
  }
}
