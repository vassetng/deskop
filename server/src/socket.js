import crypto from "crypto";
import {
  addPresence,
  removePresence,
  getPresenceRoster,
  addMessage,
  dmKey,
  logActivity,
} from "./store.js";
import { resolveStaffFromToken } from "./auth.js";

const CONNECTION_PASSWORD = process.env.CONNECTION_PASSWORD || null;

export function registerSocketHandlers(io) {
  io.use((socket, next) => {
    if (CONNECTION_PASSWORD && socket.handshake.auth?.connectionPassword !== CONNECTION_PASSWORD) {
      return next(new Error("Invalid connection password"));
    }
    const staff = resolveStaffFromToken(socket.handshake.auth?.token);
    if (!staff) return next(new Error("Not authenticated"));
    socket.staff = staff;
    next();
  });

  io.on("connection", (socket) => {
    const staff = socket.staff;

    addPresence(socket.id, staff.id, staff.displayName);
    socket.join(`staff:${staff.id}`);
    socket.join(`dept:${staff.department}`);
    if (staff.role === "admin") socket.join("role:admin");

    io.emit("presence:roster", getPresenceRoster());
    logActivity("presence:online", { staffId: staff.id, name: staff.displayName });

    // --- Ringer: summon a staff member (targeted by staffId) ---
    socket.on("ring:send", (targetStaffId) => {
      io.to(`staff:${targetStaffId}`).emit("ring:incoming", {
        from: { id: staff.id, name: staff.displayName },
      });
      logActivity("ring:sent", { from: staff.displayName, targetStaffId });
    });

    socket.on("ring:dismiss", (targetStaffId) => {
      io.to(`staff:${targetStaffId}`).emit("ring:dismissed", {
        from: { id: staff.id, name: staff.displayName },
      });
    });

    // --- WebRTC signaling relay (1:1 calls), targeted by staffId ---
    socket.on("call:offer", ({ to, offer }) => {
      io.to(`staff:${to}`).emit("call:offer", { from: staff.id, fromName: staff.displayName, offer });
      logActivity("call:started", { from: staff.displayName, targetStaffId: to });
    });

    socket.on("call:answer", ({ to, answer }) => {
      io.to(`staff:${to}`).emit("call:answer", { from: staff.id, answer });
    });

    socket.on("call:ice", ({ to, candidate }) => {
      io.to(`staff:${to}`).emit("call:ice", { from: staff.id, candidate });
    });

    socket.on("call:hangup", ({ to }) => {
      io.to(`staff:${to}`).emit("call:hangup", { from: staff.id });
    });

    // --- Messaging: DMs + department channels ---
    socket.on("message:send", ({ kind, to, text }) => {
      if (!text || !text.trim()) return;

      if (kind === "dm") {
        const target = dmKey(staff.id, to);
        const msg = {
          id: crypto.randomUUID(),
          kind: "dm",
          target,
          fromId: staff.id,
          fromName: staff.displayName,
          text: String(text).slice(0, 4000),
          sentAt: new Date().toISOString(),
        };
        addMessage(msg);
        io.to(`staff:${staff.id}`).to(`staff:${to}`).emit("message:new", msg);
        return;
      }

      if (kind === "channel") {
        const department = to;
        if (staff.role !== "admin" && staff.department !== department) return;
        const msg = {
          id: crypto.randomUUID(),
          kind: "channel",
          target: department,
          fromId: staff.id,
          fromName: staff.displayName,
          text: String(text).slice(0, 4000),
          sentAt: new Date().toISOString(),
        };
        addMessage(msg);
        io.to(`dept:${department}`).to("role:admin").emit("message:new", msg);
      }
    });

    socket.on("disconnect", () => {
      removePresence(socket.id);
      io.emit("presence:roster", getPresenceRoster());
      logActivity("presence:offline", { staffId: staff.id, name: staff.displayName });
    });
  });
}
