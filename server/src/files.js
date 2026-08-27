import express from "express";
import multer from "multer";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { addFile, getFiles } from "./store.js";

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

  router.get("/", (_req, res) => {
    res.json(getFiles());
  });

  router.post("/upload", upload.single("file"), (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const meta = {
      id: crypto.randomUUID(),
      originalName: req.file.originalname,
      storedName: req.file.filename,
      size: req.file.size,
      uploadedBy: req.body.uploadedBy || "Unknown",
      uploadedAt: new Date().toISOString(),
    };
    addFile(meta);
    io.emit("files:new", meta);
    res.json(meta);
  });

  router.get("/download/:storedName", (req, res) => {
    const file = getFiles().find((f) => f.storedName === req.params.storedName);
    if (!file) return res.status(404).json({ error: "File not found" });
    res.download(path.join(UPLOAD_DIR, file.storedName), file.originalName);
  });

  return router;
}
