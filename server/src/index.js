import express from "express";
import cors from "cors";
import http from "http";
import fs from "fs";
import { Server } from "socket.io";
import { createFilesRouter } from "./files.js";
import { createReportsRouter } from "./reports.js";
import { createAuthRouter } from "./auth.js";
import { createDepartmentsRouter } from "./departments.js";
import { createMessagesRouter } from "./messages.js";
import { createAdminRouter } from "./admin.js";
import { registerSocketHandlers } from "./socket.js";
import { ensureBootstrapAdmin } from "./store.js";
import { getLanAddresses, startDiscoveryResponder } from "./discovery.js";
import { serverPath, isPackaged } from "./paths.js";

const PORT = process.env.PORT || 4000;

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.get("/health", (_req, res) => res.json({ ok: true }));
app.use("/auth", createAuthRouter());
app.use("/departments", createDepartmentsRouter());
app.use("/messages", createMessagesRouter());
app.use("/admin", createAdminRouter());
app.use("/files", createFilesRouter(io));
app.use("/reports", createReportsRouter());

const downloadsDir = serverPath("..", "app", "release");
if (fs.existsSync(downloadsDir)) {
  app.use("/downloads", express.static(downloadsDir));
}

const publicDir = serverPath("public");
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
} else if (isPackaged) {
  console.warn(`No public/ folder found next to the .exe — the landing page won't be served.`);
}

registerSocketHandlers(io);

const bootstrapAdmin = ensureBootstrapAdmin();

server.listen(PORT, () => {
  console.log(`Deskop server listening on http://0.0.0.0:${PORT}`);
  const lanAddresses = getLanAddresses();
  if (lanAddresses.length > 0) {
    console.log(`Staff on the same network can connect at:`);
    for (const addr of lanAddresses) console.log(`  http://${addr}:${PORT}`);
    console.log(`(The desktop app auto-discovers this — staff on the same WiFi/LAN just click "Join".)`);
  }
  if (bootstrapAdmin) {
    console.log(`No staff accounts found — created a default admin login:`);
    console.log(`  username: ${bootstrapAdmin.username}`);
    console.log(`  password: ${bootstrapAdmin.password}`);
    console.log(`Change this after first login.`);
  }
  if (process.env.CONNECTION_PASSWORD) {
    console.log(`Connection password is required for all clients.`);
  }
});

try {
  startDiscoveryResponder(PORT, "Deskop Office Server");
} catch (err) {
  console.warn(`Could not start LAN discovery responder: ${err.message}`);
}
