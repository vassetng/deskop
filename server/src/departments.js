import express from "express";
import { getDepartments, addDepartment, removeDepartment } from "./store.js";
import { authMiddleware, requireAuth, requireAdmin } from "./auth.js";

export function createDepartmentsRouter() {
  const router = express.Router();

  router.get("/", authMiddleware, requireAuth, (_req, res) => {
    res.json(getDepartments());
  });

  router.post("/", authMiddleware, requireAdmin, (req, res) => {
    const { name } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ error: "name is required" });
    res.json(addDepartment(name.trim()));
  });

  router.delete("/:name", authMiddleware, requireAdmin, (req, res) => {
    res.json(removeDepartment(req.params.name));
  });

  return router;
}
