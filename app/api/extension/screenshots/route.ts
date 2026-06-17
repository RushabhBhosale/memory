import { NextResponse } from 'next/server';

import { validateApiKey } from '@/lib/apiKey';
import { connectDB } from '@/lib/mongodb';
import {
  createExtensionMemory,
  ExtensionRequestError,
  getErrorMessage,
  type ExtensionAttachment
} from '@/lib/extensionMemory';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;

const getFormString = (formData: FormData, key: string) => {
  const value = formData.get(key);

  return typeof value === 'string' ? value.trim() : '';
};

const getScreenshotFile = (formData: FormData) => {
  const image = formData.get('image');

  if (!(image instanceof File)) {
    throw new ExtensionRequestError('Screenshot image is required');
  }

  if (!image.type.startsWith('image/')) {
    throw new ExtensionRequestError('Screenshot must be an image');
  }

  if (image.size > MAX_SCREENSHOT_BYTES) {
    throw new ExtensionRequestError('Screenshot is too large. Limit is 5 MB.');
  }

  return image;
};

export async function POST(request: Request) {
  const authError = validateApiKey(request);

  if (authError) {
    return authError;
  }

  try {
    const formData = await request.formData();
    const image = getScreenshotFile(formData);
    const imageBuffer = Buffer.from(await image.arrayBuffer());
    const mimeType = image.type || 'image/png';
    const attachment: ExtensionAttachment = {
      kind: 'screenshot',
      name: image.name || 'visible-tab.png',
      mimeType,
      dataUrl: `data:${mimeType};base64,${imageBuffer.toString('base64')}`,
      size: image.size
    };

    await connectDB();

    const memory = await createExtensionMemory(
      {
        type: getFormString(formData, 'type') || 'note',
        content: 'Visible tab screenshot captured from Chrome.',
        note: getFormString(formData, 'note'),
        projectId: getFormString(formData, 'projectId') || null,
        source: {
          type: 'chrome_extension',
          title: getFormString(formData, 'sourceTitle'),
          url: getFormString(formData, 'sourceUrl'),
          capturedAt: getFormString(formData, 'capturedAt') || new Date().toISOString()
        }
      },
      attachment
    );

    return NextResponse.json({ data: memory }, { status: 201 });
  } catch (error) {
    if (error instanceof ExtensionRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    const status = error instanceof Error && error.name === 'ValidationError' ? 400 : 500;

    return NextResponse.json({ error: getErrorMessage(error) }, { status });
  }
}

