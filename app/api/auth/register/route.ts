import { NextResponse } from 'next/server';

import {
  createExpenseSession,
  ensureMainExpenseUser,
  registerExpenseUser
} from '@/lib/expenseAuth';
import { connectDB } from '@/lib/mongodb';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const value = body as Record<string, unknown>;
    const username = typeof value.username === 'string' ? value.username : '';
    const password = typeof value.password === 'string' ? value.password : '';

    await connectDB();
    await ensureMainExpenseUser();

    const user = await registerExpenseUser(username, password);

    return NextResponse.json(
      {
        data: {
          token: createExpenseSession(user),
          user
        }
      },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to register';
    const isConflict =
      message === 'Username is already registered' ||
      (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000);
    const isValidation = message.startsWith('Username must') || message.startsWith('Password must');

    return NextResponse.json(
      { error: isConflict ? 'Username is already registered' : message },
      { status: isConflict ? 409 : isValidation ? 400 : 500 }
    );
  }
}
