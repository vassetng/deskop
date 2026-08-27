import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export function getServerUrl(): string {
  return localStorage.getItem("deskop:serverUrl") || "http://localhost:4000";
}

export function setServerUrl(url: string) {
  localStorage.setItem("deskop:serverUrl", url);
}

export function connectSocket(): Socket {
  if (socket) return socket;
  socket = io(getServerUrl(), { transports: ["websocket", "polling"] });
  return socket;
}

export function getSocket(): Socket {
  if (!socket) throw new Error("Socket not connected yet");
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
