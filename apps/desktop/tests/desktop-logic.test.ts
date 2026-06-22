import test from "node:test";
import assert from "node:assert/strict";

import { detectProjectName } from "../src/main/services/classifier.js";
import { formatLocalDateKey, getLocalDayRange, splitRangeByLocalDay } from "../src/shared/localTime.js";

test("detectProjectName prefers workspace-like segment over filename", () => {
  assert.equal(detectProjectName("Code", "package.json — memory"), "memory");
  assert.equal(detectProjectName("Cursor", "tracker.ts — memory — Cursor"), "memory");
});

test("detectProjectName returns null for weak file-only titles", () => {
  assert.equal(detectProjectName("Code", "package.json"), null);
  assert.equal(detectProjectName("Code", "index.ts — Code"), null);
});

test("splitRangeByLocalDay splits ranges at local midnight", () => {
  const firstDay = new Date(2026, 5, 22, 23, 59, 58);
  const secondDay = new Date(2026, 5, 23, 0, 0, 3);
  const segments = splitRangeByLocalDay(firstDay, secondDay);

  assert.equal(segments.length, 2);
  assert.equal(segments[0]?.dateKey, formatLocalDateKey(firstDay));
  assert.equal(segments[1]?.dateKey, formatLocalDateKey(secondDay));
});

test("getLocalDayRange returns the expected local day bounds", () => {
  const firstDay = new Date(2026, 5, 22, 23, 59, 58);
  const secondDay = new Date(2026, 5, 23, 0, 0, 3);
  const firstDayKey = formatLocalDateKey(firstDay);
  const secondDayKey = formatLocalDateKey(secondDay);
  const { start: firstStart, end: firstEnd } = getLocalDayRange(firstDayKey);
  const { start: secondStart, end: secondEnd } = getLocalDayRange(secondDayKey);
 
  assert.equal(formatLocalDateKey(firstStart), firstDayKey);
  assert.equal(formatLocalDateKey(secondStart), secondDayKey);
  assert.ok(firstStart.toISOString() < firstEnd.toISOString());
  assert.ok(secondStart.toISOString() < secondEnd.toISOString());
});
