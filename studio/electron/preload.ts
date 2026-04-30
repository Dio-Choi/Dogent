import { contextBridge, ipcRenderer } from "electron";
import type { ProjectStore, ProjectRecord } from "../shared/project";

const api = {
  projects: {
    list: (): Promise<ProjectStore> => ipcRenderer.invoke("projects:list"),
    save: (store: ProjectStore): Promise<ProjectStore> => ipcRenderer.invoke("projects:save", store),
    upsert: (p: ProjectRecord): Promise<ProjectStore> => ipcRenderer.invoke("projects:upsert", p),
    delete: (id: string): Promise<ProjectStore> => ipcRenderer.invoke("projects:delete", id),
  },
  secrets: {
    get: (): Promise<Record<string, string>> => ipcRenderer.invoke("secrets:get"),
    set: (s: Record<string, string>): Promise<Record<string, string>> => ipcRenderer.invoke("secrets:set", s),
  },
  dialog: {
    pickDirectory: (): Promise<string | null> => ipcRenderer.invoke("dialog:pickDirectory"),
  },
  vault: {
    download: (p: ProjectRecord): Promise<{ fileCount: number; localPath: string }> =>
      ipcRenderer.invoke("vault:download", p),
  },
  claude: {
    run: (opts: {
      apiKey: string;
      messages: { role: "user" | "assistant"; content: string }[];
      system: string;
      model: string;
      cwd: string;
    }): Promise<{ text: string }> => ipcRenderer.invoke("claude:run", opts),
    onChunk: (cb: (chunk: string) => void): (() => void) => {
      const listener = (_: unknown, chunk: string): void => cb(chunk);
      ipcRenderer.on("claude:chunk", listener);
      return () => ipcRenderer.removeListener("claude:chunk", listener);
    },
  },
  shell: {
    run: (opts: { cwd: string; command: string; args: string[] }): Promise<{ exitCode: number }> =>
      ipcRenderer.invoke("shell:run", opts),
    onLine: (cb: (line: string) => void): (() => void) => {
      const listener = (_: unknown, line: string): void => cb(line);
      ipcRenderer.on("shell:line", listener);
      return () => ipcRenderer.removeListener("shell:line", listener);
    },
  },
  fs: {
    readDir: (dir: string): Promise<{ name: string; isDirectory: boolean }[]> =>
      ipcRenderer.invoke("fs:readDir", dir),
    readFile: (p: string): Promise<string | null> => ipcRenderer.invoke("fs:readFile", p),
  },
};

contextBridge.exposeInMainWorld("dogent", api);

export type DogentApi = typeof api;
