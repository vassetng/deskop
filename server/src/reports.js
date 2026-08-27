import express from "express";
import crypto from "crypto";
import { addReport, getReportsByDate, setReportStatus, logActivity } from "./store.js";
import { authMiddleware, requireAuth, requireAdmin } from "./auth.js";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function createReportsRouter() {
  const router = express.Router();

  router.post("/", authMiddleware, requireAuth, (req, res) => {
    const { tasksCompleted, blockers, planForTomorrow } = req.body || {};
    if (!tasksCompleted) {
      return res.status(400).json({ error: "tasksCompleted is required" });
    }

    const report = {
      id: crypto.randomUUID(),
      authorId: req.staff.id,
      authorName: req.staff.displayName,
      department: req.staff.department,
      tasksCompleted: String(tasksCompleted).slice(0, 4000),
      blockers: String(blockers || "").slice(0, 2000),
      planForTomorrow: String(planForTomorrow || "").slice(0, 2000),
      date: todayISO(),
      submittedAt: new Date().toISOString(),
      status: "new",
    };
    addReport(report);
    logActivity("report:submitted", { staffId: req.staff.id, name: req.staff.displayName });
    res.json(report);
  });

  router.get("/", authMiddleware, requireAdmin, (req, res) => {
    const date = req.query.date || todayISO();
    res.json(getReportsByDate(date));
  });

  router.put("/:id/status", authMiddleware, requireAdmin, (req, res) => {
    const { status } = req.body || {};
    if (!["new", "reviewed"].includes(status)) {
      return res.status(400).json({ error: "status must be 'new' or 'reviewed'" });
    }
    const report = setReportStatus(req.params.id, status);
    if (!report) return res.status(404).json({ error: "Report not found" });
    res.json(report);
  });

  return router;
}
