export type BackendKind = "s3" | "git" | "gdrive";

export interface S3Backend {
  kind: "s3";
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  bucket: string;
  prefix: string;
  endpoint?: string;
}

export interface GitBackend {
  kind: "git";
  repoUrl: string;
  branch: string;
  pathInRepo: string;
  token: string;
}

export interface GDriveBackend {
  kind: "gdrive";
  folderId: string;
}

export type Backend = S3Backend | GitBackend | GDriveBackend;

export type DeployTarget = "vercel" | "aws-s3" | "none";

export interface ProjectRecord {
  id: string;
  name: string;
  vaultId: string;
  backend: Backend;
  localPath: string;
  deploy: {
    target: DeployTarget;
    vercelProject?: string;
    awsBucket?: string;
    awsRegion?: string;
  };
  createdAt: string;
  lastPulledAt?: string;
}

export interface ProjectStore {
  projects: ProjectRecord[];
}

export interface SecretsShape {
  anthropicApiKey?: string;
  vercelToken?: string;
  awsAccessKeyId?: string;
  awsSecretAccessKey?: string;
}
