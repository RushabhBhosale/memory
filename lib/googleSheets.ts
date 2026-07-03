import crypto from 'crypto';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';

type TokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

type SheetValuesResponse = {
  values?: string[][];
  error?: {
    message?: string;
  };
};

const base64Url = (value: Buffer | string) =>
  Buffer.from(value)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

const getPrivateKey = () => {
  const key = process.env.GOOGLE_SHEETS_PRIVATE_KEY;

  if (!key) {
    throw new Error('GOOGLE_SHEETS_PRIVATE_KEY is required');
  }

  return key.replace(/\\n/g, '\n');
};

const getClientEmail = () => {
  const email = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;

  if (!email) {
    throw new Error('GOOGLE_SHEETS_CLIENT_EMAIL is required');
  }

  return email;
};

export const getGoogleSheetsAccessToken = async () => {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64Url(
    JSON.stringify({
      aud: GOOGLE_TOKEN_URL,
      exp: now + 3600,
      iat: now,
      iss: getClientEmail(),
      scope: SHEETS_SCOPE
    })
  );
  const unsignedToken = `${header}.${payload}`;
  const signature = crypto
    .createSign('RSA-SHA256')
    .update(unsignedToken)
    .sign(getPrivateKey());
  const assertion = `${unsignedToken}.${base64Url(signature)}`;

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      assertion,
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer'
    })
  });
  const body = (await response.json()) as TokenResponse;

  if (!response.ok || !body.access_token) {
    throw new Error(body.error_description || body.error || 'Unable to authenticate with Google Sheets');
  }

  return body.access_token;
};

export const readGoogleSheetValues = async (sheetId: string, range = 'A:G') => {
  const accessToken = await getGoogleSheetsAccessToken();
  const url = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/${encodeURIComponent(range)}`
  );
  url.searchParams.set('majorDimension', 'ROWS');

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
  const body = (await response.json()) as SheetValuesResponse;

  if (!response.ok) {
    throw new Error(body.error?.message || `Google Sheets read failed with ${response.status}`);
  }

  return body.values || [];
};
