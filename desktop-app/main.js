/**
 * Electron shell for the Itinerary Builder.
 *
 * Production layout (inside the .app bundle):
 *   Contents/Resources/server/   — Next.js standalone build (server.js, .next, public, node_modules)
 *   Contents/Resources/seed/     — first-run data: library.db and starter uploads
 *
 * Writable data lives in app.getPath("userData"):
 *   library.db, uploads/, config.json ({ anthropicApiKey })
 *
 * Dev mode: ELECTRON_START_URL=http://localhost:3010 electron desktop-app
 * (no child server is spawned; the next dev server is used instead).
 */
const { app, BrowserWindow, Menu, ipcMain, utilityProcess, shell, dialog } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");

const DEV_URL = process.env.ELECTRON_START_URL || null;
const BASE_PORT = 4517;

let mainWindow = null;
let settingsWindow = null;
let serverProc = null;
let serverPort = BASE_PORT;

const userData = () => app.getPath("userData");
const configPath = () => path.join(userData(), "config.json");
const dbPath = () => path.join(userData(), "library.db");
const uploadsDir = () => path.join(userData(), "uploads");

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(configPath(), "utf8"));
  } catch {
    return {};
  }
}

function writeConfig(patch) {
  const next = { ...readConfig(), ...patch };
  fs.mkdirSync(userData(), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(next, null, 2));
  return next;
}

/** Copy seed data (library DB, starter uploads) to userData on first run. */
function seedUserData() {
  const seedDir = path.join(process.resourcesPath, "seed");
  fs.mkdirSync(uploadsDir(), { recursive: true });
  if (!fs.existsSync(dbPath())) {
    const seedDb = path.join(seedDir, "library.db");
    if (fs.existsSync(seedDb)) fs.copyFileSync(seedDb, dbPath());
  }
  const seedUploads = path.join(seedDir, "uploads");
  if (fs.existsSync(seedUploads)) {
    for (const f of fs.readdirSync(seedUploads)) {
      const dest = path.join(uploadsDir(), f);
      if (!fs.existsSync(dest)) fs.copyFileSync(path.join(seedUploads, f), dest);
    }
  }
}

function findFreePort(start) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(findFreePort(start + 1)));
    srv.listen(start, "127.0.0.1", () => {
      srv.close(() => resolve(start));
    });
  });
}

function startServer() {
  const serverDir = path.join(process.resourcesPath, "server");
  serverProc = utilityProcess.fork(path.join(serverDir, "server.js"), [], {
    cwd: serverDir,
    stdio: "pipe",
    env: {
      NODE_ENV: "production",
      PORT: String(serverPort),
      HOSTNAME: "127.0.0.1",
      ITINERARY_DB_PATH: dbPath(),
      ITB_UPLOADS_DIR: uploadsDir(),
      ITB_CONFIG_PATH: configPath(),
    },
  });
  serverProc.stdout?.on("data", (d) => console.log(`[server] ${d}`));
  serverProc.stderr?.on("data", (d) => console.error(`[server] ${d}`));
  serverProc.on("exit", (code) => {
    console.log(`[server] exited with ${code}`);
    serverProc = null;
  });
}

function waitForServer(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => {
        if (Date.now() > deadline) reject(new Error("Server did not start in time."));
        else setTimeout(tick, 250);
      });
      req.setTimeout(2000, () => req.destroy(new Error("timeout")));
    };
    tick();
  });
}

function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1000,
    minHeight: 640,
    title: "Itinerary Builder",
    backgroundColor: "#fbfaf6",
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  // External links (Google Maps, hotel sites) open in the real browser.
  mainWindow.webContents.setWindowOpenHandler(({ url: ext }) => {
    if (/^https?:\/\/(localhost|127\.0\.0\.1)/.test(ext)) return { action: "allow" };
    shell.openExternal(ext);
    return { action: "deny" };
  });
  mainWindow.on("closed", () => (mainWindow = null));
  mainWindow.loadURL(url);
}

function openSettings() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }
  settingsWindow = new BrowserWindow({
    width: 520,
    height: 360,
    resizable: false,
    title: "Claude API Key",
    parent: mainWindow ?? undefined,
    modal: false,
    backgroundColor: "#fbfaf6",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "settings-preload.js"),
    },
  });
  settingsWindow.setMenuBarVisibility(false);
  settingsWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  settingsWindow.loadFile(path.join(__dirname, "settings.html"));
  settingsWindow.on("closed", () => (settingsWindow = null));
}

function buildMenu() {
  const template = [
    {
      label: app.name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        { label: "Claude API Key…", accelerator: "Cmd+,", click: openSettings },
        {
          label: "Open Data Folder",
          click: () => shell.openPath(userData()),
        },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    { role: "windowMenu" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// --- IPC for the settings window ---------------------------------------------
ipcMain.handle("get-api-key", () => readConfig().anthropicApiKey ?? "");
ipcMain.handle("save-api-key", (_e, key) => {
  writeConfig({ anthropicApiKey: String(key ?? "").trim() });
  return true;
});

// --- App lifecycle ------------------------------------------------------------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    buildMenu();
    try {
      let url;
      if (DEV_URL) {
        url = DEV_URL;
      } else {
        seedUserData();
        serverPort = await findFreePort(BASE_PORT);
        startServer();
        url = `http://127.0.0.1:${serverPort}`;
        await waitForServer(url);
      }
      createWindow(url);
      // Nudge to set the API key on first launch so Claude features work.
      if (!DEV_URL && !readConfig().anthropicApiKey) {
        setTimeout(openSettings, 1200);
      }
    } catch (err) {
      dialog.showErrorBox("Itinerary Builder", `Could not start the app server.\n\n${err.message}`);
      app.quit();
    }
  });

  app.on("activate", () => {
    if (mainWindow === null && serverProc) {
      createWindow(`http://127.0.0.1:${serverPort}`);
    }
  });

  app.on("window-all-closed", () => {
    // Standard Mac behavior: keep running until Cmd+Q.
    if (process.platform !== "darwin") app.quit();
  });

  app.on("before-quit", () => {
    serverProc?.kill();
  });
}
