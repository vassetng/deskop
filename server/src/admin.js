import express from "express";
import { getActivity, getAllStaff, getPresenceRoster, getReports } from "./store.js";
import { authMiddleware, requireAdmin } from "./auth.js";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function isWeekday(date) {
  const day = date.getUTCDay();
  return day !== 0 && day !== 6;
}

// Punctuality is measured over a rolling window (or since the account was
// created, if newer) counting weekdays only, with "today" excluded — the
// day isn't over yet, so not having submitted yet isn't a miss.
const SCORECARD_WINDOW_DAYS = 30;

function buildScorecard(staffRecord, allReports) {
  const reportDates = new Set(
    allReports.filter((r) => r.authorId === staffRecord.id).map((r) => r.date)
  );

  const endExclusive = new Date(`${todayISO()}T00:00:00.000Z`);
  const windowStart = new Date(endExclusive);
  windowStart.setUTCDate(windowStart.getUTCDate() - SCORECARD_WINDOW_DAYS);
  const createdAt = new Date(staffRecord.createdAt);
  const start = createdAt > windowStart ? createdAt : windowStart;

  let expected = 0;
  let submitted = 0;
  const cursor = new Date(`${start.toISOString().slice(0, 10)}T00:00:00.000Z`);
  while (cursor < endExclusive) {
    if (isWeekday(cursor)) {
      expected++;
      if (reportDates.has(cursor.toISOString().slice(0, 10))) submitted++;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  let currentStreak = 0;
  const streakCursor = new Date(endExclusive);
  streakCursor.setUTCDate(streakCursor.getUTCDate() - 1);
  while (streakCursor >= start) {
    if (isWeekday(streakCursor)) {
      if (reportDates.has(streakCursor.toISOString().slice(0, 10))) {
        currentStreak++;
      } else {
        break;
      }
    }
    streakCursor.setUTCDate(streakCursor.getUTCDate() - 1);
  }

  return {
    staffId: staffRecord.id,
    name: staffRecord.displayName,
    department: staffRecord.department,
    expectedDays: expected,
    submittedDays: submitted,
    missedDays: expected - submitted,
    punctualityPct: expected > 0 ? Math.round((submitted / expected) * 100) : 100,
    currentStreak,
    submittedToday: reportDates.has(todayISO()),
  };
}

export function createAdminRouter() {
  const router = express.Router();

  router.get("/activity", authMiddleware, requireAdmin, (_req, res) => {
    res.json(getActivity());
  });

  router.get("/stats", authMiddleware, requireAdmin, (_req, res) => {
    const totalStaff = getAllStaff().length;
    const onlineCount = new Set(getPresenceRoster().map((p) => p.staffId)).size;
    const today = todayISO();
    const todaysReports = getReports().filter((r) => r.date === today);
    res.json({
      totalStaff,
      onlineCount,
      reportsToday: todaysReports.length,
      reportsReviewed: todaysReports.filter((r) => r.status === "reviewed").length,
    });
  });

  router.get("/scorecards", authMiddleware, requireAdmin, (_req, res) => {
    const allReports = getReports();
    res.json(getAllStaff().map((s) => buildScorecard(s, allReports)));
  });

  return router;
}
