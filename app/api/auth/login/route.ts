import { NextResponse } from 'next/server';

import { authenticateExpenseUser, createExpenseSession, ensureMainExpenseUser } from '@/lib/expenseAuth';
import { connectDB } from '@/lib/mongodb';
import Expense from '@/models/Expense';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const username = body && typeof body === 'object' && typeof body.username === 'string' ? body.username : '';
    const password = body && typeof body === 'object' && typeof body.password === 'string' ? body.password : '';
    await connectDB();
    await ensureMainExpenseUser();
    const user = await authenticateExpenseUser(username, password);

    if (!user) {
      return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
    }

    if (user.id === 'main') {
      await Expense.updateMany(
        { $or: [{ userId: { $exists: false } }, { userId: null }] },
        { $set: { userId: 'main' } }
      );
    }

    return NextResponse.json({
      data: {
        token: createExpenseSession(user),
        user
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to log in' },
      { status: 500 }
    );
  }
}
