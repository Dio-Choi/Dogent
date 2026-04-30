import { requestUrl, RequestUrlParam } from "obsidian";
import { FileEntry, GDriveConfig, StorageBackend } from "../types";
import { refreshAccessToken } from "./gdrive-oauth";

const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";

export interface GDriveTokenSink {
  (next: { accessToken: string; expiresAt: number }): Promise<void>;
}

export class GDriveBackend implements StorageBackend {
  readonly kind = "gdrive" as const;

  constructor(private config: GDriveConfig, private onTokenRefresh: GDriveTokenSink) {}

  async push(files: FileEntry[]): Promise<void> {
    if (!this.config.folderId) throw new Error("No Drive folder selected");
    const existing = await this.listAll(this.config.folderId);
    const incomingPaths = new Set(files.map((f) => f.path));

    for (const f of files) {
      const existingId = existing.byPath.get(f.path);
      if (existingId) {
        await this.updateFile(existingId, f.data);
      } else {
        const parentId = await this.ensurePath(f.path, existing);
        const name = baseName(f.path);
        await this.createFile(parentId, name, f.data, existing, f.path);
      }
    }

    for (const [path, id] of existing.byPath) {
      if (!incomingPaths.has(path)) {
        await this.deleteFile(id);
      }
    }
    for (const [path, id] of existing.foldersByPath) {
      if (path === "") continue;
      const stillNeeded = [...incomingPaths].some((p) => p.startsWith(path + "/"));
      if (!stillNeeded) {
        await this.deleteFile(id).catch(() => {});
      }
    }
  }

  async pull(): Promise<FileEntry[]> {
    if (!this.config.folderId) throw new Error("No Drive folder selected");
    const existing = await this.listAll(this.config.folderId);
    const out: FileEntry[] = [];
    for (const [path, id] of existing.byPath) {
      const data = await this.downloadFile(id);
      out.push({ path, data });
    }
    return out;
  }

  private async listAll(rootId: string): Promise<DriveListing> {
    const byPath = new Map<string, string>();
    const foldersByPath = new Map<string, string>();
    foldersByPath.set("", rootId);

    const walk = async (folderId: string, prefix: string): Promise<void> => {
      let pageToken: string | undefined;
      do {
        const params = new URLSearchParams({
          q: `'${folderId}' in parents and trashed=false`,
          fields: "nextPageToken,files(id,name,mimeType)",
          pageSize: "1000",
        });
        if (pageToken) params.set("pageToken", pageToken);
        const res = await this.api({ url: `${API}/files?${params}`, method: "GET" });
        const j = res.json as { nextPageToken?: string; files: DriveFile[] };
        for (const f of j.files) {
          const path = prefix ? `${prefix}/${f.name}` : f.name;
          if (f.mimeType === "application/vnd.google-apps.folder") {
            foldersByPath.set(path, f.id);
            await walk(f.id, path);
          } else {
            byPath.set(path, f.id);
          }
        }
        pageToken = j.nextPageToken;
      } while (pageToken);
    };

    await walk(rootId, "");
    return { byPath, foldersByPath };
  }

  private async ensurePath(filePath: string, existing: DriveListing): Promise<string> {
    const parts = filePath.split("/");
    parts.pop();
    let parentPath = "";
    let parentId = existing.foldersByPath.get("")!;
    for (const part of parts) {
      const next = parentPath ? `${parentPath}/${part}` : part;
      let id = existing.foldersByPath.get(next);
      if (!id) {
        id = await this.createFolder(parentId, part);
        existing.foldersByPath.set(next, id);
      }
      parentId = id;
      parentPath = next;
    }
    return parentId;
  }

  private async createFolder(parentId: string, name: string): Promise<string> {
    const res = await this.api({
      url: `${API}/files?fields=id`,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        mimeType: "application/vnd.google-apps.folder",
        parents: [parentId],
      }),
    });
    return (res.json as { id: string }).id;
  }

  private async createFile(
    parentId: string,
    name: string,
    data: ArrayBuffer,
    existing: DriveListing,
    path: string
  ): Promise<void> {
    const boundary = "----dogent" + Math.random().toString(36).slice(2);
    const meta = JSON.stringify({ name, parents: [parentId] });
    const body = buildMultipart(boundary, meta, data);
    const res = await this.api({
      url: `${UPLOAD}/files?uploadType=multipart&fields=id`,
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    });
    const id = (res.json as { id: string }).id;
    existing.byPath.set(path, id);
  }

  private async updateFile(id: string, data: ArrayBuffer): Promise<void> {
    await this.api({
      url: `${UPLOAD}/files/${id}?uploadType=media`,
      method: "PATCH",
      headers: { "Content-Type": "application/octet-stream" },
      body: data,
    });
  }

  private async downloadFile(id: string): Promise<ArrayBuffer> {
    const res = await this.api({
      url: `${API}/files/${id}?alt=media`,
      method: "GET",
    });
    return res.arrayBuffer;
  }

  private async deleteFile(id: string): Promise<void> {
    await this.api({ url: `${API}/files/${id}`, method: "DELETE" });
  }

  async createSyncFolder(name: string): Promise<{ id: string; name: string }> {
    const res = await this.api({
      url: `${API}/files?fields=id,name`,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder" }),
    });
    const j = res.json as { id: string; name: string };
    return { id: j.id, name: j.name };
  }

  async listAppFolders(): Promise<{ id: string; name: string }[]> {
    const params = new URLSearchParams({
      q: "mimeType='application/vnd.google-apps.folder' and trashed=false",
      fields: "files(id,name)",
      pageSize: "100",
    });
    const res = await this.api({ url: `${API}/files?${params}`, method: "GET" });
    return (res.json as { files: { id: string; name: string }[] }).files;
  }

  private async api(req: RequestUrlParam): Promise<{ status: number; json: unknown; arrayBuffer: ArrayBuffer; text: string }> {
    await this.ensureFreshToken();
    const headers = { ...(req.headers ?? {}), Authorization: `Bearer ${this.config.accessToken}` };
    const res = await requestUrl({ ...req, headers, throw: false });
    if (res.status === 401) {
      await this.forceRefresh();
      const headers2 = { ...(req.headers ?? {}), Authorization: `Bearer ${this.config.accessToken}` };
      const res2 = await requestUrl({ ...req, headers: headers2, throw: false });
      if (res2.status >= 400) throw new Error(`Drive API ${res2.status}: ${res2.text}`);
      return res2;
    }
    if (res.status >= 400) throw new Error(`Drive API ${res.status}: ${res.text}`);
    return res;
  }

  private async ensureFreshToken(): Promise<void> {
    if (this.config.expiresAt - 60_000 > Date.now()) return;
    await this.forceRefresh();
  }

  private async forceRefresh(): Promise<void> {
    const fresh = await refreshAccessToken(this.config.clientId, this.config.refreshToken);
    this.config.accessToken = fresh.accessToken;
    this.config.expiresAt = fresh.expiresAt;
    await this.onTokenRefresh(fresh);
  }
}

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
}

interface DriveListing {
  byPath: Map<string, string>;
  foldersByPath: Map<string, string>;
}

function baseName(path: string): string {
  const i = path.lastIndexOf("/");
  return i >= 0 ? path.slice(i + 1) : path;
}

function buildMultipart(boundary: string, metaJson: string, data: ArrayBuffer): ArrayBuffer {
  const enc = new TextEncoder();
  const head = enc.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metaJson}\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`
  );
  const tail = enc.encode(`\r\n--${boundary}--`);
  const out = new Uint8Array(head.byteLength + data.byteLength + tail.byteLength);
  out.set(head, 0);
  out.set(new Uint8Array(data), head.byteLength);
  out.set(tail, head.byteLength + data.byteLength);
  return out.buffer;
}
