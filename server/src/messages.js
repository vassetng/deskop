import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { getDmMessages, getChannelMessages, findMessageByAttachment } from "./store.js";
import { authMiddleware, requireAuth, resolveStaffFromToken } from "./auth.js";
import { serverPath } from "./paths.js";

const ATTACHMENTS_DIR = serverPath("uploads", "messages");
if (!fs.existsSync(ATTACHMENTS_DIR)) fs.mkdirSync(ATTACHMENTS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, ATTACHMENTS_DIR),
  filename: (_req, file, cb) => {
    const id = crypto.randomUUID();
    const ext = path.extname(file.originalname);
    cb(null, `${id}${ext}`);
  },
});

const upload = multer({ storage, limits: { fileSize: 200 * 1024 * 1024 } });

function canAccessMessage(staff, msg) {
  if (!msg) return false;
  if (msg.kind === "dm") return msg.target.split(":").includes(staff.id);
  if (msg.kind === "channel") return staff.role === "admin" || staff.department === msg.target;
  return false;
}

export function createMessagesRouter() {
  const router = express.Router();

  router.get("/", authMiddleware, requireAuth, (req, res) => {
    const { kind, with: withId, department } = req.query;

    if (kind === "dm") {
      if (!withId) return res.status(400).json({ error: "with is required for DMs" });
      return res.json(getDmMessages(req.staff.id, withId));
    }

    if (kind === "channel") {
      if (!department) return res.status(400).json({ error: "department is required for channels" });
      if (req.staff.role !== "admin" && req.staff.department !== department) {
        return res.status(403).json({ error: "Not a member of this department" });
      }
      return res.json(getChannelMessages(department));
    }

    return res.status(400).json({ error: "kind must be 'dm' or 'channel'" });
  });

  // Uploaded first, then its metadata is attached to a message sent over the
  // socket — this endpoint alone doesn't make the file visible to anyone.
  router.post("/attachments", authMiddleware, requireAuth, upload.single("file"), (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    res.json({
      storedName: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
    });
  });

  // Access is checked against whichever message actually references this
  // attachment (DM: must be a participant; channel: must be a member or
  // admin) — not just "any logged-in staff", unlike the general Files tab.
  router.get("/attachments/:storedName", (req, res) => {
    const staff = req.header("Authorization")?.startsWith("Bearer ")
      ? resolveStaffFromToken(req.header("Authorization").slice(7))
      : resolveStaffFromToken(req.query.token);
    if (!staff) return res.status(401).json({ error: "Not authenticated" });

    const msg = findMessageByAttachment(req.params.storedName);
    if (!msg || !canAccessMessage(staff, msg)) {
      return res.status(404).json({ error: "Attachment not found" });
    }

    res.download(path.join(ATTACHMENTS_DIR, msg.attachment.storedName), msg.attachment.originalName);
  });

  return router;
}
