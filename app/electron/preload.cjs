const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("deskop", {
  notify: (title, body) => ipcRenderer.send("notify", { title, body }),
  getOsUsername: () => ipcRenderer.invoke("get-os-username"),
  discoverServers: () => ipcRenderer.invoke("discover-servers"),
  getScreenSources: () => ipcRenderer.invoke("get-screen-sources"),
});
