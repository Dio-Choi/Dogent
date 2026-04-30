import { useState } from "react";
import type { ProjectRecord, Backend, BackendKind, DeployTarget } from "@shared/project";

interface Props {
  initial?: ProjectRecord;
  onSave: (p: ProjectRecord) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => Promise<void>;
}

export function ProjectFormModal({ initial, onSave, onCancel, onDelete }: Props): JSX.Element {
  const [name, setName] = useState(initial?.name ?? "");
  const [vaultId, setVaultId] = useState(initial?.vaultId ?? "");
  const [localPath, setLocalPath] = useState(initial?.localPath ?? "");
  const [backend, setBackend] = useState<Backend>(initial?.backend ?? blankBackend("s3"));
  const [deployTarget, setDeployTarget] = useState<DeployTarget>(initial?.deploy.target ?? "none");
  const [vercelProject, setVercelProject] = useState(initial?.deploy.vercelProject ?? "");
  const [awsBucket, setAwsBucket] = useState(initial?.deploy.awsBucket ?? "");
  const [awsRegion, setAwsRegion] = useState(initial?.deploy.awsRegion ?? "us-east-1");

  const pickDir = async (): Promise<void> => {
    const dir = await window.dogent.dialog.pickDirectory();
    if (dir) setLocalPath(dir);
  };

  const save = async (): Promise<void> => {
    if (!name.trim() || !localPath.trim()) return;
    const record: ProjectRecord = {
      id: initial?.id ?? crypto.randomUUID(),
      name: name.trim(),
      vaultId: vaultId.trim(),
      backend,
      localPath: localPath.trim(),
      deploy: {
        target: deployTarget,
        vercelProject: vercelProject.trim() || undefined,
        awsBucket: awsBucket.trim() || undefined,
        awsRegion: awsRegion.trim() || undefined,
      },
      createdAt: initial?.createdAt ?? new Date().toISOString(),
      lastPulledAt: initial?.lastPulledAt,
    };
    await onSave(record);
  };

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{initial ? "Edit project" : "New project"}</h2>

        <div className="field">
          <div className="label">Project name</div>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="My App" />
        </div>

        <div className="field">
          <div className="label">Vault ID (optional, from Obsidian plugin settings)</div>
          <input value={vaultId} onChange={(e) => setVaultId(e.target.value)} placeholder="UUID" />
        </div>

        <div className="field">
          <div className="label">Local working directory</div>
          <div className="row">
            <input value={localPath} onChange={(e) => setLocalPath(e.target.value)} placeholder="/path/to/folder" />
            <button onClick={pickDir}>Pick</button>
          </div>
        </div>

        <div className="field">
          <div className="label">Vault backend</div>
          <select
            value={backend.kind}
            onChange={(e) => setBackend(blankBackend(e.target.value as BackendKind))}
          >
            <option value="s3">Amazon S3 (or compatible)</option>
            <option value="git">Git (read-only via clone — coming soon)</option>
            <option value="gdrive">Google Drive (coming soon)</option>
          </select>
        </div>

        {backend.kind === "s3" && <S3Fields backend={backend} setBackend={setBackend} />}

        <h3 style={{ marginTop: 18 }}>Deploy</h3>
        <div className="field">
          <div className="label">Target</div>
          <select value={deployTarget} onChange={(e) => setDeployTarget(e.target.value as DeployTarget)}>
            <option value="none">None</option>
            <option value="vercel">Vercel</option>
            <option value="aws-s3">AWS S3 (static site)</option>
          </select>
        </div>

        {deployTarget === "vercel" && (
          <div className="field">
            <div className="label">Vercel project name (optional)</div>
            <input value={vercelProject} onChange={(e) => setVercelProject(e.target.value)} />
          </div>
        )}

        {deployTarget === "aws-s3" && (
          <>
            <div className="field">
              <div className="label">S3 bucket</div>
              <input value={awsBucket} onChange={(e) => setAwsBucket(e.target.value)} />
            </div>
            <div className="field">
              <div className="label">Region</div>
              <input value={awsRegion} onChange={(e) => setAwsRegion(e.target.value)} />
            </div>
          </>
        )}

        <div className="row" style={{ marginTop: 18 }}>
          {onDelete && (
            <button className="danger" onClick={onDelete}>Delete</button>
          )}
          <div style={{ flex: 1 }} />
          <button onClick={onCancel}>Cancel</button>
          <button className="primary" onClick={save}>Save</button>
        </div>
      </div>
    </div>
  );
}

function S3Fields({
  backend,
  setBackend,
}: {
  backend: Backend & { kind: "s3" };
  setBackend: (b: Backend) => void;
}): JSX.Element {
  const upd = (k: keyof typeof backend, v: string): void => {
    setBackend({ ...backend, [k]: v });
  };
  return (
    <>
      <div className="field">
        <div className="label">Access Key ID</div>
        <input value={backend.accessKeyId} onChange={(e) => upd("accessKeyId", e.target.value)} />
      </div>
      <div className="field">
        <div className="label">Secret Access Key</div>
        <input
          type="password"
          value={backend.secretAccessKey}
          onChange={(e) => upd("secretAccessKey", e.target.value)}
        />
      </div>
      <div className="field">
        <div className="label">Region</div>
        <input value={backend.region} onChange={(e) => upd("region", e.target.value)} />
      </div>
      <div className="field">
        <div className="label">Bucket</div>
        <input value={backend.bucket} onChange={(e) => upd("bucket", e.target.value)} />
      </div>
      <div className="field">
        <div className="label">Prefix</div>
        <input value={backend.prefix} onChange={(e) => upd("prefix", e.target.value)} />
      </div>
      <div className="field">
        <div className="label">Endpoint (optional)</div>
        <input value={backend.endpoint ?? ""} onChange={(e) => upd("endpoint", e.target.value)} />
      </div>
    </>
  );
}

function blankBackend(kind: BackendKind): Backend {
  if (kind === "s3") {
    return {
      kind: "s3",
      accessKeyId: "",
      secretAccessKey: "",
      region: "us-east-1",
      bucket: "",
      prefix: "",
    };
  }
  if (kind === "git") {
    return { kind: "git", repoUrl: "", branch: "main", pathInRepo: "", token: "" };
  }
  return { kind: "gdrive", folderId: "" };
}
