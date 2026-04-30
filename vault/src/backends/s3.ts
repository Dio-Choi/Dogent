import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  GetObjectCommand,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { DOGENT_VAULT_SUBDIR, FileEntry, S3Config, StorageBackend } from "../types";

export class S3Backend implements StorageBackend {
  readonly kind = "s3" as const;
  private client: S3Client;

  constructor(private config: S3Config) {
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async push(files: FileEntry[]): Promise<void> {
    const prefix = this.normalizedPrefix();

    const existingKeys = await this.listKeys(prefix);
    const incomingKeys = new Set(files.map((f) => prefix + f.path));

    for (const f of files) {
      const key = prefix + f.path;
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.config.bucket,
          Key: key,
          Body: new Uint8Array(f.data),
        })
      );
    }

    const toDelete = existingKeys.filter((k) => !incomingKeys.has(k));
    if (toDelete.length > 0) {
      const chunks = chunk(toDelete, 1000);
      for (const c of chunks) {
        await this.client.send(
          new DeleteObjectsCommand({
            Bucket: this.config.bucket,
            Delete: { Objects: c.map((Key) => ({ Key })) },
          })
        );
      }
    }
  }

  async pull(): Promise<FileEntry[]> {
    const prefix = this.normalizedPrefix();
    const keys = await this.listKeys(prefix);
    const entries: FileEntry[] = [];

    for (const key of keys) {
      const res = await this.client.send(
        new GetObjectCommand({ Bucket: this.config.bucket, Key: key })
      );
      const buf = await streamToArrayBuffer(res.Body as unknown as ReadableStream<Uint8Array>);
      entries.push({ path: key.slice(prefix.length), data: buf });
    }
    return entries;
  }

  private normalizedPrefix(): string {
    return `${DOGENT_VAULT_SUBDIR}/`;
  }

  private async listKeys(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    let token: string | undefined;
    do {
      const res = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.config.bucket,
          Prefix: prefix,
          ContinuationToken: token,
        })
      );
      for (const obj of res.Contents ?? []) {
        if (obj.Key) keys.push(obj.Key);
      }
      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
    return keys;
  }
}

async function streamToArrayBuffer(stream: ReadableStream<Uint8Array>): Promise<ArrayBuffer> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.byteLength;
    }
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out.buffer;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
