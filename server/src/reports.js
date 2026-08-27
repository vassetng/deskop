import express from "express";
import crypto from "crypto";
import { addReport, getReportsByDate } from "./store.js";

const ADMIN_CODE = process.env.ADMIN_CODE || "admin123";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function createReportsRouter() {
  const router = express.Router();

  router.post("/", (req, res) => {
    const { authorName, tasksCompleted, blockers, planForTomorrow } = req.body || {};
    if (!authorName || !tasksCompleted) {
      return res.status(400).json({ error: "authorName and tasksCompleted are required" });
    }

    const report = {
      id: crypto.randomUUID(),
      authorName: String(authorName).slice(0, 60),
      tasksCompleted: String(tasksCompleted).slice(0, 4000),
      blockers: String(blockers || "").slice(0, 2000),
      planForTomorrow: String(planForTomorrow || "").slice(0, 2000),
      date: todayISO(),
      submittedAt: new Date().toISOString(),
    };
    addReport(report);
    res.json(report);
  });

  router.get("/", (req, res) => {
    if (req.header("x-admin-code") !== ADMIN_CODE) {
      return res.status(401).json({ error: "Invalid admin code" });
    }
    const date = req.query.date || todayISO();
    res.json(getReportsByDate(date));
  });

  return router;
}
