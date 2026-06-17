import { NextResponse } from 'next/server';

import { validateApiKey } from '@/lib/apiKey';
import { connectDB } from '@/lib/mongodb';
import {
  createExtensionMemory,
  ExtensionRequestError,
  getErrorMessage
} from '@/lib/extensionMemory';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const parseJsonBody = async (request: Request) => {
  try {
    return await request.json();
  } catch {
    return null;
  }
};

export async function POST(request: Request) {
  const authError = validateApiKey(request);

  if (authError) {
    return authError;
  }

  try {
    const body = await parseJsonBody(request);

    await connectDB();

    const memory = await createExtensionMemory(body);

    return NextResponse.json({ data: memory }, { status: 201 });
  } catch (error) {
    if (error instanceof ExtensionRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    const status = error instanceof Error && error.name === 'ValidationError' ? 400 : 500;

    return NextResponse.json({ error: getErrorMessage(error) }, { status });
  }
}

