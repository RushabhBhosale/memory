import { createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';

import ExpenseAccount from '@/models/ExpenseAccount';

export type ExpenseUser = {
  id: string;
  username: string;
};

type ConfiguredExpenseUser = ExpenseUser & {
  password: string;
};

const DEFAULT_MAIN_ACCOUNT = {
  passwordHash: 'd551a87e58a31cfa05473a3bce253a50c8952706607d3c6886f5d49fdb13951346773a8a74907a1cee0bee8dd81a402cd7f257e95f2225696db4560c4d3fe322',
  passwordSalt: '32e9c90e747bad96a17939652fd61225',
  userId: 'main',
  username: 'rushi',
  usernameNormalized: 'rushi'
} as const;

const PASSWORD_KEY_LENGTH = 64;

const normalizeUsername = (username: string) => username.trim().toLowerCase();

const hashPassword = (password: string, salt: string) =>
  scryptSync(password, salt, PASSWORD_KEY_LENGTH).toString('hex');

const verifyPasswordHash = (password: string, salt: string, expectedHash: string) => {
  const actual = Buffer.from(hashPassword(password, salt), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
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

export const ensureMainExpenseUser = async () => {
  await ExpenseAccount.findOneAndUpdate(
    { userId: DEFAULT_MAIN_ACCOUNT.userId },
    { $set: DEFAULT_MAIN_ACCOUNT },
    { runValidators: true, setDefaultsOnInsert: true, upsert: true }
  );
};

export const authenticateExpenseUser = async (username: string, password: string) => {
  const normalizedUsername = normalizeUsername(username);
  const account = await ExpenseAccount.findOne({ usernameNormalized: normalizedUsername })
    .select('+passwordHash +passwordSalt')
    .lean();

  if (
    account &&
    verifyPasswordHash(password, account.passwordSalt, account.passwordHash)
  ) {
    return { id: account.userId, username: account.username } satisfies ExpenseUser;
  }

  const user = getConfiguredUsers().find(
    (candidate) => candidate.username.toLowerCase() === normalizedUsername
  );

  if (!user || !equalSecrets(user.password, password)) {
    return null;
  }

  return { id: user.id, username: user.username } satisfies ExpenseUser;
};

export const registerExpenseUser = async (username: string, password: string) => {
  const trimmedUsername = username.trim();
  const usernameNormalized = normalizeUsername(username);

  if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(trimmedUsername)) {
    throw new Error('Username must be 3-32 characters and use only letters, numbers, ., _, or -');
  }

  if (password.length < 8 || password.length > 128) {
    throw new Error('Password must be between 8 and 128 characters');
  }

  const existing = await ExpenseAccount.exists({ usernameNormalized });
  if (existing) {
    throw new Error('Username is already registered');
  }

  const passwordSalt = randomBytes(16).toString('hex');
  const account = await ExpenseAccount.create({
    passwordHash: hashPassword(password, passwordSalt),
    passwordSalt,
    userId: randomUUID(),
    username: trimmedUsername,
    usernameNormalized
  });

  return { id: account.userId, username: account.username } satisfies ExpenseUser;
};

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
