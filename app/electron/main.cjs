const { app, BrowserWindow, Notification, ipcMain } = require("electron");
const path = require("path");
const os = require("os");
const dgram = require("dgram");

const DISCOVERY_PORT = 41234;
const DISCOVERY_REQUEST = "DESKOP_DISCOVER";

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(__dirname, "..", "build", "icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Allow the renderer to request mic/camera/screen-share permissions.
  mainWindow.webContents.session.setPermissionRequestHandler((_wc, permission, callback) => {
    const allowed = ["media", "display-capture", "notifications"];
    callback(allowed.includes(permission));
  });

  if (process.env.VITE_DEV) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

ipcMain.on("notify", (_event, { title, body }) => {
  new Notification({ title, body }).show();
});

ipcMain.handle("get-os-username", () => {
  try {
    return os.userInfo().username;
  } catch {
    return null;
  }
});

ipcMain.handle("discover-servers", () => {
  return new Promise((resolve) => {
    const socket = dgram.createSocket("udp4");
    const found = new Map();

    socket.on("message", (msg, rinfo) => {
      try {
        const { name, port } = JSON.parse(msg.toString());
        found.set(`${rinfo.address}:${port}`, { name, address: rinfo.address, port });
      } catch {
        // ignore malformed replies
      }
    });

    socket.on("error", () => {
      // discovery is best-effort; failures just mean an empty result
    });

    socket.bind(() => {
      socket.setBroadcast(true);
      const message = Buffer.from(DISCOVERY_REQUEST);
      socket.send(message, DISCOVERY_PORT, "255.255.255.255");
    });

    setTimeout(() => {
      socket.close();
      resolve(Array.from(found.values()));
    }, 1500);
  });
});

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
