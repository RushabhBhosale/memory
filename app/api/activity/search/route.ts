import { NextResponse } from 'next/server';

import { validateApiKey } from '@/lib/apiKey';
import { runHybridSearch } from '@/lib/hybridSearch';
import { connectDB } from '@/lib/mongodb';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SEARCH_RESULT_LIMIT = 40;

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
    const debug = searchParams.get('debug') === 'true';

    if (!query) {
      return NextResponse.json(
        { error: 'Search query parameter q is required' },
        { status: 400 }
      );
    }

    await connectDB();

    const search = await runHybridSearch(query, {
      limit: SEARCH_RESULT_LIMIT
    });

    return NextResponse.json({
      query,
      count: search.results.length,
      limit: SEARCH_RESULT_LIMIT,
      data: search.results.map(({ score: _score, scoreReasons: _scoreReasons, ...item }) => item),
      ...(debug ? { debug: search.debug } : {})
    });
  } catch (error) {
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}
