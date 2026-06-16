import { NextResponse } from 'next/server';

export function validateApiKey(request: Request) {
  const expectedApiKey = process.env.MEMORY_API_KEY;
  const providedApiKey = request.headers.get('x-api-key');

  if (!expectedApiKey) {
    return NextResponse.json(
      { error: 'Server configuration error' },
      { status: 500 }
    );
  }

  if (!providedApiKey || providedApiKey !== expectedApiKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return null;
}
