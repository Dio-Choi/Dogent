export type BackendKind = "s3" | "git" | "gdrive";

export interface FileEntry {
  path: string;
  data: ArrayBuffer;
}

export interface StorageBackend {
  readonly kind: BackendKind;
  push(files: FileEntry[]): Promise<void>;
  pull(): Promise<FileEntry[]>;
}

export const DOGENT_VAULT_SUBDIR = "vault";

export interface S3Config {
  kind: "s3";
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  bucket: string;
  endpoint?: string;
}

export interface GitConfig {
  kind: "git";
  repoUrl: string;
  branch: string;
  token: string;
  authorName: string;
  authorEmail: string;
}

export interface GDriveConfig {
  kind: "gdrive";
  clientId: string;
  folderId: string;
  folderName: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export type BackendConfig = S3Config | GitConfig | GDriveConfig;

export interface SyncLogEntry {
  at: number;
  kind: "push" | "pull";
  fileCount: number;
  success: boolean;
  error?: string;
}

export interface WebhookSettings {
  url: string;
  secret: string;
}

export interface PluginSettings {
  vaultId: string;
  backend: BackendConfig | null;
  excludePatterns: string[];
  webhook: WebhookSettings;
  log: SyncLogEntry[];
}

export const DEFAULT_SETTINGS: PluginSettings = {
  vaultId: "",
  backend: null,
  excludePatterns: [
    ".obsidian/workspace.json",
    ".obsidian/workspace-mobile.json",
    ".obsidian/cache",
    ".trash/**",
  ],
  webhook: { url: "", secret: "" },
  log: [],
};

export interface DogentIndex {
  schema: "dogent.index/v1";
  vaultId: string;
  vaultName: string;
  pushedAt: string;
  pushedBy: string;
  fileCount: number;
  totalBytes: number;
  files: { path: string; size: number }[];
}

export const INDEX_FILENAME = ".dogent-index.json";
