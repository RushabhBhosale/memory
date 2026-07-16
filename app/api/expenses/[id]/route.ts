import { NextResponse } from 'next/server';

import { getExpenseOwnerFilter, getExpenseUser } from '@/lib/expenseAuth';
import { connectDB } from '@/lib/mongodb';
import Expense from '@/models/Expense';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Internal server error';

export async function DELETE(request: Request, context: RouteContext) {
  const user = getExpenseUser(request);

  if (!user) {
    return NextResponse.json({ error: 'Login required' }, { status: 401 });
  }

  try {
    const { id } = await context.params;

    await connectDB();

    const expense = await Expense.findOneAndDelete({
      deviceExpenseId: id,
      ...getExpenseOwnerFilter(user.id)
    }).lean();

    if (!expense) {
      return NextResponse.json({ error: 'Expense not found' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Expense deleted', data: expense });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
