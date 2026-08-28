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

// Group calls use mesh WebRTC (every participant connects directly to every
// other participant) rather than an SFU — fine for a handful of people, not
// meant to scale past that, hence the cap.
const MAX_GROUP_PARTICIPANTS = 6;
// callId -> { hostId, video, participants: Map<staffId, { name }> }
const groupCalls = new Map();

// Socket.io event dispatch isn't wrapped by Express's automatic error
// handling — an uncaught throw in any handler here (a malformed payload, a
// disk write failure, anything) would otherwise crash the whole process for
// every connected user. Every handler below goes through this.
function safe(handler) {
  return (...args) => {
    try {
      handler(...args);
    } catch (err) {
      console.error("Socket handler error:", err);
    }
  };
}

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

    // --- Ringer: summon a staff member (targeted by staffId). This is a
    // lightweight "come here" nudge with an optional message, not a call —
    // the recipient just acknowledges it, they don't "answer" it.
    socket.on(
      "ring:send",
      safe(({ to, message } = {}) => {
        if (!to) return;
        io.to(`staff:${to}`).emit("ring:incoming", {
          from: { id: staff.id, name: staff.displayName },
          message: typeof message === "string" ? message.slice(0, 300) : "",
        });
        logActivity("ring:sent", { from: staff.displayName, targetStaffId: to });
      })
    );

    socket.on(
      "ring:acknowledge",
      safe((targetStaffId) => {
        if (!targetStaffId) return;
        io.to(`staff:${targetStaffId}`).emit("ring:acknowledged", {
          from: { id: staff.id, name: staff.displayName },
        });
        logActivity("ring:acknowledged", { name: staff.displayName });
      })
    );

    // --- Call ringing: a call must be explicitly accepted before any
    // WebRTC negotiation happens. invite/accept/decline/cancel are plain
    // relays with no media involved; only after "call:accept" does the
    // caller proceed to the real offer/answer/ice exchange below.
    socket.on(
      "call:invite",
      safe(({ to, video } = {}) => {
        if (!to) return;
        io.to(`staff:${to}`).emit("call:invite", {
          from: staff.id,
          fromName: staff.displayName,
          video: !!video,
        });
      })
    );

    socket.on(
      "call:accept",
      safe(({ to } = {}) => {
        if (!to) return;
        io.to(`staff:${to}`).emit("call:accept", { from: staff.id });
        logActivity("call:accepted", { name: staff.displayName });
      })
    );

    socket.on(
      "call:decline",
      safe(({ to } = {}) => {
        if (!to) return;
        io.to(`staff:${to}`).emit("call:decline", { from: staff.id });
      })
    );

    socket.on(
      "call:cancel",
      safe(({ to } = {}) => {
        if (!to) return;
        io.to(`staff:${to}`).emit("call:cancel", { from: staff.id });
      })
    );

    // --- WebRTC signaling relay (1:1 calls), targeted by staffId ---
    socket.on(
      "call:offer",
      safe(({ to, offer, video } = {}) => {
        if (!to || !offer) return;
        io.to(`staff:${to}`).emit("call:offer", {
          from: staff.id,
          fromName: staff.displayName,
          offer,
          video: !!video,
        });
        logActivity("call:started", { from: staff.displayName, targetStaffId: to });
      })
    );

    socket.on(
      "call:answer",
      safe(({ to, answer } = {}) => {
        if (!to || !answer) return;
        io.to(`staff:${to}`).emit("call:answer", { from: staff.id, answer });
      })
    );

    socket.on(
      "call:ice",
      safe(({ to, candidate } = {}) => {
        if (!to || !candidate) return;
        io.to(`staff:${to}`).emit("call:ice", { from: staff.id, candidate });
      })
    );

    socket.on(
      "call:hangup",
      safe(({ to } = {}) => {
        if (!to) return;
        io.to(`staff:${to}`).emit("call:hangup", { from: staff.id });
      })
    );

    // --- Group calls: mesh WebRTC, several staff in one call. The host's
    // "invite" creates the room (host is participant #1 immediately); each
    // invitee that accepts is told who's already in and mesh-connects to
    // each of them directly — offer/answer/ice below are the same relay
    // pattern as 1:1 calls, just scoped by callId and fanned out per-pair.
    socket.on(
      "group-call:invite",
      safe(({ participants, video } = {}) => {
        if (!Array.isArray(participants) || participants.length === 0) return;
        const targets = Array.from(new Set(participants.filter((id) => id && id !== staff.id))).slice(
          0,
          MAX_GROUP_PARTICIPANTS - 1
        );
        if (targets.length === 0) return;

        const callId = crypto.randomUUID();
        groupCalls.set(callId, {
          hostId: staff.id,
          video: !!video,
          participants: new Map([[staff.id, { name: staff.displayName }]]),
        });
        socket.join(`call:${callId}`);
        socket.emit("group-call:created", { callId, video: !!video });

        for (const to of targets) {
          io.to(`staff:${to}`).emit("group-call:invite", {
            callId,
            from: staff.id,
            fromName: staff.displayName,
            video: !!video,
          });
        }
        logActivity("group-call:started", { from: staff.displayName, count: targets.length });
      })
    );

    socket.on(
      "group-call:accept",
      safe(({ callId } = {}) => {
        const call = groupCalls.get(callId);
        if (!call) return;
        if (call.participants.size >= MAX_GROUP_PARTICIPANTS) {
          io.to(`staff:${call.hostId}`).emit("group-call:declined", {
            callId,
            from: staff.id,
            fromName: staff.displayName,
            reason: "full",
          });
          return;
        }
        const existing = Array.from(call.participants, ([id, v]) => ({ id, name: v.name }));
        call.participants.set(staff.id, { name: staff.displayName });
        socket.join(`call:${callId}`);
        socket.emit("group-call:joined", { callId, video: call.video, participants: existing });
        logActivity("call:accepted", { name: staff.displayName });
        socket.to(`call:${callId}`).emit("group-call:peer-joined", {
          callId,
          peer: { id: staff.id, name: staff.displayName },
        });
      })
    );

    socket.on(
      "group-call:decline",
      safe(({ callId } = {}) => {
        const call = groupCalls.get(callId);
        if (!call) return;
        io.to(`staff:${call.hostId}`).emit("group-call:declined", {
          callId,
          from: staff.id,
          fromName: staff.displayName,
        });
      })
    );

    socket.on(
      "group-call:offer",
      safe(({ callId, to, offer, video } = {}) => {
        if (!callId || !to || !offer) return;
        io.to(`staff:${to}`).emit("group-call:offer", { callId, from: staff.id, offer, video: !!video });
      })
    );

    socket.on(
      "group-call:answer",
      safe(({ callId, to, answer } = {}) => {
        if (!callId || !to || !answer) return;
        io.to(`staff:${to}`).emit("group-call:answer", { callId, from: staff.id, answer });
      })
    );

    socket.on(
      "group-call:ice",
      safe(({ callId, to, candidate } = {}) => {
        if (!callId || !to || !candidate) return;
        io.to(`staff:${to}`).emit("group-call:ice", { callId, from: staff.id, candidate });
      })
    );

    function leaveGroupCall(callId) {
      const call = groupCalls.get(callId);
      if (!call || !call.participants.has(staff.id)) return;
      call.participants.delete(staff.id);
      socket.leave(`call:${callId}`);
      socket.to(`call:${callId}`).emit("group-call:peer-left", { callId, from: staff.id });
      if (call.participants.size === 0) groupCalls.delete(callId);
    }

    socket.on(
      "group-call:leave",
      safe(({ callId } = {}) => {
        if (!callId) return;
        leaveGroupCall(callId);
      })
    );

    // --- Messaging: DMs + department channels ---
    socket.on(
      "message:send",
      safe(({ kind, to, text, attachment } = {}) => {
        const hasText = text && text.trim();
        const validAttachment =
          attachment &&
          typeof attachment.storedName === "string" &&
          typeof attachment.originalName === "string" &&
          typeof attachment.size === "number"
            ? {
                storedName: attachment.storedName,
                originalName: String(attachment.originalName).slice(0, 255),
                size: attachment.size,
              }
            : null;
        if ((!hasText && !validAttachment) || !to) return;

        if (kind === "dm") {
          const target = dmKey(staff.id, to);
          const msg = {
            id: crypto.randomUUID(),
            kind: "dm",
            target,
            fromId: staff.id,
            fromName: staff.displayName,
            text: hasText ? String(text).slice(0, 4000) : "",
            attachment: validAttachment,
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
            text: hasText ? String(text).slice(0, 4000) : "",
            attachment: validAttachment,
            sentAt: new Date().toISOString(),
          };
          addMessage(msg);
          io.to(`dept:${department}`).to("role:admin").emit("message:new", msg);
        }
      })
    );

    socket.on(
      "disconnect",
      safe(() => {
        removePresence(socket.id);
        io.emit("presence:roster", getPresenceRoster());
        logActivity("presence:offline", { staffId: staff.id, name: staff.displayName });
        for (const callId of Array.from(groupCalls.keys())) leaveGroupCall(callId);
      })
    );
  });
}
