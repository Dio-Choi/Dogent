import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type DogentVaultPlugin from "./main";
import { BackendKind, GDriveConfig, GitConfig, S3Config } from "./types";
import {
  buildAuthUrl,
  generateState,
  generateVerifier,
  OAuthResult,
} from "./backends/gdrive-oauth";
import { GDriveBackend } from "./backends/gdrive";

export class DogentVaultSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: DogentVaultPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Dogent Vault" });

    new Setting(containerEl)
      .setName("Vault ID")
      .setDesc("Stable identifier for this vault. Used by Dogent Studio to track the project.")
      .addText((t) => {
        t.setValue(this.plugin.settings.vaultId);
        t.setDisabled(true);
      });

    const current = this.plugin.settings.backend?.kind ?? "none";

    new Setting(containerEl)
      .setName("Backend")
      .setDesc("Choose where to sync your vault.")
      .addDropdown((d) => {
        d.addOption("none", "Not configured");
        d.addOption("s3", "Amazon S3 (or compatible)");
        d.addOption("git", "Git");
        d.addOption("gdrive", "Google Drive");
        d.setValue(current);
        d.onChange(async (v) => {
          if (v === "none") {
            this.plugin.settings.backend = null;
          } else if (v === "s3" && this.plugin.settings.backend?.kind !== "s3") {
            this.plugin.settings.backend = blankS3();
          } else if (v === "git" && this.plugin.settings.backend?.kind !== "git") {
            this.plugin.settings.backend = blankGit();
          } else if (v === "gdrive" && this.plugin.settings.backend?.kind !== "gdrive") {
            this.plugin.settings.backend = blankGDrive();
          }
          await this.plugin.saveSettings();
          this.display();
        });
      });

    if (this.plugin.settings.backend?.kind === "s3") {
      this.renderS3(containerEl, this.plugin.settings.backend);
    } else if (this.plugin.settings.backend?.kind === "git") {
      this.renderGit(containerEl, this.plugin.settings.backend);
    } else if (this.plugin.settings.backend?.kind === "gdrive") {
      this.renderGDrive(containerEl, this.plugin.settings.backend);
    }

    this.renderWebhook(containerEl);
    this.renderLog(containerEl);
  }

  private renderWebhook(el: HTMLElement): void {
    el.createEl("h3", { text: "Webhook (optional)" });
    el.createEl("p", {
      text: "Notifies an external system when a push or pull completes. Used by Dogent Studio to start a run automatically.",
      cls: "setting-item-description",
    });

    new Setting(el)
      .setName("URL")
      .setDesc("HTTPS endpoint that receives a POST after each sync.")
      .addText((t) =>
        t.setValue(this.plugin.settings.webhook.url).onChange(async (v) => {
          this.plugin.settings.webhook.url = v.trim();
          await this.plugin.saveSettings();
        })
      );
    new Setting(el)
      .setName("Shared secret")
      .setDesc("Sent as `X-Dogent-Secret` header. Use to verify the request on the receiving side.")
      .addText((t) => {
        t.inputEl.type = "password";
        t.setValue(this.plugin.settings.webhook.secret).onChange(async (v) => {
          this.plugin.settings.webhook.secret = v.trim();
          await this.plugin.saveSettings();
        });
      });
  }

  private renderLog(el: HTMLElement): void {
    el.createEl("h3", { text: "Recent activity" });
    const log = this.plugin.settings.log;
    if (log.length === 0) {
      el.createEl("p", { text: "No syncs yet.", cls: "setting-item-description" });
      return;
    }
    const list = el.createEl("ul");
    for (const entry of log.slice(0, 10)) {
      const li = list.createEl("li");
      const when = new Date(entry.at).toLocaleString();
      const status = entry.success ? "✓" : "✗";
      li.setText(
        `${status} ${entry.kind} · ${entry.fileCount} files · ${when}` +
          (entry.error ? ` · ${entry.error}` : "")
      );
    }
  }

  private renderGDrive(el: HTMLElement, cfg: GDriveConfig): void {
    el.createEl("h3", { text: "Google Drive settings" });

    new Setting(el)
      .setName("OAuth Client ID")
      .setDesc("From Google Cloud Console > OAuth Client (Desktop app type).")
      .addText((t) =>
        t.setValue(cfg.clientId).onChange(async (v) => {
          cfg.clientId = v.trim();
          await this.plugin.saveSettings();
        })
      );

    const signedIn = !!cfg.refreshToken;
    new Setting(el)
      .setName(signedIn ? "Signed in" : "Sign in to Google")
      .setDesc(signedIn ? "Re-authenticate to refresh permissions." : "Opens your browser to grant access.")
      .addButton((b) =>
        b.setButtonText(signedIn ? "Re-sign in" : "Sign in").onClick(async () => {
          if (!cfg.clientId) {
            new Notice("Enter the OAuth Client ID first.");
            return;
          }
          await this.startGDriveSignIn(cfg);
          this.display();
        })
      );

    if (!signedIn) return;

    new Setting(el)
      .setName("Sync folder")
      .setDesc(
        cfg.folderId
          ? `Currently using: ${cfg.folderName} (${cfg.folderId})`
          : "No folder selected. Create one or pick an existing app folder."
      )
      .addButton((b) =>
        b.setButtonText("Create new folder").onClick(async () => {
          const name = await prompt("Folder name", "Obsidian Vault");
          if (!name) return;
          try {
            const backend = new GDriveBackend(cfg, this.plugin.gdriveTokenSink);
            const f = await backend.createSyncFolder(name);
            cfg.folderId = f.id;
            cfg.folderName = f.name;
            await this.plugin.saveSettings();
            new Notice(`Created folder: ${f.name}`);
            this.display();
          } catch (e) {
            new Notice(`Failed: ${(e as Error).message}`);
          }
        })
      )
      .addButton((b) =>
        b.setButtonText("Pick existing").onClick(async () => {
          try {
            const backend = new GDriveBackend(cfg, this.plugin.gdriveTokenSink);
            const folders = await backend.listAppFolders();
            if (folders.length === 0) {
              new Notice("No app-accessible folders found. Create one first.");
              return;
            }
            const choice = await prompt(
              "Folder ID (copy from list below)\n" +
                folders.map((f) => `${f.name}: ${f.id}`).join("\n"),
              folders[0].id
            );
            if (!choice) return;
            const found = folders.find((f) => f.id === choice.trim());
            if (!found) {
              new Notice("Folder ID not found in list.");
              return;
            }
            cfg.folderId = found.id;
            cfg.folderName = found.name;
            await this.plugin.saveSettings();
            this.display();
          } catch (e) {
            new Notice(`Failed: ${(e as Error).message}`);
          }
        })
      );
  }

  private async startGDriveSignIn(cfg: GDriveConfig): Promise<void> {
    const verifier = generateVerifier();
    const state = generateState();

    const result = await new Promise<OAuthResult>((resolve, reject) => {
      this.plugin.pendingGDriveAuth = { state, verifier, clientId: cfg.clientId, resolve, reject };
      const url = buildAuthUrl(cfg.clientId, verifier, state);
      window.open(url);
      new Notice("Complete sign-in in your browser, then return to Obsidian.");
      setTimeout(() => {
        if (this.plugin.pendingGDriveAuth?.state === state) {
          this.plugin.pendingGDriveAuth = null;
          reject(new Error("Sign-in timed out"));
        }
      }, 5 * 60 * 1000);
    });

    cfg.accessToken = result.accessToken;
    cfg.refreshToken = result.refreshToken;
    cfg.expiresAt = result.expiresAt;
    await this.plugin.saveSettings();
    new Notice("Signed in to Google Drive.");
  }

  private renderGit(el: HTMLElement, cfg: GitConfig): void {
    el.createEl("h3", { text: "Git settings" });

    new Setting(el)
      .setName("Repository URL")
      .setDesc("HTTPS URL. Example: https://github.com/you/my-vault.git")
      .addText((t) =>
        t.setValue(cfg.repoUrl).onChange(async (v) => {
          cfg.repoUrl = v.trim();
          await this.plugin.saveSettings();
        })
      );
    new Setting(el).setName("Branch").addText((t) =>
      t.setValue(cfg.branch).onChange(async (v) => {
        cfg.branch = v.trim() || "main";
        await this.plugin.saveSettings();
      })
    );
    new Setting(el)
      .setName("Path inside repo")
      .setDesc("Leave empty for repo root. Example: vault/")
      .addText((t) =>
        t.setValue(cfg.pathInRepo).onChange(async (v) => {
          cfg.pathInRepo = v.trim();
          await this.plugin.saveSettings();
        })
      );
    new Setting(el)
      .setName("Personal Access Token")
      .setDesc("GitHub PAT with repo write access. Stored locally in plain text.")
      .addText((t) => {
        t.inputEl.type = "password";
        t.setValue(cfg.token).onChange(async (v) => {
          cfg.token = v.trim();
          await this.plugin.saveSettings();
        });
      });
    new Setting(el).setName("Commit author name").addText((t) =>
      t.setValue(cfg.authorName).onChange(async (v) => {
        cfg.authorName = v.trim();
        await this.plugin.saveSettings();
      })
    );
    new Setting(el).setName("Commit author email").addText((t) =>
      t.setValue(cfg.authorEmail).onChange(async (v) => {
        cfg.authorEmail = v.trim();
        await this.plugin.saveSettings();
      })
    );
  }

  private renderS3(el: HTMLElement, cfg: S3Config): void {
    el.createEl("h3", { text: "S3 settings" });

    new Setting(el).setName("Access Key ID").addText((t) =>
      t.setValue(cfg.accessKeyId).onChange(async (v) => {
        cfg.accessKeyId = v.trim();
        await this.plugin.saveSettings();
      })
    );
    new Setting(el).setName("Secret Access Key").addText((t) => {
      t.inputEl.type = "password";
      t.setValue(cfg.secretAccessKey).onChange(async (v) => {
        cfg.secretAccessKey = v.trim();
        await this.plugin.saveSettings();
      });
    });
    new Setting(el).setName("Region").addText((t) =>
      t.setValue(cfg.region).onChange(async (v) => {
        cfg.region = v.trim();
        await this.plugin.saveSettings();
      })
    );
    new Setting(el).setName("Bucket").addText((t) =>
      t.setValue(cfg.bucket).onChange(async (v) => {
        cfg.bucket = v.trim();
        await this.plugin.saveSettings();
      })
    );
    new Setting(el)
      .setName("Prefix (folder inside the bucket)")
      .setDesc("Leave empty for the bucket root. Example: my-vault/")
      .addText((t) =>
        t.setValue(cfg.prefix).onChange(async (v) => {
          cfg.prefix = v.trim();
          await this.plugin.saveSettings();
        })
      );
    new Setting(el)
      .setName("Custom endpoint (optional)")
      .setDesc("For S3-compatible services like R2, MinIO. Leave empty for AWS.")
      .addText((t) =>
        t.setValue(cfg.endpoint ?? "").onChange(async (v) => {
          cfg.endpoint = v.trim() || undefined;
          await this.plugin.saveSettings();
        })
      );
  }
}

function blankS3(): S3Config {
  return {
    kind: "s3",
    accessKeyId: "",
    secretAccessKey: "",
    region: "us-east-1",
    bucket: "",
    prefix: "",
  };
}

function blankGit(): GitConfig {
  return {
    kind: "git",
    repoUrl: "",
    branch: "main",
    pathInRepo: "",
    token: "",
    authorName: "Obsidian Multi Sync",
    authorEmail: "multi-sync@obsidian.local",
  };
}

function blankGDrive(): GDriveConfig {
  return {
    kind: "gdrive",
    clientId: "",
    folderId: "",
    folderName: "",
    accessToken: "",
    refreshToken: "",
    expiresAt: 0,
  };
}

async function prompt(message: string, def = ""): Promise<string | null> {
  const v = window.prompt(message, def);
  return v === null ? null : v;
}

export function backendLabel(kind: BackendKind | "none"): string {
  switch (kind) {
    case "s3":
      return "S3";
    case "git":
      return "Git";
    case "gdrive":
      return "Google Drive";
    default:
      return "Not configured";
  }
}
