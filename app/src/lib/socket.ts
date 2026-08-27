import { io, Socket } from "socket.io-client";
import { getServerUrl, getToken, getConnectionPassword } from "./auth";

let socket: Socket | null = null;

export function connectSocket(): Socket {
  if (socket) return socket;
  socket = io(getServerUrl(), {
    transports: ["websocket", "polling"],
    auth: {
      token: getToken(),
      connectionPassword: getConnectionPassword(),
    },
  });
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
