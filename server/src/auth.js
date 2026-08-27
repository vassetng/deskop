import express from "express";
import {
  findStaffByUsername,
  verifyPassword,
  createSession,
  resolveSession,
  destroySession,
  publicStaff,
  createStaff,
  getAllStaff,
  updateStaff,
  deleteStaff,
  logActivity,
} from "./store.js";

export function authMiddleware(req, res, next) {
  const header = req.header("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  const staff = token ? resolveSession(token) : null;
  req.staff = staff;
  req.token = token;
  next();
}

export function requireAuth(req, res, next) {
  if (!req.staff) return res.status(401).json({ error: "Not authenticated" });
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.staff) return res.status(401).json({ error: "Not authenticated" });
  if (req.staff.role !== "admin") return res.status(403).json({ error: "Admin access required" });
  next();
}

export function createAuthRouter() {
  const router = express.Router();

  router.post("/login", (req, res) => {
    const { username, password } = req.body || {};
    const record = findStaffByUsername(username || "");
    if (!record || !verifyPassword(password || "", record.passwordSalt, record.passwordHash)) {
      return res.status(401).json({ error: "Invalid username or password" });
    }
    const token = createSession(record.id);
    logActivity("login", { staffId: record.id, name: record.displayName });
    res.json({ token, staff: publicStaff(record) });
  });

  router.post("/logout", authMiddleware, (req, res) => {
    if (req.token) destroySession(req.token);
    res.json({ ok: true });
  });

  router.get("/me", authMiddleware, requireAuth, (req, res) => {
    res.json(publicStaff(req.staff));
  });

  // Staff directory — readable by any logged-in staff member.
  router.get("/staff", authMiddleware, requireAuth, (_req, res) => {
    res.json(getAllStaff().map(publicStaff));
  });

  // --- Staff account management (admin only) ---

  router.post("/staff", authMiddleware, requireAdmin, (req, res) => {
    const { username, password, displayName, department, role } = req.body || {};
    if (!username || !password || !displayName || !department) {
      return res.status(400).json({ error: "username, password, displayName, department are required" });
    }
    if (findStaffByUsername(username)) {
      return res.status(409).json({ error: "Username already taken" });
    }
    const record = createStaff({ username, password, displayName, department, role });
    logActivity("staff:created", { staffId: record.id, name: record.displayName, by: req.staff.displayName });
    res.json(publicStaff(record));
  });

  router.put("/staff/:id", authMiddleware, requireAdmin, (req, res) => {
    const { displayName, department, role } = req.body || {};
    const updates = {};
    if (displayName) updates.displayName = displayName;
    if (department) updates.department = department;
    if (role) updates.role = role === "admin" ? "admin" : "staff";
    const record = updateStaff(req.params.id, updates);
    if (!record) return res.status(404).json({ error: "Staff not found" });
    res.json(publicStaff(record));
  });

  router.delete("/staff/:id", authMiddleware, requireAdmin, (req, res) => {
    if (req.params.id === req.staff.id) {
      return res.status(400).json({ error: "Cannot delete your own account" });
    }
    deleteStaff(req.params.id);
    res.json({ ok: true });
  });

  return router;
}

export function resolveStaffFromToken(token) {
  return token ? resolveSession(token) : null;
}
