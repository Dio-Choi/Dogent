import { App, TFile, normalizePath } from "obsidian";
import { DogentIndex, FileEntry, INDEX_FILENAME } from "./types";

export async function readVaultFiles(app: App, exclude: string[]): Promise<FileEntry[]> {
  const files = app.vault.getFiles();
  const entries: FileEntry[] = [];
  for (const f of files) {
    if (isExcluded(f.path, exclude)) continue;
    const data = await app.vault.adapter.readBinary(f.path);
    entries.push({ path: f.path, data });
  }
  return entries;
}

export async function writeVaultFiles(app: App, entries: FileEntry[], exclude: string[]): Promise<void> {
  const incoming = new Set(
    entries.map((e) => normalizePath(e.path)).filter((p) => p !== INDEX_FILENAME)
  );

  const existing = app.vault.getFiles();
  for (const f of existing) {
    if (isExcluded(f.path, exclude)) continue;
    if (!incoming.has(normalizePath(f.path))) {
      await app.vault.delete(f as TFile);
    }
  }

  for (const e of entries) {
    const path = normalizePath(e.path);
    if (path === INDEX_FILENAME) continue;
    await ensureParent(app, path);
    await app.vault.adapter.writeBinary(path, e.data);
  }
}

export async function ensureDogentScaffold(app: App): Promise<void> {
  const adapter = app.vault.adapter;
  if (!(await adapter.exists(".dogent"))) {
    await adapter.mkdir(".dogent");
  }
  const configPath = ".dogent/config.yaml";
  if (!(await adapter.exists(configPath))) {
    await adapter.write(configPath, DEFAULT_DOGENT_CONFIG);
  }
  const readmePath = ".dogent/README.md";
  if (!(await adapter.exists(readmePath))) {
    await adapter.write(readmePath, DOGENT_FOLDER_README);
  }
}

export function buildIndex(
  files: FileEntry[],
  vaultId: string,
  vaultName: string
): FileEntry {
  const fileList = files
    .filter((f) => f.path !== INDEX_FILENAME)
    .map((f) => ({ path: f.path, size: f.data.byteLength }))
    .sort((a, b) => (a.path < b.path ? -1 : 1));

  const totalBytes = fileList.reduce((s, f) => s + f.size, 0);

  const index: DogentIndex = {
    schema: "dogent.index/v1",
    vaultId,
    vaultName,
    pushedAt: new Date().toISOString(),
    pushedBy: "dogent-vault",
    fileCount: fileList.length,
    totalBytes,
    files: fileList,
  };

  const json = JSON.stringify(index, null, 2);
  const data = new TextEncoder().encode(json);
  return { path: INDEX_FILENAME, data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) };
}

async function ensureParent(app: App, path: string): Promise<void> {
  const idx = path.lastIndexOf("/");
  if (idx <= 0) return;
  const dir = path.slice(0, idx);
  if (!(await app.vault.adapter.exists(dir))) {
    await app.vault.adapter.mkdir(dir);
  }
}

function isExcluded(path: string, patterns: string[]): boolean {
  for (const p of patterns) {
    if (matchGlob(path, p)) return true;
  }
  return false;
}

function matchGlob(path: string, pattern: string): boolean {
  const re = new RegExp(
    "^" +
      pattern
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*\*/g, ".+")
        .replace(/\*/g, "[^/]*") +
      "$"
  );
  return re.test(path);
}

const DEFAULT_DOGENT_CONFIG = `# Dogent project configuration
# This file is read by Dogent Studio / Engine.
# Edit values to match your project.

project:
  name: ""
  description: ""

ai:
  # Pick the model used for code generation. Studio resolves credentials from its own settings.
  model: "claude-sonnet-4-6"

deploy:
  # Where to publish builds. Leave empty to skip auto-deploy.
  target: ""

triggers:
  # When the vault is pushed, automatically run the engine.
  onPush: false
`;

const DOGENT_FOLDER_README = `# .dogent/

This folder is managed by Dogent. It carries project-level configuration
that travels with the vault on every sync.

- \`config.yaml\` — project settings read by Dogent Studio / Engine
- (future) \`runs/\` — execution history written back by the engine

You can edit \`config.yaml\` freely. Do not delete this folder unless you
no longer want this vault to be a Dogent project.
`;
