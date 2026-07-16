import { createHmac, timingSafeEqual } from 'node:crypto';

export type ExpenseUser = {
  id: string;
  username: string;
};

type ConfiguredExpenseUser = ExpenseUser & {
  password: string;
};

const getConfiguredUsers = (): ConfiguredExpenseUser[] => {
  const configured = process.env.EXPENSE_USERS_JSON?.trim();

  if (configured) {
    try {
      const parsed = JSON.parse(configured) as unknown;

      if (Array.isArray(parsed)) {
        return parsed.flatMap((item) => {
          if (!item || typeof item !== 'object') {
            return [];
          }

          const value = item as Record<string, unknown>;
          const id = typeof value.id === 'string' ? value.id.trim() : '';
          const username = typeof value.username === 'string' ? value.username.trim() : '';
          const password = typeof value.password === 'string' ? value.password : '';

          return id && username && password ? [{ id, username, password }] : [];
        });
      }
    } catch {
      return [];
    }
  }

  return [
    {
      id: 'main',
      username: process.env.EXPENSE_MAIN_USERNAME?.trim() || '',
      password: process.env.EXPENSE_MAIN_PASSWORD || ''
    },
    {
      id: 'secondary',
      username: process.env.EXPENSE_SECONDARY_USERNAME?.trim() || '',
      password: process.env.EXPENSE_SECONDARY_PASSWORD || ''
    }
  ].filter((user) => user.username && user.password);
};

const getSessionSecret = () => process.env.EXPENSE_SESSION_SECRET || '';

const equalSecrets = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
};

export const authenticateExpenseUser = (username: string, password: string) => {
  const normalizedUsername = username.trim().toLowerCase();
  const user = getConfiguredUsers().find(
    (candidate) => candidate.username.toLowerCase() === normalizedUsername
  );

  if (!user || !equalSecrets(user.password, password)) {
    return null;
  }

  return { id: user.id, username: user.username } satisfies ExpenseUser;
};

export const hasConfiguredExpenseUsers = () => getConfiguredUsers().length > 0;

export const createExpenseSession = (user: ExpenseUser) => {
  const secret = getSessionSecret();

  if (!secret) {
    throw new Error('EXPENSE_SESSION_SECRET is not configured');
  }

  const payload = Buffer.from(JSON.stringify(user)).toString('base64url');
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
};

export const getExpenseUser = (request: Request): ExpenseUser | null => {
  const token = request.headers.get('x-expense-session') || '';
  const secret = getSessionSecret();
  const [payload, signature] = token.split('.');

  if (!secret || !payload || !signature) {
    return null;
  }

  const expectedSignature = createHmac('sha256', secret).update(payload).digest('base64url');

  if (!equalSecrets(expectedSignature, signature)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >;
    const id = typeof parsed.id === 'string' ? parsed.id.trim() : '';
    const username = typeof parsed.username === 'string' ? parsed.username.trim() : '';

    return id && username ? { id, username } : null;
  } catch {
    return null;
  }
};

export const getExpenseOwnerFilter = (userId: string) =>
  userId === 'main'
    ? {
        $or: [{ userId: 'main' }, { userId: { $exists: false } }, { userId: null }]
      }
    : { userId };
