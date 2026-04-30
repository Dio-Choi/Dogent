import { requestUrl } from "obsidian";
import { WebhookSettings } from "./types";

export interface WebhookPayload {
  event: "push" | "pull";
  vaultId: string;
  vaultName: string;
  backend: "s3" | "git" | "gdrive";
  fileCount: number;
  at: string;
}

export async function fireWebhook(settings: WebhookSettings, payload: WebhookPayload): Promise<void> {
  if (!settings.url) return;
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (settings.secret) {
    headers["X-Dogent-Secret"] = settings.secret;
  }
  await requestUrl({ url: settings.url, method: "POST", headers, body, throw: false });
}
