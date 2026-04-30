# Dogent Vault

Obsidian plugin that syncs your vault to your own storage. Part of the [Dogent](../) document-driven AI system.

- **No servers.** You connect your own S3 bucket, Git repo, or Google Drive.
- **Manual push/pull.** No background sync, no surprises. You decide when to upload or pull down.
- **One backend at a time.** Pick the one that fits your workflow.

## Backends

| Backend | Status | Notes |
| --- | --- | --- |
| Amazon S3 (and compatible: R2, MinIO, …) | ✅ | Access key + secret + bucket + optional prefix |
| Git (HTTPS) | ✅ | Token-authenticated. Auto commit message: `Sync YYYY-MM-DD HH:mm` |
| Google Drive | ✅ | OAuth (PKCE). Bring your own OAuth Client ID |

## How it works

- **Push** uploads every file in your vault to the configured location, deleting anything on the remote that no longer exists locally.
- **Pull** downloads everything from the remote and overwrites your local vault. Files that exist locally but not remotely are deleted. A confirmation prompt protects you from accidental data loss.
- `.obsidian/workspace.json` and similar volatile files are excluded by default.

## Building

```bash
npm install
npm run build
```

The output is `main.js`. Together with `manifest.json`, copy these into `<your-vault>/.obsidian/plugins/dogent-vault/` to install manually.

## Google Drive setup

Drive needs a one-time setup because Dogent uses **your** OAuth client (no shared backend, no shared quota).

1. Go to [Google Cloud Console](https://console.cloud.google.com).
2. Create a project.
3. APIs & Services → Library → enable **Google Drive API**.
4. APIs & Services → OAuth consent screen → External, add your email as a test user.
5. APIs & Services → Credentials → Create Credentials → **OAuth client ID** → Application type: **Desktop app**.
6. Copy the client ID into the plugin settings.
7. Click **Sign in**. Your browser opens, you grant access, Obsidian regains focus, you're done.

The plugin uses the `drive.file` scope, which means it can only see files it created or that you explicitly select. It cannot read the rest of your Drive.
