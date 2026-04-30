import { BackendConfig, StorageBackend } from "../types";
import { S3Backend } from "./s3";
import { GitBackend } from "./git";
import { GDriveBackend, GDriveTokenSink } from "./gdrive";

export function createBackend(config: BackendConfig, gdriveTokenSink: GDriveTokenSink): StorageBackend {
  switch (config.kind) {
    case "s3":
      return new S3Backend(config);
    case "git":
      return new GitBackend(config);
    case "gdrive":
      return new GDriveBackend(config, gdriveTokenSink);
  }
}
