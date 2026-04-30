export type DeployTarget = "vercel" | "aws-s3" | "none";

export interface ProjectRecord {
  id: string;
  name: string;
  vaultId: string;
  rootPath: string;
  deploy: {
    target: DeployTarget;
    vercelProject?: string;
    awsBucket?: string;
    awsRegion?: string;
  };
  createdAt: string;
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

export const VAULT_SUBDIR = "vault";
export const CODE_SUBDIR = "code";

export function vaultPath(p: ProjectRecord): string {
  return `${p.rootPath}/${VAULT_SUBDIR}`;
}

export function codePath(p: ProjectRecord): string {
  return `${p.rootPath}/${CODE_SUBDIR}`;
}
