const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("itb", {
  getApiKey: () => ipcRenderer.invoke("get-api-key"),
  saveApiKey: (key) => ipcRenderer.invoke("save-api-key", key),
});
