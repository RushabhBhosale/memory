import { NextResponse } from "next/server";

import {
  dailyBriefRowToSummaryUpdate,
  getDefaultDailyBriefSyncDate,
  readDailyBriefRowFromSheet,
  CHATGPT_DAILY_BRIEF_SOURCE,
} from "@/lib/chatgptDailyBrief";
import { validateApiKey } from "@/lib/apiKey";
import { getDailySummaryDateError } from "@/lib/dailySummary";
import { connectDB } from "@/lib/mongodb";
import DailySummary from "@/models/DailySummary";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const parseJsonBody = async (request: Request) => {
  const text = await request.text();

  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
};

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Internal server error";

const validateSyncSecret = (request: Request) => {
  const expected = process.env.DAILY_BRIEF_SYNC_SECRET;
  const syncSecret = request.headers.get("x-sync-secret");

  if (!syncSecret && request.headers.get("x-api-key")) {
    return validateApiKey(request);
  }

  if (!expected) {
    return NextResponse.json(
      { error: "DAILY_BRIEF_SYNC_SECRET is required" },
      { status: 500 },
    );
  }

  if (syncSecret !== expected) {
    return NextResponse.json({ error: "Invalid sync secret" }, { status: 401 });
  }

  return null;
};

export async function POST(request: Request) {
  const authError = validateSyncSecret(request);

  if (authError) {
    return authError;
  }

  try {
    const body = await parseJsonBody(request);

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const requestedDate =
      typeof (body as Record<string, unknown>).date === "string"
        ? (body as Record<string, string>).date.trim()
        : "";
    const date = requestedDate || getDefaultDailyBriefSyncDate();
    const dateError = getDailySummaryDateError(date);

    if (dateError) {
      return NextResponse.json({ error: dateError }, { status: 400 });
    }

    const result = await readDailyBriefRowFromSheet(date);

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    if (!result.row) {
      return NextResponse.json(
        {
          date,
          error: "Daily brief row not found",
          sheetId: result.sheetId,
        },
        { status: 404 },
      );
    }

    await connectDB();

    const summary = await DailySummary.findOneAndUpdate(
      { date, source: CHATGPT_DAILY_BRIEF_SOURCE },
      dailyBriefRowToSummaryUpdate(result.row),
      {
        new: true,
        runValidators: true,
        setDefaultsOnInsert: true,
        upsert: true,
      },
    ).lean();

    return NextResponse.json({
      data: summary,
      date,
      message: "ChatGPT daily brief synced",
      source: CHATGPT_DAILY_BRIEF_SOURCE,
    });
  } catch (error) {
    console.error("ChatG PT daily brief sync failed", {
      error: getErrorMessage(error),
    });

    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}
