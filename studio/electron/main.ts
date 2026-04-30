import { app, BrowserWindow, ipcMain, dialog, safeStorage } from "electron";
import path from "path";
import fs from "fs";
import { runClaude, AnthropicMessage } from "./claude";
import { runShell } from "./shell";
import { downloadVault } from "./vault-download";
import type { ProjectStore, ProjectRecord } from "../shared/project";

const STORE_PATH = path.join(app.getPath("userData"), "projects.json");
const SECRETS_PATH = path.join(app.getPath("userData"), "secrets.bin");

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      // preload sits next to main.js in dist/electron/electron/
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (process.env.NODE_ENV === "development") {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(path.join(__dirname, "../../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

function loadProjects(): ProjectStore {
  if (!fs.existsSync(STORE_PATH)) return { projects: [] };
  try {
    return JSON.parse(fs.readFileSync(STORE_PATH, "utf-8"));
  } catch {
    return { projects: [] };
  }
}

function saveProjects(store: ProjectStore): void {
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

function loadSecrets(): Record<string, string> {
  if (!fs.existsSync(SECRETS_PATH)) return {};
  try {
    const buf = fs.readFileSync(SECRETS_PATH);
    if (safeStorage.isEncryptionAvailable()) {
      return JSON.parse(safeStorage.decryptString(buf));
    }
    return JSON.parse(buf.toString("utf-8"));
  } catch {
    return {};
  }
}

function saveSecrets(secrets: Record<string, string>): void {
  const json = JSON.stringify(secrets);
  if (safeStorage.isEncryptionAvailable()) {
    fs.writeFileSync(SECRETS_PATH, safeStorage.encryptString(json));
  } else {
    fs.writeFileSync(SECRETS_PATH, json);
  }
}

function registerIpc(): void {
  ipcMain.handle("projects:list", () => loadProjects());

  ipcMain.handle("projects:save", (_e, store: ProjectStore) => {
    saveProjects(store);
    return store;
  });

  ipcMain.handle("projects:upsert", (_e, project: ProjectRecord) => {
    const store = loadProjects();
    const idx = store.projects.findIndex((p) => p.id === project.id);
    if (idx >= 0) store.projects[idx] = project;
    else store.projects.push(project);
    saveProjects(store);
    return store;
  });

  ipcMain.handle("projects:delete", (_e, id: string) => {
    const store = loadProjects();
    store.projects = store.projects.filter((p) => p.id !== id);
    saveProjects(store);
    return store;
  });

  ipcMain.handle("secrets:get", () => loadSecrets());
  ipcMain.handle("secrets:set", (_e, secrets: Record<string, string>) => {
    saveSecrets(secrets);
    return secrets;
  });

  ipcMain.handle("dialog:pickDirectory", async () => {
    const res = await dialog.showOpenDialog({ properties: ["openDirectory", "createDirectory"] });
    return res.canceled ? null : res.filePaths[0];
  });

  ipcMain.handle("vault:download", async (_e, project: ProjectRecord) => {
    return await downloadVault(project);
  });

  ipcMain.handle("claude:run", async (e, opts: { apiKey: string; messages: AnthropicMessage[]; system: string; model: string; cwd: string }) => {
    const onChunk = (chunk: string): void => {
      e.sender.send("claude:chunk", chunk);
    };
    return await runClaude(opts, onChunk);
  });

  ipcMain.handle("shell:run", async (e, opts: { cwd: string; command: string; args: string[] }) => {
    return await runShell(opts, (line) => e.sender.send("shell:line", line));
  });

  ipcMain.handle("fs:readDir", (_e, dir: string) => {
    if (!fs.existsSync(dir)) return [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    return entries.map((d) => ({ name: d.name, isDirectory: d.isDirectory() }));
  });

  ipcMain.handle("fs:readFile", (_e, p: string) => {
    if (!fs.existsSync(p)) return null;
    return fs.readFileSync(p, "utf-8");
  });
}
