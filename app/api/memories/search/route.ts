import { NextResponse } from 'next/server';

import { validateApiKey } from '@/lib/apiKey';
import { connectDB } from '@/lib/mongodb';
import Memory from '@/models/Memory';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SEARCH_RESULT_LIMIT = 20;

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Internal server error';

export async function GET(request: Request) {
  const authError = validateApiKey(request);

  if (authError) {
    return authError;
  }

  try {
    const { searchParams } = new URL(request.url);
    const query = String(searchParams.get('q') || '').trim();

    if (!query) {
      return NextResponse.json(
        { error: 'Search query parameter q is required' },
        { status: 400 }
      );
    }

    const regexSearch = { $regex: escapeRegex(query), $options: 'i' };

    await connectDB();

    const memories = await Memory.find({
      $or: [
        { title: regexSearch },
        { content: regexSearch },
        { category: regexSearch },
        { tags: regexSearch }
      ]
    })
      .sort({ createdAt: -1 })
      .limit(SEARCH_RESULT_LIMIT)
      .lean();

    return NextResponse.json({
      query,
      count: memories.length,
      limit: SEARCH_RESULT_LIMIT,
      data: memories
    });
  } catch (error) {
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}
