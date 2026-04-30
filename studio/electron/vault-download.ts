import fs from "fs";
import path from "path";
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import type { ProjectRecord } from "../shared/project";

export async function downloadVault(
  project: ProjectRecord
): Promise<{ fileCount: number; localPath: string }> {
  if (!project.localPath) throw new Error("Project has no local path");
  ensureDir(project.localPath);

  switch (project.backend.kind) {
    case "s3":
      return await pullS3(project);
    case "git":
      throw new Error("Git pull from Studio not implemented yet — use the Obsidian plugin to push, then add the same git URL here as 's3' if mirrored, or run a git clone manually for now.");
    case "gdrive":
      throw new Error("Google Drive pull from Studio not implemented yet");
  }
}

async function pullS3(project: ProjectRecord): Promise<{ fileCount: number; localPath: string }> {
  if (project.backend.kind !== "s3") throw new Error("Not S3");
  const cfg = project.backend;
  const client = new S3Client({
    region: cfg.region,
    endpoint: cfg.endpoint,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
  });

  const prefix = normalizePrefix(cfg.prefix);
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const res = await client.send(
      new ListObjectsV2Command({ Bucket: cfg.bucket, Prefix: prefix, ContinuationToken: token })
    );
    for (const obj of res.Contents ?? []) if (obj.Key) keys.push(obj.Key);
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);

  for (const key of keys) {
    const rel = key.slice(prefix.length);
    const dest = path.join(project.localPath, rel);
    ensureDir(path.dirname(dest));
    const res = await client.send(new GetObjectCommand({ Bucket: cfg.bucket, Key: key }));
    const buf = await streamToBuffer(res.Body as NodeJS.ReadableStream);
    fs.writeFileSync(dest, buf);
  }

  return { fileCount: keys.length, localPath: project.localPath };
}

function normalizePrefix(p: string): string {
  let v = p.trim();
  if (v === "" || v === "/") return "";
  if (v.startsWith("/")) v = v.slice(1);
  if (!v.endsWith("/")) v += "/";
  return v;
}

function ensureDir(d: string): void {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  return Buffer.concat(chunks);
}
