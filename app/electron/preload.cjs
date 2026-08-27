const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("deskop", {
  notify: (title, body) => ipcRenderer.send("notify", { title, body }),
});
