import type { Memory } from '../services/api';

const USERNAME_PREFIX = 'Username/Email:';
const PASSWORD_PREFIX = 'Password:';

const normalizeLineValue = (value: string) => value.replace(/\s+/g, ' ').trim();

export const buildCredentialContent = (usernameOrEmail: string, password: string) =>
  `${USERNAME_PREFIX} ${normalizeLineValue(usernameOrEmail)}\n${PASSWORD_PREFIX} ${password.trim()}`;

export const parseCredentialContent = (content: string) => {
  const lines = content.split(/\r?\n/);
  let usernameOrEmail = '';
  let password = '';

  for (const line of lines) {
    if (line.toLowerCase().startsWith(USERNAME_PREFIX.toLowerCase())) {
      usernameOrEmail = normalizeLineValue(line.slice(USERNAME_PREFIX.length));
      continue;
    }

    if (line.toLowerCase().startsWith(PASSWORD_PREFIX.toLowerCase())) {
      password = line.slice(PASSWORD_PREFIX.length).trim();
    }
  }

  return {
    usernameOrEmail,
    password
  };
};

export const isVaultMemory = (memory: Memory) =>
  memory.kind === 'credential' ||
  memory.category.toLowerCase() === 'vault' ||
  memory.tags.some((tag) => tag.toLowerCase() === 'vault');

export const maskPassword = (password: string) => {
  if (!password) {
    return '';
  }

  return '\u2022'.repeat(Math.min(Math.max(password.length, 8), 16));
};
