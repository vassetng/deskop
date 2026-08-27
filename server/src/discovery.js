import dgram from "dgram";
import os from "os";

export const DISCOVERY_PORT = 41234;
const DISCOVERY_REQUEST = "DESKOP_DISCOVER";

export function getLanAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries || []) {
      if (entry.family === "IPv4" && !entry.internal) {
        addresses.push(entry.address);
      }
    }
  }
  return addresses;
}

export function startDiscoveryResponder(port, name) {
  const socket = dgram.createSocket("udp4");

  socket.on("message", (msg, rinfo) => {
    if (msg.toString() !== DISCOVERY_REQUEST) return;
    const reply = Buffer.from(JSON.stringify({ name, port }));
    socket.send(reply, rinfo.port, rinfo.address);
  });

  socket.on("error", (err) => {
    console.warn(`Discovery responder error: ${err.message}`);
  });

  socket.bind(DISCOVERY_PORT, () => {
    socket.setBroadcast(true);
  });

  return socket;
}
