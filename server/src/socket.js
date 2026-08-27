import { addStaff, removeStaff, getRoster, findStaff } from "./store.js";

export function registerSocketHandlers(io) {
  io.on("connection", (socket) => {
    socket.on("presence:join", (name) => {
      addStaff(socket.id, String(name || "Unnamed").slice(0, 60));
      io.emit("presence:roster", getRoster());
    });

    // --- Ringer: summon a staff member ---
    socket.on("ring:send", (targetId) => {
      const from = findStaff(socket.id);
      if (!from) return;
      io.to(targetId).emit("ring:incoming", { from });
    });

    socket.on("ring:dismiss", (targetId) => {
      io.to(targetId).emit("ring:dismissed", { from: findStaff(socket.id) });
    });

    // --- WebRTC signaling relay (1:1 calls) ---
    socket.on("call:offer", ({ to, offer }) => {
      io.to(to).emit("call:offer", { from: socket.id, offer });
    });

    socket.on("call:answer", ({ to, answer }) => {
      io.to(to).emit("call:answer", { from: socket.id, answer });
    });

    socket.on("call:ice", ({ to, candidate }) => {
      io.to(to).emit("call:ice", { from: socket.id, candidate });
    });

    socket.on("call:hangup", ({ to }) => {
      io.to(to).emit("call:hangup", { from: socket.id });
    });

    socket.on("disconnect", () => {
      removeStaff(socket.id);
      io.emit("presence:roster", getRoster());
    });
  });
}
