import { Notice, Plugin } from "obsidian";
import { DEFAULT_SETTINGS, GDriveConfig, PluginSettings, SyncLogEntry } from "./types";
import { DogentVaultSettingTab } from "./settings-tab";
import { createBackend } from "./backends/factory";
import { buildIndex, ensureDogentScaffold, readVaultFiles, writeVaultFiles } from "./vault-io";
import { ConfirmModal } from "./confirm-modal";
import { exchangeCode, PendingAuth } from "./backends/gdrive-oauth";
import { fireWebhook } from "./webhook";

const MAX_LOG_ENTRIES = 20;

export default class DogentVaultPlugin extends Plugin {
  settings: PluginSettings = DEFAULT_SETTINGS;
  pendingGDriveAuth: PendingAuth | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();
    await this.ensureVaultId();

    this.addSettingTab(new DogentVaultSettingTab(this.app, this));

    this.addRibbonIcon("upload-cloud", "Dogent Vault: Push", () => this.runPush());
    this.addRibbonIcon("download-cloud", "Dogent Vault: Pull", () => this.runPullWithConfirm());

    this.addCommand({
      id: "dogent-vault-push",
      name: "Push vault to remote",
      callback: () => this.runPush(),
    });

    this.addCommand({
      id: "dogent-vault-pull",
      name: "Pull from remote (overwrites local)",
      callback: () => this.runPullWithConfirm(),
    });

    this.registerObsidianProtocolHandler("dogent-gdrive", async (params) => {
      const pending = this.pendingGDriveAuth;
      if (!pending) {
        new Notice("No pending Google Drive sign-in.");
        return;
      }
      if (params.error) {
        pending.reject(new Error(`OAuth error: ${params.error}`));
        this.pendingGDriveAuth = null;
        return;
      }
      if (!params.code || params.state !== pending.state) {
        pending.reject(new Error("Invalid OAuth callback"));
        this.pendingGDriveAuth = null;
        return;
      }
      try {
        const result = await exchangeCode(pending.clientId, params.code, pending.verifier);
        pending.resolve(result);
      } catch (e) {
        pending.reject(e as Error);
      } finally {
        this.pendingGDriveAuth = null;
      }
    });
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  private async ensureVaultId(): Promise<void> {
    if (!this.settings.vaultId) {
      this.settings.vaultId = generateUuid();
      await this.saveSettings();
    }
  }

  gdriveTokenSink = async (next: { accessToken: string; expiresAt: number }): Promise<void> => {
    if (this.settings.backend?.kind !== "gdrive") return;
    const cfg = this.settings.backend as GDriveConfig;
    cfg.accessToken = next.accessToken;
    cfg.expiresAt = next.expiresAt;
    await this.saveSettings();
  };

  private async runPush(): Promise<void> {
    if (!this.settings.backend) {
      new Notice("Configure a backend in settings first.");
      return;
    }
    let fileCount = 0;
    try {
      await ensureDogentScaffold(this.app);
      new Notice("Push: reading vault...");
      const files = await readVaultFiles(this.app, this.settings.excludePatterns);
      const index = buildIndex(files, this.settings.vaultId, this.app.vault.getName());
      const payload = [...files, index];
      fileCount = payload.length;

      const backend = createBackend(this.settings.backend, this.gdriveTokenSink);
      new Notice(`Push: uploading ${fileCount} files...`);
      await backend.push(payload);

      await this.recordLog({ at: Date.now(), kind: "push", fileCount, success: true });
      await this.fire("push", fileCount);
      new Notice("Push complete.");
    } catch (e) {
      console.error(e);
      await this.recordLog({
        at: Date.now(),
        kind: "push",
        fileCount,
        success: false,
        error: (e as Error).message,
      });
      new Notice(`Push failed: ${(e as Error).message}`);
    }
  }

  private runPullWithConfirm(): void {
    if (!this.settings.backend) {
      new Notice("Configure a backend in settings first.");
      return;
    }
    new ConfirmModal(
      this.app,
      {
        title: "Pull will overwrite your vault",
        message:
          "This replaces local files with what's on the remote. Files that exist locally but not on the remote will be deleted. Continue?",
        confirmText: "Pull and overwrite",
        danger: true,
      },
      () => void this.runPull()
    ).open();
  }

  private async runPull(): Promise<void> {
    let fileCount = 0;
    try {
      new Notice("Pull: downloading from remote...");
      const backend = createBackend(this.settings.backend!, this.gdriveTokenSink);
      const files = await backend.pull();
      fileCount = files.length;
      new Notice(`Pull: writing ${fileCount} files...`);
      await writeVaultFiles(this.app, files, this.settings.excludePatterns);

      await this.recordLog({ at: Date.now(), kind: "pull", fileCount, success: true });
      await this.fire("pull", fileCount);
      new Notice("Pull complete.");
    } catch (e) {
      console.error(e);
      await this.recordLog({
        at: Date.now(),
        kind: "pull",
        fileCount,
        success: false,
        error: (e as Error).message,
      });
      new Notice(`Pull failed: ${(e as Error).message}`);
    }
  }

  private async recordLog(entry: SyncLogEntry): Promise<void> {
    this.settings.log = [entry, ...this.settings.log].slice(0, MAX_LOG_ENTRIES);
    await this.saveSettings();
  }

  private async fire(event: "push" | "pull", fileCount: number): Promise<void> {
    if (!this.settings.webhook.url || !this.settings.backend) return;
    try {
      await fireWebhook(this.settings.webhook, {
        event,
        vaultId: this.settings.vaultId,
        vaultName: this.app.vault.getName(),
        backend: this.settings.backend.kind,
        fileCount,
        at: new Date().toISOString(),
      });
    } catch (e) {
      console.warn("Webhook failed:", e);
    }
  }
}

function generateUuid(): string {
  // RFC4122 v4 using crypto.getRandomValues
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
