import express from "express";
import { getActivity, getAllStaff, getPresenceRoster, getReports } from "./store.js";
import { authMiddleware, requireAdmin } from "./auth.js";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
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

  return router;
}
