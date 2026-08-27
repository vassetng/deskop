import express from "express";
import cors from "cors";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { Server } from "socket.io";
import { createFilesRouter } from "./files.js";
import { createReportsRouter } from "./reports.js";
import { registerSocketHandlers } from "./socket.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4000;
const ADMIN_CODE = process.env.ADMIN_CODE || "admin123";

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.get("/health", (_req, res) => res.json({ ok: true }));
app.use("/files", createFilesRouter(io));
app.use("/reports", createReportsRouter());
app.use("/downloads", express.static(path.join(__dirname, "..", "..", "app", "release")));
app.use(express.static(path.join(__dirname, "..", "public")));

registerSocketHandlers(io);

server.listen(PORT, () => {
  console.log(`Deskop server listening on http://0.0.0.0:${PORT}`);
  console.log(`Admin code for viewing daily reports: ${ADMIN_CODE}`);
});
