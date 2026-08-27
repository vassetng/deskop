import express from "express";
import multer from "multer";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { addFile, getFiles } from "./store.js";
import { authMiddleware, requireAuth, resolveStaffFromToken } from "./auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.join(__dirname, "..", "uploads");

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const id = crypto.randomUUID();
    const ext = path.extname(file.originalname);
    cb(null, `${id}${ext}`);
  },
});

const upload = multer({ storage, limits: { fileSize: 200 * 1024 * 1024 } });

export function createFilesRouter(io) {
  const router = express.Router();

  router.get("/", authMiddleware, requireAuth, (_req, res) => {
    res.json(getFiles());
  });

  router.post("/upload", authMiddleware, requireAuth, upload.single("file"), (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const meta = {
      id: crypto.randomUUID(),
      originalName: req.file.originalname,
      storedName: req.file.filename,
      size: req.file.size,
      uploadedBy: req.staff.displayName,
      uploadedAt: new Date().toISOString(),
    };
    addFile(meta);
    io.emit("files:new", meta);
    res.json(meta);
  });

  router.get("/download/:storedName", (req, res) => {
    // Plain <a href> downloads can't carry an Authorization header, so this
    // route also accepts the session token as a query param.
    const staff = req.header("Authorization")?.startsWith("Bearer ")
      ? resolveStaffFromToken(req.header("Authorization").slice(7))
      : resolveStaffFromToken(req.query.token);
    if (!staff) return res.status(401).json({ error: "Not authenticated" });

    const file = getFiles().find((f) => f.storedName === req.params.storedName);
    if (!file) return res.status(404).json({ error: "File not found" });
    res.download(path.join(UPLOAD_DIR, file.storedName), file.originalName);
  });

  return router;
}
